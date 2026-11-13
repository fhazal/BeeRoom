#!/bin/sh
# Builds the BeeRoom release bundle: beeroom-<version>.tar.gz with the built
# app, its installer and its production packages. BeeRoom has no native
# modules, so one bundle runs on every Linux with Node 22 (amd64 and arm64).
#
#   scripts/bundle.sh [out dir]      (on Linux with Node 22, from the repo root)
#
# Then, in the BeeIRCd repo, with the release key (see RELEASING.md):
#   go run ./tools/release manifest -product beeroom -version <version> -dir <out dir>
#   go run ./tools/release sign     -product beeroom -in <out dir>/release.json
set -eu
out="${1:-release}"
version="$(node -p 'require("./package.json").beeroom')"
yarn="npx -y yarn@1.22.22"

$yarn install --frozen-lockfile --non-interactive
NODE_ENV=production $yarn build

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
stage="$work/beeroom"
mkdir -p "$stage/scripts"
cp -R package.json yarn.lock index.js .thelounge_home LICENSE README.md dist public "$stage/"
cp scripts/install.mjs "$stage/scripts/"
(cd "$stage" && $yarn install --production --frozen-lockfile --ignore-scripts --non-interactive --silent)
if find "$stage/node_modules" -name '*.node' | grep -q .; then
	echo "A native module slipped in; the bundle would not run everywhere:" >&2
	find "$stage/node_modules" -name '*.node' >&2
	exit 1
fi
mkdir -p "$out"
tar -C "$work" --owner=0 --group=0 --numeric-owner -czf "$out/beeroom-$version.tar.gz" beeroom
ls -l "$out/beeroom-$version.tar.gz"
