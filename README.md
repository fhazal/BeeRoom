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

## Running it next to BeeIRCd

In `beeircd.conf`:

```toml
[[webirc]]
name = "beeroom"
password = "a-long-random-secret-here"
hosts = ["127.0.0.1"]
```

In BeeRoom's `config.js` (`~/.thelounge/config.js`):

```js
defaults: { name: "YourNet", host: "127.0.0.1", port: 6667, tls: false },
webirc: { "127.0.0.1": "a-long-random-secret-here" },
```

Build and start:

```sh
yarn install --frozen-lockfile
NODE_ENV=production yarn build
yarn start
```

The BeeIRCd installer will set this up for you (coming with BeeIRCd 1.1).

## Credits and licence

MIT, see [LICENSE](LICENSE). Built on The Lounge by its contributors.
Fonts: Inter, Space Grotesk, JetBrains Mono (SIL Open Font License, in
`client/public/themes/fonts`). Icons: Lucide (ISC). Catppuccin palette (MIT).

BeeRoom is made by BajuBesi Labs.
