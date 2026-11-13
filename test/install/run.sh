#!/bin/sh
# BeeRoom install test. Runs on a host with LXD (and Node 22 at /usr/bin/node):
# fresh system containers without network, the real beeroom.sh with a
# test-signed release, one container per case. The host is not changed.
#
#   test/install/run.sh <kit dir> <test public key> [case ...]
#
# Kit dir: rel/ (release.json, .sig, bundle), beeircd (linux program),
# beeroom.sh, wsprobe.mjs, debs/apache2|nginx|caddy/*.deb (Ubuntu 24.04).
# Cases: apache nginx caddy none remote (default: all).
set -eu
kit=$1 key=$2
shift 2
[ $# -gt 0 ] || set -- apache nginx caddy none remote
pw="install-test-$(date +%s)"
fail=0
say() { echo "--- $*"; }
bad() { echo "FAIL $*"; fail=1; }

# bee_install CT: BeeIRCd standalone, self-signed, plain 6667 + TLS 6697.
bee_install() {
	printf 'irc.clean.test\nCleanNet\nBee\n%s\n%s\n*@127.0.0.1\n6667 6697\n2\n1\n1\nn\ny\ny\n' "$pw" "$pw" |
		lxc exec "$1" -- /root/beeircd install >"$kit/$1-beeircd.log" 2>&1 || { bad "beeircd install ($1)"; tail -20 "$kit/$1-beeircd.log"; }
	grep -q "beeroom.sh | sudo sh" "$kit/$1-beeircd.log" || bad "beeircd install shows no BeeRoom hint"
}

# beeroom CT ANSWERS: runs the real starter script.
beeroom() {
	printf "$2" | lxc exec "$1" --env BEEROOM_URL=file:///root/rel --env BEEROOM_TEST_KEY="$key" --env BEEROOM_STDIN=1 -- sh /root/beeroom.sh
}

# http CT PORT HOST: the page title through a web server (no curl in the images).
http() {
	lxc exec "$1" -- bash -c "exec 3<>/dev/tcp/127.0.0.1/$2; printf 'GET / HTTP/1.0\r\nHost: $3\r\n\r\n' >&3; cat <&3"
}

# realip CT PORT HOST [noxff]: a visitor from 127.0.0.5 with a made-up
# X-Forwarded-For joins IRC; BeeIRCd must log 127.0.0.5 (real IP over WEBIRC,
# fake ignored). noxff: straight to BeeRoom, no proxy, so no header sent.
realip() {
	lxc exec "$1" -- node /root/wsprobe.mjs 127.0.0.1 "$2" "$3" 127.0.0.5 "probe$2" ${4:-} || bad "websocket ($1)"
	sleep 2
	lxc exec "$1" -- journalctl -u beeircd --no-pager | grep -E "webirc beeroom" | tail -1
	if lxc exec "$1" -- journalctl -u beeircd --no-pager | grep -q "webirc beeroom: .* is 127.0.0.5 "; then
		echo "real IP 127.0.0.5 reached BeeIRCd over WEBIRC"
	else
		bad "real IP did not reach BeeIRCd ($1)"
	fi
}

common_checks() {
	ct=$1 port=$2
	lxc exec "$ct" -- systemctl is-active -q beeroom || bad "service not active ($ct)"
	lxc exec "$ct" -- sh -c "ss -ltn | grep -q '127.0.0.1:$port ' && ! ss -ltn | grep -qE '(0.0.0.0|\*|\[::\]):$port '" || bad "BeeRoom not on 127.0.0.1:$port only ($ct)"
	lxc exec "$ct" -- sh -c 'stat -c "%U:%G %a %n" /etc/beeroom /etc/beeroom/config.js /var/lib/beeroom /opt/beeroom; readlink /var/lib/beeroom/config.js; systemd-analyze security beeroom 2>/dev/null | tail -1'
	lxc exec "$ct" -- grep -q "reverseProxy = true" /etc/beeroom/config.js || bad "reverseProxy not on ($ct)"
	lxc exec "$ct" -- beeroom 2>&1 | grep -q "beeroom uninstall" || bad "beeroom command missing ($ct)"
}

launch() {
	ct=$1 image=$2
	lxc delete -f "$ct" >/dev/null 2>&1 || true
	lxc launch -q "$image" "$ct" 2>/dev/null
	for i in $(seq 30); do lxc exec "$ct" -- systemctl is-system-running 2>/dev/null | grep -qE 'running|degraded' && break; sleep 1; done
	lxc file push -q -r "$kit/rel" "$ct/root/"
	lxc file push -q --mode 0755 "$kit/beeircd" "$ct/root/beeircd"
	lxc file push -q "$kit/beeroom.sh" "$kit/wsprobe.mjs" "$ct/root/"
}

with_node() { lxc file push -q --mode 0755 /usr/bin/node "$1/usr/local/bin/node"; }

with_debs() {
	lxc exec "$1" -- mkdir -p /root/debs
	for d in "$kit/debs/$2"/*.deb; do lxc file push -q "$d" "$1/root/debs/"; done
	lxc exec "$1" -- sh -c 'dpkg -i /root/debs/*.deb >/root/dpkg.log 2>&1' || { bad "dpkg $2"; lxc exec "$1" -- tail -5 /root/dpkg.log; }
}

for case in "$@"; do
	ct="brt-$case"
	echo "===== $case"
	case $case in
	apache | nginx | caddy)
		launch "$ct" ubu24
		with_node "$ct"
		deb=$case
		[ $case = apache ] && deb=apache2
		with_debs "$ct" $deb
		bee_install "$ct"
		say "beeroom install"
		beeroom "$ct" '\n\ny\ny\n' || bad "beeroom.sh ($case)"
		common_checks "$ct" 9000
		lxc exec "$ct" -- grep -A4 "^\[\[webirc\]\]" /etc/beeircd/beeircd.conf | grep -q '"127.0.0.1"' || bad "no [[webirc]] beeroom in beeircd.conf"
		lxc exec "$ct" -- sh -c 'cat /etc/beeroom/beeroom.json'
		if [ $case = caddy ]; then
			# No network: Caddy can't get a certificate here, but must answer for the name.
			lxc exec "$ct" -- grep -q "reverse_proxy 127.0.0.1:9000" /etc/caddy/Caddyfile || bad "Caddyfile"
			http "$ct" 80 chat.clean.test | head -1 | grep -qE " 30[18] " && echo "Caddy answers for chat.clean.test (redirect to HTTPS)" || bad "caddy not serving the site"
		else
			http "$ct" 80 chat.clean.test | grep -q "<title>BeeRoom</title>" && echo "$case serves BeeRoom for chat.clean.test" || bad "$case does not serve BeeRoom"
			realip "$ct" 80 chat.clean.test
		fi
		;;
	none)
		launch "$ct" deb13
		say "no Node yet"
		beeroom "$ct" '' 2>&1 | grep "Node.js 22" || bad "no Node message"
		with_node "$ct"
		say "bad signature is refused"
		lxc exec "$ct" -- sh -c 'cp -r /root/rel /root/relbad && echo x >> /root/relbad/release.json'
		printf '' | lxc exec "$ct" --env BEEROOM_URL=file:///root/relbad --env BEEROOM_TEST_KEY="$key" --env BEEROOM_STDIN=1 -- sh /root/beeroom.sh 2>&1 | grep "signature doesn't match" || bad "bad signature not refused"
		printf '' | lxc exec "$ct" --env BEEROOM_URL=file:///root/rel --env BEEROOM_STDIN=1 -- sh /root/beeroom.sh 2>&1 | grep "signature doesn't match" || bad "test key accepted without BEEROOM_TEST_KEY"
		bee_install "$ct"
		say "beeroom install (no web server)"
		out=$(beeroom "$ct" '\n\ny\n' 2>&1) || bad "beeroom.sh (none)"
		echo "$out" | tail -12
		echo "$out" | grep -q "reverse_proxy 127.0.0.1:9000" || bad "no Caddy hint"
		common_checks "$ct" 9000
		realip "$ct" 9000 127.0.0.1 noxff
		say "run again = update"
		beeroom "$ct" 'y\n' | grep -E "is installed here|restarted" || bad "update"
		lxc exec "$ct" -- systemctl is-active -q beeroom || bad "not active after update"
		say "uninstall keeps settings, --purge removes them"
		printf 'y\n' | lxc exec "$ct" -- beeroom uninstall || bad "uninstall"
		lxc exec "$ct" -- sh -c 'test -f /etc/beeroom/config.js && ! test -e /opt/beeroom && ! systemctl cat beeroom >/dev/null 2>&1' || bad "uninstall result"
		beeroom "$ct" '\n\ny\n' >/dev/null 2>&1 || true # state file kept: this is an update of nothing; reinstall below
		printf 'y\n' | lxc exec "$ct" -- sh -c 'node /opt/beeroom/scripts/install.mjs uninstall --purge' || bad "purge"
		lxc exec "$ct" -- sh -c '! test -e /etc/beeroom && ! test -e /var/lib/beeroom && ! id beeroom 2>/dev/null' || bad "purge left things"
		;;
	remote)
		launch "$ct" ubu24
		with_node "$ct"
		say "an IRC server 'elsewhere' (127.0.0.2, not installed as BeeIRCd here)"
		lxc exec "$ct" -- sh -c 'mkdir -p /root/irc && printf "[server]\nname = \"irc.far.test\"\nnetwork = \"FarNet\"\nsid = \"0FA\"\nresolve_hosts = false\n\n[[listen]]\naddress = \"127.0.0.2:6667\"\n\n[cloak]\nsecret = \"0123456789abcdef-far\"\n\n[services]\ndatabase = \"services.db\"\n" > /root/irc/beeircd.conf'
		lxc exec "$ct" -- sh -c 'cd /root/irc && nohup /root/beeircd run -config /root/irc/beeircd.conf >/root/irc/log 2>&1 &'
		sleep 2
		secret=$(lxc exec "$ct" -- /root/beeircd webirc add -q -config /root/irc/beeircd.conf beeroom 127.0.0.1)
		echo "password from beeircd webirc add: $secret"
		out=$(beeroom "$ct" "127.0.0.2:6667\n$secret\n\nchat.far.test\n\ny\n" 2>&1) || bad "beeroom.sh (remote)"
		echo "$out" | grep -E "IRC server|webirc add|Network name|Web chat"
		common_checks "$ct" 9000
		lxc exec "$ct" -- node /root/wsprobe.mjs 127.0.0.1 9000 127.0.0.1 127.0.0.5 probefar noxff || bad "websocket (remote)"
		sleep 2
		grep_log=$(lxc exec "$ct" -- grep "webirc beeroom" /root/irc/log | tail -1)
		echo "$grep_log"
		echo "$grep_log" | grep -q " is 127.0.0.5 " || bad "real IP did not reach the far server"
		;;
	esac
	[ "${KEEP:-}" = 1 ] || lxc delete -f "$ct"
done
[ $fail = 0 ] && echo "BEEROOM INSTALL TEST PASSED" || { echo "BEEROOM INSTALL TEST FAILED"; exit 1; }
