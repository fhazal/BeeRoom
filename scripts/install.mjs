// BeeRoom installer. beeroom.sh downloads the signed bundle, checks it and
// runs `node install.mjs install <bundle dir> <version>`. After that the
// `beeroom` command runs this file for `beeroom uninstall`.
//
// It sets up BeeRoom like a careful admin would by hand: its own user and
// systemd service on 127.0.0.1 only, the real IPs passed on (reverse proxy
// headers in, WEBIRC out), and a site for the web server already on the
// machine (Apache, nginx or Caddy), written only after asking.

import {spawnSync} from "node:child_process";
import dgram from "node:dgram";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import readline from "node:readline";

const APP = "/opt/beeroom";
const ETC = "/etc/beeroom";
const DATA = "/var/lib/beeroom";
const STATE = `${ETC}/beeroom.json`;
const UNIT = "/etc/systemd/system/beeroom.service";
const WRAPPER = "/usr/local/bin/beeroom";
const USER = "beeroom";
const BEE_CONF = "/etc/beeircd/beeircd.conf";
const BEE_BINS = ["/usr/local/bin/beeircd", "/opt/beeircd/beeircd"];

// ---- output ----

const tty = process.stdout.isTTY && !process.env.NO_COLOR;
const paint = (code) => (s) => tty ? `\x1b[${code}m${s}\x1b[0m` : s;
const green = paint("32"),
	yellow = paint("33"),
	red = paint("31"),
	dim = paint("2");
const say = (s = "") => process.stdout.write(s + "\n");
const ok = (s) => say(`  ${green("✓")} ${s}`);
const warn = (s) => say(`  ${yellow("!")} ${yellow(s)}`);
const bad = (s) => say(`  ${red("✗")} ${s}`);

class Stop extends Error {}

// ---- input: a line queue, so answers piped in all at once aren't lost ----

const lines = [];
let waiting = null;
let ended = false;
const rl = readline.createInterface({input: process.stdin, terminal: false});
rl.on("line", (l) => (waiting ? (waiting(l), (waiting = null)) : lines.push(l)));
rl.on("close", () => {
	ended = true;

	if (waiting) {
		waiting(null);
	}
});
process.on("SIGINT", () => {
	say("\n  Stopped. Nothing more was changed.");
	process.exit(130);
});

function nextLine() {
	if (lines.length) {
		return Promise.resolve(lines.shift());
	}

	if (ended) {
		return Promise.resolve(null);
	}

	return new Promise((r) => (waiting = r));
}

let qn = 0;

// question asks until check returns "" (check may also change the answer).
async function question(label, def, check = () => "", numbered = true) {
	if (numbered) {
		qn++;
	}

	for (;;) {
		const n = numbered ? `  ${String(qn).padStart(2)}  ` : "      ";
		process.stdout.write(`${n}${label}${def ? ` [${def}]` : ""}: `);
		const line = await nextLine();

		if (line === null) {
			throw new Stop("no more answers");
		}

		const a = line.trim() || def;
		const why = check(a);

		if (!why) {
			return a;
		}

		say(`      ${yellow(why)}`);
	}
}

async function yesNo(q, def, numbered = true) {
	if (numbered) {
		qn++;
	}

	for (;;) {
		const n = numbered ? `  ${String(qn).padStart(2)}  ` : "  ";
		process.stdout.write(`${n}${q} [${def ? "Y/n" : "y/N"}] `);
		const line = await nextLine();

		if (line === null) {
			throw new Stop("no more answers");
		}

		const a = line.trim().toLowerCase();

		if (a === "") {
			return def;
		}

		if (a === "y" || a === "yes") {
			return true;
		}

		if (a === "n" || a === "no") {
			return false;
		}

		say(`      ${yellow("Answer y or n.")}`);
	}
}

// ---- small helpers ----

function run(cmd, args, opts = {}) {
	const r = spawnSync(cmd, args, {encoding: "utf8", ...opts});
	return {ok: r.status === 0, out: `${r.stdout || ""}${r.stderr || ""}`.trim(), error: r.error};
}

