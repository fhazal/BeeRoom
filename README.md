# BeeRoom

The web chat for [BeeIRCd](https://beeircd.org): open a link, pick a nick,
chat. Black and honey yellow, like the rest of the Hive.

BeeRoom is a fork of [The Lounge](https://github.com/thelounge/thelounge)
4.5.2 (MIT). We keep our changes small so new The Lounge releases can be
brought in.

## What is different from The Lounge

- **Name and look**: BeeRoom name, honey hexagon logo and icons; the Bee
  theme is the default and Catppuccin Mocha is the second theme.
- **One network**: guests connect to their own BeeIRCd only (public mode,
  locked network). The connect page names the network.
- **Real IPs**: BeeRoom sends each person's IP to BeeIRCd with WEBIRC, so
  bans, limits and cloaks hit that person, not everyone on the web chat.
- **Quiet**: no link previews, no uploads, no checks for The Lounge updates.
- **No fake IPs**: behind a web server only the address that web server saw
  counts (The Lounge took the first `X-Forwarded-For` entry, which a visitor
  can make up).

## Install

BeeRoom is optional and separate from BeeIRCd: BeeIRCd stays one lean
program. You need Linux with systemd and Node.js 22 or newer.

```sh
curl -fsSL https://beeircd.org/beeroom.sh | sudo sh
```

The script checks the signed release (the same key as BeeIRCd), then asks
two questions: the web chat address and the channels to join. It:

- runs BeeRoom as its own `beeroom` user and service, on 127.0.0.1 only;
- with BeeIRCd on the same machine, runs `beeircd webirc add` itself so real
  IPs reach the IRC server; on another machine it shows the one command to
  run on the IRC server;
- finds Apache, nginx or Caddy, shows the site it would add and writes it
  only when you say yes (a backup is kept), and uses certbot if it is there;
  with no web server it prints the lines for Caddy;
- ends with the link to share.

Run the same line again to update. `sudo beeroom uninstall` removes the
program and service (`--purge`: settings and data too).

| Where                    | What                                                               |
| ------------------------ | ------------------------------------------------------------------ |
| `/opt/beeroom`           | the program                                                        |
| `/etc/beeroom/config.js` | settings (everything else: `/opt/beeroom/dist/defaults/config.js`) |
| `/var/lib/beeroom`       | data                                                               |
| `journalctl -u beeroom`  | logs                                                               |

## Building a release

On Linux with Node 22: `scripts/bundle.sh release` makes
`beeroom-<version>.tar.gz` (the `beeroom` field in `package.json`). It is
signed like a BeeIRCd release, from the BeeIRCd repo, with `-product beeroom`
(see its RELEASING.md). `test/install/run.sh` tests the installer in fresh
LXD containers (Apache, nginx, Caddy, no web server, IRC server elsewhere).

## Credits and licence

MIT, see [LICENSE](LICENSE). Built on The Lounge by its contributors.
Fonts: Inter, Space Grotesk, JetBrains Mono (SIL Open Font License, in
`client/public/themes/fonts`). Icons: Lucide (ISC). Catppuccin palette (MIT).

BeeRoom is made by BajuBesi Labs.
