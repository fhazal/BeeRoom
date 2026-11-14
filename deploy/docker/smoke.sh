#!/usr/bin/env bash
# smoke.sh IMAGE PLATFORM: the BeeRoom image on one platform (arm64 runs
# emulated in CI). It gets the two files BeeIRCd's container would share,
# starts, and must serve the BeeRoom page. Cleans up after itself.
set -euo pipefail
img=$1
plat=$2
n="beeroomsmoke-$$"
port=$((20000 + $$ % 20000))
cleanup() {
	docker rm -f "$n" >/dev/null 2>&1 || true
	docker volume rm "$n-link" >/dev/null 2>&1 || true
}
trap cleanup EXIT

docker volume create "$n-link" >/dev/null
docker run --rm -v "$n-link:/link" alpine:3.22 sh -c 'echo SmokeNet >/link/network; echo test-0000-0000-0000-0000 >/link/webirc'
docker run -d --name "$n" --init --platform "$plat" -v "$n-link:/link:ro" -p "127.0.0.1:$port:9000" "$img" >/dev/null

page=""
for _ in $(seq 1 120); do
	page=$(curl -fsS "http://127.0.0.1:$port/" 2>/dev/null || true)
	[[ -n $page ]] && break
	sleep 1
done
echo "machine: $(docker exec "$n" uname -m)  node: $(docker exec "$n" node -v)"
docker logs "$n" 2>&1 | grep -E 'Available at|ERROR' || true
if ! grep -qi 'beeroom' <<<"$page"; then
	echo "FAIL: no BeeRoom page on port 9000"
	docker logs "$n" 2>&1 | tail -20
	exit 1
fi
owner=$(docker exec "$n" ps -o user,comm | awk '$2 == "node" { print $1; exit }')
echo "node runs as: $owner"
[[ $owner == node ]] || { echo "FAIL: BeeRoom should run as the node user"; exit 1; }
echo "SMOKE PASS $plat"