const has = (cmd) => run("sh", ["-c", `command -v ${cmd}`]).ok;
const active = (unit) => run("systemctl", ["is-active", "--quiet", unit]).ok;

function backup(file) {
	if (!fs.existsSync(file)) {
		return "";
	}

	const stamp = new Date()
		.toISOString()
		.replace(/[-:]/g, "")
		.replace(/\..*/, "")
		.replace("T", "-");
	const to = `${file}.beeroom-backup-${stamp}`;
	fs.copyFileSync(file, to);
	return to;
}

function writeFile(file, text, mode, group) {
	fs.mkdirSync(path.dirname(file), {recursive: true});
	fs.writeFileSync(file, text, {mode});
	fs.chmodSync(file, mode);

	if (group) {
		run("chown", [`root:${group}`, file]);
	}
}

const hostRe = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z][a-z0-9-]{0,62}$/i;

function portFree(port) {
	return new Promise((resolve) => {
		const s = net.createServer();
		s.once("error", () => resolve(false));
		s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
	});
}

async function freePort(from) {
	for (let p = from; p < from + 100; p++) {
		if (await portFree(p)) {
			return p;
		}
	}

	throw new Error(`no free port between ${from} and ${from + 99} on 127.0.0.1`);
}

function answers(port, ms) {
	return new Promise((resolve) => {
		const end = Date.now() + ms;

		const tryOnce = () => {
			const c = net.connect(port, "127.0.0.1");
			c.once("connect", () => (c.destroy(), resolve(true)));
			c.once("error", () => (Date.now() > end ? resolve(false) : setTimeout(tryOnce, 500)));
		};

		tryOnce();
	});
}

// The address this machine talks to host from: what the IRC server sees.
function localIPFor(host, port) {
	return new Promise((resolve) => {
		const s = dgram.createSocket(host.includes(":") ? "udp6" : "udp4");
		s.once("error", () => (s.close(), resolve("")));
		s.connect(port, host, () => {
			const a = s.address().address;
			s.close();
			resolve(a);
		});
	});
}

// ---- BeeIRCd on this machine ----

function findBeeIRCd() {
	if (!fs.existsSync(BEE_CONF)) {
		return null;
	}

	const bin = BEE_BINS.find((b) => fs.existsSync(b));

	if (!bin) {
		return null;
	}

	const text = fs.readFileSync(BEE_CONF, "utf8");
	const server = (text.split(/^\s*\[(?!\[)/m)[1] || "").replace(/^[^\n]*\n/, "");
	const pick = (re, from = server) => (from.match(re) || [])[1] || "";
	const name = pick(/^\s*name\s*=\s*"([^"]*)"/m);
	const network = pick(/^\s*network\s*=\s*"([^"]*)"/m) || "IRC";
	// [[listen]] blocks: the first plain port, else the first TLS one.
	const listens = text
		.split(/^\s*\[\[listen\]\]\s*$/m)
		.slice(1)
		.map((b) => b.split(/^\s*\[/m)[0])
		.map((b) => ({
			address: pick(/^\s*address\s*=\s*"([^"]*)"/m, b),
			tls: /^\s*tls\s*=\s*true/m.test(b),
		}))
		.filter((l) => l.address);
	const l = listens.find((x) => !x.tls) || listens[0];

	if (!l) {
		return null;
	}

	const at = l.address.lastIndexOf(":");
	let host = l.address.slice(0, at).replace(/^\[|\]$/g, "");

	if (!host || host === "0.0.0.0" || host === "::") {
		host = "127.0.0.1";
	}

	const ws = text.match(/^\s*\[\[webirc\]\][\s\S]*?name\s*=\s*"beeroom"/im);
	return {
		bin,
		name,
		network,
		host,
		port: Number(l.address.slice(at + 1)),
		tls: l.tls,
		hasBeeroomBlock: !!ws,
	};
}

// ---- web servers ----

const WEB = {
	apache: {label: "Apache", units: ["apache2", "httpd"], certbot: "--apache"},
	nginx: {label: "nginx", units: ["nginx"], certbot: "--nginx"},
	caddy: {label: "Caddy", units: ["caddy"], certbot: ""},
};

