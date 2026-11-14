"use strict";
// BeeRoom settings in Docker. Everything not set here comes from
// /opt/beeroom/dist/defaults/config.js, where each setting is explained.
// This file is copied to /data/config.js once; change it there, then
// docker compose restart beeroom.
const fs = require("fs");
const config = require("/opt/beeroom/dist/defaults/config.js");

// BeeIRCd's container shares these two at its start (the beeroom-link volume).
const shared = (name) => fs.readFileSync(`/link/${name}`, "utf8").trim();

// Inside the container on all addresses; compose.yaml publishes it on
// 127.0.0.1 only, for the web server in front, which passes visitors on.
config.host = "0.0.0.0";
config.port = 9000;
config.reverseProxy = true;

// The one IRC network BeeRoom connects to: the beeircd service next to it.
config.defaults.name = shared("network");
config.defaults.host = process.env.BEEROOM_IRC_HOST || "beeircd";
config.defaults.port = Number(process.env.BEEROOM_IRC_PORT || 6697);
config.defaults.tls = (process.env.BEEROOM_IRC_TLS || "true") === "true";
// Only inside the compose network: the certificate is for the public name.
config.defaults.rejectUnauthorized = false;
config.defaults.join = process.env.BEEROOM_CHANNELS || "#lobby";

// The Hive Panel's Chat tab may show BeeRoom: the panel's address as the
// browser sees it (BEEROOM_PANEL in compose.yaml, spaces between several).
config.frameAncestors = (process.env.BEEROOM_PANEL || "http://127.0.0.1:8787 http://localhost:8787")
	.split(/\s+/)
	.filter(Boolean);

// WEBIRC: tells the IRC server each person's real IP.
config.webirc = {[config.defaults.host]: shared("webirc")};

module.exports = config;
