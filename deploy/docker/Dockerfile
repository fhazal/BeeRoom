# The BeeRoom image: the web chat with Node 22 inside, nothing to install
# on the machine. Built from this repo:
#   docker buildx build --platform linux/amd64,linux/arm64 -f deploy/docker/Dockerfile .
# It runs next to the BeeIRCd image; see compose.yaml in the BeeIRCd repo.
# The app has no native modules, so it is built once on the build machine's
# own platform and the same files go into every image.
FROM --platform=$BUILDPLATFORM node:22-alpine AS build
WORKDIR /src
COPY . .
RUN npx -y yarn@1.22.22 install --frozen-lockfile --non-interactive \
	&& NODE_ENV=production npx -y yarn@1.22.22 build \
	&& mkdir /out \
	&& cp -R package.json yarn.lock index.js LICENSE README.md dist public /out/ \
	&& cd /out \
	&& npx -y yarn@1.22.22 install --production --frozen-lockfile --ignore-scripts --non-interactive --silent \
	&& npx -y yarn@1.22.22 cache clean --silent

FROM node:22-alpine
RUN apk add --no-cache su-exec && mkdir -p /data /link && chown node:node /data
COPY --from=build /out /opt/beeroom
COPY --chmod=644 deploy/docker/config.js /opt/beeroom/docker-config.js
COPY --chmod=755 deploy/docker/entrypoint.sh /usr/local/bin/entrypoint.sh

ENV THELOUNGE_HOME=/data NODE_ENV=production
VOLUME /data
EXPOSE 9000
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