function findWeb() {
	for (const [kind, w] of Object.entries(WEB)) {
		const unit = w.units.find((u) => active(u));

		if (unit) {
			return {kind, unit, ...w};
		}
	}

	return null;
}

const caddyBlock = (addr, port) =>
	`\n# BeeRoom web chat, written by the BeeRoom installer.\n${addr} {\n\treverse_proxy 127.0.0.1:${port}\n}\n`;

function siteFor(web, addr, port) {
	const head = `# BeeRoom web chat, written by the BeeRoom installer.\n`;

	if (web.kind === "apache") {
		const debian = fs.existsSync("/etc/apache2/sites-available");
		return {
			file: debian
				? `/etc/apache2/sites-available/beeroom-${addr}.conf`
				: `/etc/httpd/conf.d/beeroom-${addr}.conf`,
			debian,
			text:
				head +
				`# certbot --apache makes the HTTPS copy of it.\n` +
				`<VirtualHost *:80>\n` +
				`    ServerName ${addr}\n` +
				`    ProxyPreserveHost On\n` +
				`    RequestHeader set X-Forwarded-Proto "expr=%{REQUEST_SCHEME}"\n` +
				`    ProxyPass /.well-known/acme-challenge/ !\n` +
				`    ProxyPass / http://127.0.0.1:${port}/\n` +
				`    ProxyPassReverse / http://127.0.0.1:${port}/\n` +
				`    RewriteEngine On\n` +
				`    RewriteCond %{HTTP:Upgrade} =websocket [NC]\n` +
				`    RewriteRule /(.*) ws://127.0.0.1:${port}/$1 [P,L]\n` +
				`</VirtualHost>\n`,
		};
	}

	if (web.kind === "nginx") {
		const debian = fs.existsSync("/etc/nginx/sites-available");
		return {
			file: debian
				? `/etc/nginx/sites-available/beeroom-${addr}`
				: `/etc/nginx/conf.d/beeroom-${addr}.conf`,
			debian,
			text:
				head +
				`# certbot --nginx adds HTTPS to it.\n` +
				`server {\n` +
				`    listen 80;\n` +
				`    listen [::]:80;\n` +
				`    server_name ${addr};\n` +
				`    location / {\n` +
				`        proxy_pass http://127.0.0.1:${port};\n` +
				`        proxy_http_version 1.1;\n` +
				`        proxy_set_header Upgrade $http_upgrade;\n` +
				`        proxy_set_header Connection "upgrade";\n` +
				`        proxy_set_header Host $host;\n` +
				`        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;\n` +
				`        proxy_set_header X-Forwarded-Proto $scheme;\n` +
				`        proxy_read_timeout 1d;\n` +
				`    }\n` +
				`}\n`,
		};
	}

	return {file: "/etc/caddy/Caddyfile", text: caddyBlock(addr, port)};
}

// writeSite writes the site, tests the web server's config and reloads it.
// A failed test puts everything back as it was.
function writeSite(web, site) {
	const saved = backup(site.file);
	const enabled =
		web.kind === "nginx" && site.debian
			? `/etc/nginx/sites-enabled/${path.basename(site.file)}`
			: "";

	if (web.kind === "caddy") {
		fs.appendFileSync(site.file, site.text);
	} else {
		writeFile(site.file, site.text, 0o644);
	}

	if (web.kind === "apache") {
		run("a2enmod", ["-q", "proxy", "proxy_http", "proxy_wstunnel", "rewrite", "headers"]);

		if (site.debian) {
			run("a2ensite", ["-q", path.basename(site.file, ".conf")]);
		}
	}

	if (enabled && !fs.existsSync(enabled)) {
		fs.symlinkSync(site.file, enabled);
	}

	const test = {
		apache: ["apachectl", ["configtest"]],
		nginx: ["nginx", ["-t"]],
		caddy: ["caddy", ["validate", "--config", site.file, "--adapter", "caddyfile"]],
	}[web.kind];
	const t = run(...test);

	if (!t.ok) {
		if (web.kind === "apache" && site.debian) {
			run("a2dissite", ["-q", path.basename(site.file, ".conf")]);
		}

		if (enabled) {
			fs.rmSync(enabled, {force: true});
		}

		if (saved) {
			fs.copyFileSync(saved, site.file);
		} else {
			fs.rmSync(site.file, {force: true});
		}

		return `${web.label} didn't accept the site, so it was taken out again:\n      ${t.out
			.split("\n")
			.slice(-3)
			.join("\n      ")}`;
	}

	const r = run("systemctl", ["reload", web.unit]);
	return r.ok ? "" : `systemctl reload ${web.unit}: ${r.out}`;
}

