/* eslint-disable no-console */
// wsprobe: a tiny BeeRoom visitor for the install test. It opens BeeRoom's
// socket through the web server from a chosen local address, sends a made-up
// X-Forwarded-For, and joins the IRC network, so the test can check which IP
// reached the IRC server over WEBIRC.
//
//   node wsprobe.mjs <host> <port> <Host header> <local address> <nick> [noxff]

import crypto from "node:crypto";
import net from "node:net";

const [host, port, vhost, local, nick, noxff] = process.argv.slice(2);
const fake = noxff === "noxff" ? "" : "X-Forwarded-For: 6.6.6.6\r\n";
const sock = net.connect({host, port: Number(port), localAddress: local});
const key = crypto.randomBytes(16).toString("base64");
let buf = Buffer.alloc(0);
let upgraded = false;
const seen = [];

function send(text) {
	const data = Buffer.from(text);
	const mask = crypto.randomBytes(4);
	const head =
		data.length < 126
			? Buffer.from([0x81, 0x80 | data.length])
			: Buffer.from([0x81, 0x80 | 126, data.length >> 8, data.length & 255]);
	const body = Buffer.from(data.map((b, i) => b ^ mask[i % 4]));
	sock.write(Buffer.concat([head, mask, body]));
}

function onMessage(text) {
	seen.push(text.slice(0, 40));

	if (text.startsWith("0")) {
		send("40");
	} else if (text.startsWith('42["init"')) {
		// Signed in (public mode): now the network form may be sent.
		send(
			`42${JSON.stringify([
				"network:new",
				{nick, username: "probe", realname: "probe", join: "#lobby"},
			])}`
		);
	} else if (text === "2") {
		send("3");
	}
}

sock.on("connect", () => {
	sock.write(
		`GET /socket.io/?EIO=4&transport=websocket HTTP/1.1\r\nHost: ${vhost}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n` +
			`Sec-WebSocket-Key: ${key}\r\nSec-WebSocket-Version: 13\r\n${fake}\r\n`
	);
});

sock.on("data", (chunk) => {
	buf = Buffer.concat([buf, chunk]);

	if (!upgraded) {
		const end = buf.indexOf("\r\n\r\n");

		if (end < 0) {
			return;
		}

		const status = buf.subarray(0, buf.indexOf("\r\n")).toString();

		if (!status.includes(" 101 ")) {
			console.log(`FAIL no websocket upgrade: ${status}`);
			process.exit(1);
		}

		upgraded = true;
		buf = buf.subarray(end + 4);
	}

	for (;;) {
		if (buf.length < 2) {
			return;
		}

		let len = buf[1] & 127;
		let off = 2;

		if (len === 126) {
			if (buf.length < 4) {
				return;
			}

			len = buf.readUInt16BE(2);
			off = 4;
		} else if (len === 127) {
			if (buf.length < 10) {
				return;
			}

			len = Number(buf.readBigUInt64BE(2));
			off = 10;
		}

		if (buf.length < off + len) {
			return;
		}

		const op = buf[0] & 15;
		const text = buf.subarray(off, off + len).toString();
		buf = buf.subarray(off + len);

		if (op === 1) {
			onMessage(text);
		}
	}
});

sock.on("error", (e) => {
	console.log(`FAIL ${e.message}`);
	process.exit(1);
});

setTimeout(() => {
	console.log(`websocket OK through ${vhost}: ${seen.join(" | ")}`);
	process.exit(0);
}, 6000);
