# Arches

Arches lets any community create its own Farcaster client in one command.

Read `ARCHES.md` for the product philosophy, identity model, and Discourse
inspiration behind the project.

An Arch is a custom social surface for one community. It has its own domain,
feed, interface, posting grammar, and provenance. The Arches feed only shows
casts created through that Arch.

## Layer Model

- Hypersnap Lite is the write engine.
- Arches is the factory and appliance scaffold.
- Farcaster is the protocol.

Arches consumes Hypersnap Lite through its Docker image/config contract. This
repo must not copy Hypersnap Lite source code and must not become a full
Farcaster indexer.

## Appliance Install

For v0, generate appliance files with:

```bash
bash scripts/install.sh \
  --arch anky \
  --domain anky.arches.lat \
  --mode vps \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

If `--admin-fid` or `--email` still use the placeholder values, the installer
prompts for real values.

Installer modes:

- `local`: no Caddy, `--domain` can be omitted and defaults to `localhost`,
  web is exposed at `http://localhost:3000`, and the API is exposed at
  `http://localhost:3001`.
- `tunnel-local`: no Caddy and no public host ports. Requires a Cloudflare
  Tunnel token and runs `cloudflared` inside Docker so a `*.arches.lat` hostname
  can route to the local appliance.
- `vps`: includes Caddy, requires a real domain, and uses `--email` as the
  ACME/contact email.
- `existing-proxy`: does not include Caddy, requires a real domain, and exposes
  localhost app ports for a user-managed reverse proxy.

By default the installer renders files and prints next steps. It does not start
Docker services unless `--yes` is passed:

```bash
bash scripts/install.sh \
  --arch anky \
  --domain anky.arches.lat \
  --mode vps \
  --admin-fid 123 \
  --email support@example.com \
  --yes
```

Generated files are written to `/opt/arches` when run as root and
`$HOME/.arches` otherwise. Set `ARCHES_INSTALL_DIR` to override that during
local testing.

## Future One-Liner

The production goal is a zero-info install:

```bash
curl -fsSL https://install.arches.lat | bash
```

That flow will show a Farcaster QR code, derive the admin FID from a verified
Farcaster signature, reserve a default `*.arches.lat` hostname, provision a
Cloudflare Tunnel, and start the local appliance. No admin verification should
be faked.

Arches is the seed, not the host identity. Each Arch is held up by the person or
community running that appliance. Any app/factory Farcaster credential used by
Arches may only request signer approval during setup; it must not become the FID
that casts for every Arch.

The low-level one-liner remains available for explicit installs:

```bash
curl -fsSL https://install.arches.lat | bash -s -- \
  --arch YOUR_COMMUNITY \
  --mode vps \
  --domain YOUR_DOMAIN \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

The one-liner uses the same installer modes. `vps` is the default mode.

For live local hosting through Cloudflare Tunnel:

```bash
curl -fsSL https://install.arches.lat | bash -s -- \
  --arch YOUR_COMMUNITY \
  --mode tunnel-local \
  --domain YOUR_COMMUNITY.arches.lat \
  --admin-fid YOUR_VERIFIED_FID \
  --tunnel-token CLOUDFLARE_TUNNEL_TOKEN
```

`tunnel-local` runs `cloudflared` in Docker and routes public traffic from the
Arch hostname to the appliance over an outbound tunnel. See
`docs/ZERO_INFO_INSTALL.md` for the shippable tunnel primitive and the control
plane contract.

## Public Website

The first public website scaffold lives in `site/`.

- `site/index.html` is the static `arches.lat` homepage.
- `site/install` is the raw installer script for `install.arches.lat`.
- `site/app.js` generates the install command in the browser.

The homepage explains the product boundary: Hypersnap Lite is the write engine,
Arches is the factory, and Farcaster is the protocol. The command generator is
static and does not create accounts, collect payment, publish to Farcaster, or
verify admins.

Configure `install.arches.lat` so its root path serves the raw contents of
`site/install`. If the same static host serves both domains, route or rewrite
`https://install.arches.lat/` to `/install`.

GitHub Pages is enabled for this repo and deploys `site/` on every push to
`main` that changes the site or deploy workflow. The current live URLs are:

```text
https://arches.lat/
https://install.arches.lat/
https://jpfraneto.github.io/arches/
```

`arches.lat` is managed in Cloudflare DNS and points at GitHub Pages. The
`install.arches.lat` hostname is a proxied Cloudflare hostname with a Single
Redirect to the raw installer at `https://arches.lat/install`.

Test the static site locally:

```bash
python3 -m http.server 8080 --directory site
```

Then open `http://localhost:8080/` for the homepage and
`http://localhost:8080/install` for the raw installer.

Test the hosted installer shape locally:

```bash
rm -rf /tmp/arches-site-local
curl -fsSL http://localhost:8080/install | \
  ARCHES_INSTALL_DIR=/tmp/arches-site-local bash -s -- \
    --arch anky \
    --mode local \
    --admin-fid 123 \
    --email support@example.com
```

See `docs/DOMAIN_SETUP.md` for DNS and static hosting notes.

## Apps

- `apps/api` contains a minimal Bun + Hono API.
- `apps/web` contains a minimal web composer and feed.
- `templates` contains the Docker Compose, Caddy, and environment templates.
- `.github/workflows/publish-images.yml` publishes the appliance images to GHCR.

Published image names:

- `ghcr.io/jpfraneto/arches-api:latest`
- `ghcr.io/jpfraneto/arches-web:latest`
- `ghcr.io/jpfraneto/hypersnap-lite:latest`

API endpoints:

- `GET /health`
- `GET /api/arch`
- `GET /api/feed`
- `POST /api/casts`
- `POST /api/quote`

## Local Testing

Render a local appliance without starting Docker:

```bash
ARCHES_INSTALL_DIR=/tmp/arches-local bash scripts/install.sh \
  --arch anky \
  --mode local \
  --admin-fid 123 \
  --email support@example.com
```

Start it only when ready:

```bash
cd /tmp/arches-local
docker compose up -d
```

Build the API and web images locally:

```bash
docker build -t arches-api:local apps/api
docker build -t arches-web:local apps/web
```

## Experimental $ARCHES Discount

The appliance config includes disabled experimental $ARCHES settings:

```env
ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED=false
ARCHES_COIN_CONTRACT_ADDRESS=0x09b8903aBf2ea0721E34427353988c2F43c6d64F
ARCHES_COIN_DISCOUNT_BPS=1618
```

Payment, licensing, discounts, and token verification are not part of the core
v0 install path. When explicitly enabled, `POST /api/quote` can calculate the
experimental discount, but it does not collect payment or verify transfers.

## v0 Limitations

- Farcaster publishing is not implemented yet.
- `POST /api/casts` rejects local-only casts until Farcaster publishing is
  wired.
- The Arch feed must map 1:1 to Farcaster data; local-only Arch posts are not
  accepted.
- Admin verification is not implemented yet.
- Payment, licensing, $ARCHES discount settlement, and onchain payment
  verification are not implemented yet.
- The local read plane is scoped to casts created through an Arch. It is not a
  global Farcaster indexer.