// ---- files ----

function configJS(s) {
	const q = JSON.stringify;
	return `"use strict";
// BeeRoom settings, written by the BeeRoom installer. Everything not set here
// comes from ${APP}/dist/defaults/config.js, where each setting is explained.
// After a change: systemctl restart beeroom
const config = require("${APP}/dist/defaults/config.js");

// Only this machine; the web server in front passes visitors on.
config.host = "127.0.0.1";
config.port = ${s.port};
config.reverseProxy = true;

// The one IRC network BeeRoom connects to (public mode, locked).
config.defaults.name = ${q(s.network)};
config.defaults.host = ${q(s.ircHost)};
config.defaults.port = ${s.ircPort};
config.defaults.tls = ${s.ircTLS};
config.defaults.rejectUnauthorized = ${s.ircVerify};
config.defaults.join = ${q(s.channels)};

// WEBIRC: tells the IRC server each person's real IP.
config.webirc = {${q(s.ircHost)}: ${q(s.secret)}};

module.exports = config;
`;
}

function unitText(node) {
	return `# Written by the BeeRoom installer. \`beeroom uninstall\` removes it.
[Unit]
Description=BeeRoom web chat
Documentation=https://beeircd.org
After=network-online.target beeircd.service
Wants=network-online.target

[Service]
Type=simple
User=${USER}
Group=${USER}
Environment=THELOUNGE_HOME=${DATA}
Environment=NODE_ENV=production
ExecStart=${node} ${APP}/index.js start
Restart=on-failure
RestartSec=5
UMask=0027
NoNewPrivileges=yes
PrivateTmp=yes
ProtectSystem=strict
ProtectHome=yes
ReadWritePaths=${DATA}
ProtectKernelTunables=yes
ProtectKernelModules=yes
ProtectControlGroups=yes
ProtectKernelLogs=yes
ProtectClock=yes
ProtectHostname=yes
ProtectProc=invisible
PrivateDevices=yes
CapabilityBoundingSet=
AmbientCapabilities=
RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6
RestrictNamespaces=yes
RestrictRealtime=yes
RestrictSUIDSGID=yes
LockPersonality=yes
SystemCallArchitectures=native
SystemCallFilter=@system-service
SystemCallFilter=~@privileged @resources

[Install]
WantedBy=multi-user.target
`;
}

// copyApp puts the bundle in /opt/beeroom, swapping in the new one whole.
function copyApp(from) {
	const next = `${APP}.new`,
		old = `${APP}.old`;
	fs.rmSync(next, {recursive: true, force: true});
	fs.cpSync(from, next, {recursive: true, preserveTimestamps: true});
	run("chown", ["-R", "root:root", next]);
	run("chmod", ["-R", "u=rwX,go=rX", next]);
	fs.rmSync(old, {recursive: true, force: true});

	if (fs.existsSync(APP)) {
		fs.renameSync(APP, old);
	}

	fs.renameSync(next, APP);
	fs.rmSync(old, {recursive: true, force: true});
}

function writeWrapper(node) {
	writeFile(
		WRAPPER,
		`#!/bin/sh\n# BeeRoom: \`beeroom uninstall [--purge]\`. To update, run the installer again.\nexec ${node} ${APP}/scripts/install.mjs "$@"\n`,
		0o755
	);
}

function startService(port) {
	run("systemctl", ["daemon-reload"]);
	const r = run("systemctl", ["enable", "--now", "beeroom.service"]);

	if (!r.ok) {
		throw new Error(`systemctl enable --now beeroom: ${r.out}`);
	}

	run("systemctl", ["restart", "beeroom.service"]);
	return answers(port, 30000);
}

// ---- install ----

