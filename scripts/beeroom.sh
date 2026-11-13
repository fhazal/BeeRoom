#!/bin/sh
# BeeRoom installer starter: checks Node.js, downloads the signed BeeRoom
# bundle, checks its signature and runs the installer inside it, which asks
# its questions and does the rest. Run it again later to update.
#
#   curl -fsSL https://beeircd.org/beeroom.sh | sudo sh
#   wget -qO- https://beeircd.org/beeroom.sh | sudo sh     (no curl here)
#
# BEEROOM_URL overrides where the bundle comes from (a folder holding
# release.json, release.json.sig and beeroom-<version>.tar.gz; file:// for
# test installs). BEEROOM_TEST_KEY trusts one more signing key (tests only).
# BEEROOM_STDIN=1 reads the answers from standard input (scripted installs).
set -eu
base="${BEEROOM_URL:-https://beeircd.org/dl/beeroom}"

if [ "$(id -u)" != 0 ]; then
	echo "Run it as root:  curl -fsSL https://beeircd.org/beeroom.sh | sudo sh" >&2
	exit 1
fi

need_node() {
	cat >&2 <<EOF
BeeRoom needs Node.js 22 or newer ($1).
Install it first, for example from https://nodejs.org/en/download
(Linux, "Package Manager" or "Prebuilt Binaries"), then run this again.
EOF
	exit 1
}
node="$(command -v node || true)"
[ -n "$node" ] || need_node "none found"
major="$("$node" -p 'process.versions.node.split(".")[0]')"
[ "$major" -ge 22 ] || need_node "found $("$node" -v)"

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
# get URL FILE: curl, else wget; a file:// folder (test installs) is copied.
get() {
	case "$1" in
	file://*) cp "${1#file://}" "$2" ;;
	*)
		if command -v curl >/dev/null 2>&1; then
			curl -fsSL -o "$2" "$1"
		elif command -v wget >/dev/null 2>&1; then
			wget -q -O "$2" "$1"
		else
			echo "BeeRoom needs curl or wget to download itself." >&2
			exit 1
		fi ;;
	esac
}

echo "Downloading BeeRoom ..."
if ! get "$base/release.json" "$tmp/release.json" || ! get "$base/release.json.sig" "$tmp/release.json.sig"; then
	echo "The download failed: $base/release.json" >&2
	exit 1
fi

# The signature is checked with the same keys BeeIRCd trusts, under the
# BeeRoom label, before anything from the download runs.
found="$("$node" - "$tmp" <<'JS'
const fs = require("fs"), crypto = require("crypto"), dir = process.argv[2];
const keys = ["pRAtMw63e82bKkYiU3B27vbKRPXwkBO89U0d8oIP0ng="];
if (process.env.BEEROOM_TEST_KEY) keys.push(process.env.BEEROOM_TEST_KEY);
const manifest = fs.readFileSync(dir + "/release.json");
const sig = Buffer.from(fs.readFileSync(dir + "/release.json.sig", "utf8").trim(), "base64");
const msg = Buffer.concat([Buffer.from("BeeRoom release v1\n"), manifest]);
const ok = sig.length === 64 && keys.some((k) => {
	try {
		const x = Buffer.from(k, "base64").toString("base64url");
		const key = crypto.createPublicKey({key: {kty: "OKP", crv: "Ed25519", x}, format: "jwk"});
		return crypto.verify(null, msg, key, sig);
	} catch {
		return false;
	}
});
if (!ok) {
	console.error("The BeeRoom release signature doesn't match: not installing it.");
	process.exit(1);
}
const m = JSON.parse(manifest);
const name = Object.keys(m.files || {}).find((f) => /^beeroom-[0-9A-Za-z.+-]+\.tar\.gz$/.test(f));
if (!name) {
	console.error("This release lists no BeeRoom bundle.");
	process.exit(1);
}
console.log(name + " " + m.files[name] + " " + m.version);
JS
)"
name="${found%% *}"
rest="${found#* }"
sum="${rest%% *}"
version="${rest#* }"

echo "Downloading $name ..."
if ! get "$base/$name" "$tmp/$name"; then
	echo "The download failed: $base/$name" >&2
	exit 1
fi
"$node" -e '
const fs = require("fs"), crypto = require("crypto");
const got = crypto.createHash("sha256").update(fs.readFileSync(process.argv[1])).digest("hex");
if (got !== process.argv[2]) {
	console.error("The bundle differs from the signed release (SHA-256): not installing it.");
	process.exit(1);
}' "$tmp/$name" "$sum"
mkdir "$tmp/unpacked"
tar --no-same-owner -xzf "$tmp/$name" -C "$tmp/unpacked"
inst="$tmp/unpacked/beeroom/scripts/install.mjs"

# Questions need the keyboard even when this script comes from a pipe.
# BEEROOM_STDIN=1 (scripted installs, `sh beeroom.sh < answers`): read the
# answers from standard input instead.
if [ -t 0 ] || [ "${BEEROOM_STDIN:-}" = 1 ]; then
	"$node" "$inst" install "$tmp/unpacked/beeroom" "$version"
elif (: </dev/tty) 2>/dev/null; then
	"$node" "$inst" install "$tmp/unpacked/beeroom" "$version" </dev/tty
else
	echo "No terminal for the questions: download https://beeircd.org/beeroom.sh and run 'sudo sh beeroom.sh' yourself." >&2
	exit 1
fi
