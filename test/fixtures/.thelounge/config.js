"use strict";

const config = require("../../../defaults/config.js");

config.defaults.name = "Example IRC Server";
config.defaults.host = "irc.example.com";
// BeeRoom changed these defaults; the upstream tests expect the stock ones.
config.defaults.port = 6697;
config.defaults.tls = true;
config.defaults.nick = "thelounge%%";
config.defaults.username = "thelounge";
config.defaults.join = "#thelounge";
config.lockNetwork = false;
config.public = true;
config.prefetch = true;
// @ts-ignore
config.host = config.bind = "127.0.0.1";
config.port = 61337;
config.transports = ["websocket"];

module.exports = config;