async function install(bundle, version) {
	say(`\n  BeeRoom ${version} setup`);
	say(`  Answer each question. Enter keeps the [default]. Ctrl+C stops without changes.\n`);

	if (process.platform !== "linux" || !has("systemctl")) {
		throw new Error("BeeRoom installs on Linux with systemd.");
	}

	if (process.getuid() !== 0) {
		throw new Error("Run it as root (sudo).");
	}

	const node = process.execPath;
	ok(`Node ${process.versions.node} found (${node})`);

	if (/^\/(home|root)\//.test(node)) {
		warn(`Node lives in a home folder; BeeRoom's service can't use it from there.`);
		say(
			`    Install Node for the whole machine (nodejs.org, "Package Manager"), then run this again.`
		);
		return 1;
	}

	if (fs.existsSync(STATE)) {
		return update(bundle, version, node);
	}

	const bee = findBeeIRCd();
	const web = findWeb();

	if (bee) {
		ok(`BeeIRCd found on this machine: ${bee.network}${bee.name ? `, ${bee.name}` : ""}`);
	} else {
		say(`  BeeIRCd is not on this machine.`);
	}

	if (web) {
		warn(`${web.label} uses the web ports here: BeeRoom will sit behind it`);
	} else {
		warn(`No Apache, nginx or Caddy runs here: BeeRoom will print what to add to one`);
	}

	say();

	const s = {channels: "", secret: ""};

	if (bee) {
		Object.assign(s, {
			network: bee.network,
			ircHost: bee.host,
			ircPort: bee.port,
			ircTLS: bee.tls,
			ircVerify: !bee.tls,
		});
	} else {
		const hp = await question("IRC server", "", (a) => {
			const m = /^([^\s:]+|\[[0-9a-f:]+\]):(\d{1,5})$/i.exec(a || "");
			return m && Number(m[2]) > 0 && Number(m[2]) < 65536
				? ""
				: "Give host:port, like irc.example.net:6697";
		});
		const at = hp.lastIndexOf(":");
		Object.assign(s, {
			ircHost: hp.slice(0, at).replace(/^\[|\]$/g, ""),
			ircPort: Number(hp.slice(at + 1)),
		});
		s.ircTLS = s.ircPort !== 6667;
		s.ircVerify = s.ircTLS;
		const me = (await localIPFor(s.ircHost, s.ircPort)) || "<this machine's IP>";
		qn++;
		say(`  ${String(qn).padStart(2)}  WEBIRC password: on the IRC server run`);
		say(`        ${yellow(`sudo beeircd webirc add beeroom ${me}`)}`);
		say(
			`      (${me} is the address the IRC server sees from here; use the right one if it differs)`
		);
		s.secret = await question(
			"and paste the password it prints",
			"",
			(a) =>
				a && a.length >= 16 && !/\s/.test(a)
					? ""
					: "Paste the whole password (16 or more characters, no spaces).",
			false
		);
		const guess = net.isIP(s.ircHost) ? "IRC" : s.ircHost.split(".").slice(-2, -1)[0] || "IRC";
		s.network = await question(
			"Network name",
			guess.charAt(0).toUpperCase() + guess.slice(1),
			(a) => (a ? "" : "Give a name.")
		);
	}

	const base = bee && bee.name ? bee.name : s.ircHost;
	const parts = base.split(".");
	const defAddr = hostRe.test(base)
		? `chat.${parts.length > 2 ? parts.slice(1).join(".") : base}`
		: "";
	s.address = (
		await question("Web chat address", defAddr, (a) =>
			a && hostRe.test(a)
				? ""
				: "Give a name like chat.example.net (it must point at this machine)."
		)
	).toLowerCase();
	s.channels = await question("Channels to join", "#lobby", (a) =>
		a
			.split(/[,\s]+/)
			.filter(Boolean)
			.every((c) => /^[#&][^\s,\x07]{1,63}$/.test(c))
			? ""
			: "Channels start with #, like #lobby or #lobby,#help."
	);
	s.channels = s.channels
		.split(/[,\s]+/)
		.filter(Boolean)
		.join(",");
	let writeIt = false,
		cert = false;

	if (web) {
		writeIt = await yesNo(
			web.kind === "caddy"
				? "Add the site to the Caddyfile (Caddy gets the certificate)?"
				: `Write the ${web.label} site and enable it?`,
			true
		);

		if (writeIt && web.certbot && has("certbot")) {
			cert = await yesNo("Get a certificate with certbot?", true);
		}
	}

	s.port = await freePort(9000);

	say(`\n  Summary`);
	const front = web
		? `${web.label} -> 127.0.0.1:${s.port}`
		: `127.0.0.1:${s.port}, add a web server in front`;
	say(`  ${"Web chat".padEnd(10)} https://${s.address} (${front})`);
	say(
		`  ${"IRC".padEnd(10)} ${s.network} on ${s.ircHost}:${s.ircPort}${
			s.ircTLS ? " (TLS)" : ""
		}, real IPs through WEBIRC`
	);
	say(`  ${"Files".padEnd(10)} ${APP}   config ${ETC}   data ${DATA}`);

	if (!(await yesNo("Install with these settings?", true, false))) {
		throw new Stop("stopped");
	}

	say();

	// From here on things change.
	if (!run("id", [USER]).ok) {
		const r = run("useradd", [
			"--system",
			"--home-dir",
			DATA,
			"--no-create-home",
			"--shell",
			"/usr/sbin/nologin",
			"--user-group",
			USER,
		]);

		if (!r.ok) {
			throw new Error(`useradd ${USER}: ${r.out}`);
		}
	}

	copyApp(bundle);
	ok(`BeeRoom ${version} in ${APP} (signature checked)`);

	if (bee) {
		const r = run(bee.bin, ["webirc", "add", "-q", "beeroom", s.ircHost]);

		if (r.ok) {
			s.secret = r.out.split("\n").pop().trim();
			ok(`beeircd webirc add beeroom ${s.ircHost} (password made, rehashed)`);
		} else if (bee.hasBeeroomBlock) {
			warn(`beeircd.conf already has a [[webirc]] beeroom block.`);
			s.secret = await question(
				"Paste its password (the password = line in that block)",
				"",
				(a) => (a && a.length >= 16 && !/\s/.test(a) ? "" : "Paste the whole password.")
			);
		} else {
			throw new Error(`beeircd webirc add: ${r.out}`);
		}
	}

	fs.mkdirSync(ETC, {recursive: true, mode: 0o750});
	run("chown", [`root:${USER}`, ETC]);
	fs.chmodSync(ETC, 0o750);
	writeFile(`${ETC}/config.js`, configJS(s), 0o640, USER);
	fs.mkdirSync(DATA, {recursive: true, mode: 0o750});
	const link = `${DATA}/config.js`;
	fs.rmSync(link, {force: true});
	fs.symlinkSync(`${ETC}/config.js`, link);
	run("chown", ["-h", `${USER}:${USER}`, DATA, link]);
	fs.chmodSync(DATA, 0o750);
	writeFile(UNIT, unitText(node), 0o644);
	writeWrapper(node);

	if (await startService(s.port)) {
		ok(`service beeroom enabled (127.0.0.1:${s.port} only)`);
	} else {
		warn(`service beeroom enabled but not answering yet: journalctl -u beeroom`);
	}

	const state = {version, address: s.address, port: s.port, web: web ? web.kind : "", site: ""};

	if (web && writeIt) {
		const site = siteFor(web, s.address, s.port);
		const why = writeSite(web, site);

		if (why) {
			warn(why);
		} else {
			state.site = site.file;
			ok(`${web.label} site ${s.address} enabled (${site.file})`);

			if (cert) {
				say(`  certbot ${web.certbot} -d ${s.address} --redirect`);
				const c = spawnSync("certbot", [web.certbot, "-d", s.address, "--redirect"], {
					stdio: "inherit",
				});

				if (c.status === 0) {
					ok(`certificate from certbot for ${s.address}`);
				} else {
					warn(
						`certbot didn't finish; run it again later: certbot ${web.certbot} -d ${s.address} --redirect`
					);
				}
			}
		}
	}

	writeFile(STATE, JSON.stringify(state, null, 2) + "\n", 0o644);

	if (!web) {
		say(
			`\n  No web server in front yet. The easiest is Caddy (it gets the certificate by itself):`
		);
		say(
			`    apt install caddy      then add to /etc/caddy/Caddyfile and run  systemctl reload caddy`
		);
		say(dim(caddyBlock(s.address, s.port).replace(/^\n/, "").replace(/^/gm, "      ")));
	} else if (!writeIt) {
		const site = siteFor(web, s.address, s.port);
		say(`\n  Add this to ${web.label} yourself (${site.file}), then reload it:`);
		say(dim(site.text.replace(/^/gm, "      ")));
	}

	if (!bee) {
		say(
			`\n  ${s.address} must point at this machine (DNS), and ports 80 and 443 must be open.`
		);
	}

	say(`\n  Web chat:  ${yellow(`https://${s.address}`)}   (share this link)\n`);
	return 0;
}

async function update(bundle, version, node) {
	const state = JSON.parse(fs.readFileSync(STATE, "utf8"));
	const msg =
		state.version === version
			? `BeeRoom ${version} is installed here. Install it again?`
			: `BeeRoom ${state.version} is installed here. Update it to ${version}?`;

	if (!(await yesNo(msg, true, false))) {
		throw new Stop("stopped");
	}

	say();
	copyApp(bundle);
	ok(`BeeRoom ${version} in ${APP} (signature checked)`);
	writeFile(UNIT, unitText(node), 0o644);
	writeWrapper(node);

	if (await startService(state.port)) {
		ok(`service beeroom restarted (127.0.0.1:${state.port})`);
	} else {
		warn(`service beeroom restarted but not answering yet: journalctl -u beeroom`);
	}

	state.version = version;
	writeFile(STATE, JSON.stringify(state, null, 2) + "\n", 0o644);
	say(`\n  Web chat:  ${yellow(`https://${state.address}`)}\n`);
	return 0;
}

// ---- uninstall ----

async function uninstall(purge) {
	if (process.getuid() !== 0) {
		throw new Error("Run it as root (sudo).");
	}

	const state = fs.existsSync(STATE) ? JSON.parse(fs.readFileSync(STATE, "utf8")) : {};
	say(
		`\n  This removes the BeeRoom program and service${
			purge ? `, its settings (${ETC}) and data (${DATA})` : ""
		}.`
	);

	if (!(await yesNo("Go ahead?", false, false))) {
		throw new Stop("stopped");
	}

	run("systemctl", ["disable", "--now", "beeroom.service"]);
	fs.rmSync(UNIT, {force: true});
	run("systemctl", ["daemon-reload"]);
	ok("service beeroom stopped and removed");
	fs.rmSync(APP, {recursive: true, force: true});
	fs.rmSync(WRAPPER, {force: true});
	ok(`${APP} removed`);

	if (purge) {
		fs.rmSync(ETC, {recursive: true, force: true});
		fs.rmSync(DATA, {recursive: true, force: true});
		run("userdel", [USER]);
		ok(`${ETC}, ${DATA} and the ${USER} user removed`);
	} else {
		say(`    Kept: ${ETC} and ${DATA} (beeroom uninstall --purge removes them too).`);
	}

	if (state.site) {
		say(
			`    Left alone: the web server site ${state.site}; remove it and reload the web server.`
		);
	}

	say(`    Left alone: [[webirc]] beeroom in beeircd.conf; remove it if no web chat uses it.\n`);
	return 0;
}

// ---- main ----

const [cmd, ...rest] = process.argv.slice(2);
let code = 2;

try {
	if (cmd === "install" && rest.length === 2) {
		code = await install(rest[0], rest[1]);
	} else if (cmd === "uninstall") {
		code = await uninstall(rest.includes("--purge"));
	} else {
		say(
			"Usage: beeroom uninstall [--purge]\nTo install or update BeeRoom: curl -fsSL https://beeircd.org/beeroom.sh | sudo sh"
		);
	}
} catch (e) {
	if (e instanceof Stop) {
		say(`\n  Stopped. Nothing more was changed.`);
		code = 1;
	} else {
		bad(e.message);
		code = 1;
	}
}

rl.close();
process.exit(code);
