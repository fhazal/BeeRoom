#!/bin/sh
# Start of the BeeRoom container: waits until the BeeIRCd container has
# shared the WEBIRC password, puts the settings in /data once, then runs
# BeeRoom as the node user.
set -e

if [ ! -s /link/webirc ] || [ ! -s /link/network ]; then
	echo "Waiting for BeeIRCd (set it up first: docker compose run --rm beeircd install)"
	while [ ! -s /link/webirc ] || [ ! -s /link/network ]; do sleep 3; done
fi

if [ "$(id -u)" = 0 ]; then
	mkdir -p /data
	[ -f /data/config.js ] || cp /opt/beeroom/docker-config.js /data/config.js
	find /data ! -user node -exec chown node:node {} + 2>/dev/null || true
	exec su-exec node:node node /opt/beeroom/index.js start "$@"
fi
[ -f /data/config.js ] || cp /opt/beeroom/docker-config.js /data/config.js
exec node /opt/beeroom/index.js start "$@"
