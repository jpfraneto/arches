# Arches

Arches lets any community create its own Farcaster client in one command.

Read `ARCHES.md` for the product philosophy, identity model, and Discourse
inspiration behind the project. Read `docs/DISCOURSE_TO_ARCHES.md` for the
setup architecture Arches should adapt from Discourse: server-defined wizard
steps, durable community settings, terminal/web rendering, and verified
Farcaster ownership before launch.

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

The installer now has the first broker handoff scaffold. With no flags, it
calls the setup broker instead of asking for `--arch`:

```bash
ARCHES_SETUP_BROKER_URL=http://localhost:3020 bash scripts/install.sh
```

The broker returns the Discourse-style setup state as terminal text plus a
browser setup URL. It now has a Farcaster verification provider boundary with a
per-session nonce/domain challenge. Set `ARCHES_FARCASTER_VERIFIER=auth-client`
to create/poll Farcaster auth relay channels and verify SIWF messages with the
official Farcaster auth client. The default provider still returns `501`, so
this path does not generate appliance files or enable posting until a verifier
is configured.

When the auth-client verifier is active, the browser setup page renders the
relay URL as an inline QR and auto-polls the session until the Farcaster
signature advances setup to signer preparation.

The setup broker now has signer approval request/status endpoints behind a
provider boundary. The default signer provider fails closed, and setup state is
limited to non-secret request URLs and signer public keys.
The browser setup page now exposes the same `Prepare Signer` flow with request
and status buttons, still using the provider boundary and FID-match gate.

The setup broker also renders unclaimed `*.arches.lat` hostnames as creation
invitations. Visiting an unclaimed Arch should point the host toward Farcaster
verification rather than accepting a manual admin claim.

The setup broker has an optional Neynar channel eligibility adapter:

```bash
ARCHES_CHANNEL_PROVIDER=neynar \
NEYNAR_API_KEY=... \
bun run src/index.ts
```

The adapter only loads channels after a setup session has a host FID. The real
host FID still needs to come from Farcaster verification. The browser setup page
exposes this as a `Choose Community` action: `Refresh eligible channels` calls
the provider, records a channel-refresh audit event, and re-renders the
server-derived choices. It does not accept manual admin or channel ownership
claims.

The setup broker also has an in-memory `*.arches.lat` reservation primitive. It
only reserves the selected eligible Farcaster channel slug; arbitrary custom
slugs are intentionally not accepted yet.

The setup broker has a Cloudflare Tunnel provisioning provider scaffold:

```bash
ARCHES_TUNNEL_PROVIDER=cloudflare \
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_ZONE_ID=... \
CLOUDFLARE_API_TOKEN=... \
bun run src/index.ts
```

`POST /api/setup/sessions/:sessionId/tunnel/provision` is gated on verified
setup state and stores the generated `tunnel-local` install command. It does not
mark the appliance as launched or unlock posting.

The setup broker records an in-memory setup audit trail. Read it with:

```bash
curl -fsSL http://localhost:3020/api/setup/sessions/SESSION_ID/events
```

This is the first scaffold for Discourse-style setup provenance. It records
session creation, Farcaster verification, signer request/approval, channel
refresh, step submission, slug reservation, and tunnel provisioning events
without storing tunnel tokens or private signer material.

Completed setup steps now carry derived provenance in the session schema:
`completedAt`, `completedByFid`, `completionEventId`, and
`completionEventType`. The browser sidebar and terminal output render that proof
next to completed steps when it is available.

The setup broker can also export the server-derived Arch config snapshot:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/arch/config
```

This is the Arches equivalent of Discourse applying wizard fields into site
settings. It returns structured config plus non-secret `.env` values such as
`ARCH_SLUG`, `ARCH_DOMAIN`, `ARCH_SURFACE_PRESET`, `ARCH_GRAMMAR_PRESET`,
`ARCH_THEME_PRESET`, `ARCH_SURFACE_TITLE`, `ARCH_PROVENANCE_LABEL`, and the
optional non-secret `ARCH_SIGNER_PUBLIC_KEY`. It does not include tunnel tokens
or private signer material.

The browser launch step exposes the same export as a setup action. After export,
the non-secret env block is rendered back into the launch step for review and
copying; changing earlier setup choices clears it so stale config is not reused.

The setup schema now includes Discourse-style community-surface choices:
surface type (`village`, `bulletin`, `library`), posting grammar
(`open-casts`, `curated-updates`, `knowledge-base`), and theme (`daylight`,
`high-contrast`, `night`).

The schema also carries Discourse-style wizard metadata: step index,
one-based display index, previous/next step ids, status, icon name, and choice
badges. It also carries active step actions such as signer approval, eligible
channel refresh, tunnel provisioning, and Arch config export. The browser setup
page renders that metadata directly for step count, indexed progress, channel
role badges, surface preset cards, inline field validation errors, and
provider-backed action buttons.

Each setup response also includes a compact server-derived summary with
readiness, progress count, blocked count, current step title, and next action.
The terminal output and browser sidebar render the same summary.

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
- `apps/setup-broker` contains the first setup-session API scaffold for the
  Discourse-inspired zero-info installer flow.
- `packages/setup-schema` contains the Discourse-inspired setup session schema
  that can be rendered by a future terminal installer, setup broker, or browser
  wizard.
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

Test the setup schema:

```bash
cd packages/setup-schema
bun test
```

Test the setup broker:

```bash
cd apps/setup-broker
bun test
```

Test the no-argument installer handoff locally:

```bash
cd apps/setup-broker
bun run src/index.ts

ARCHES_SETUP_BROKER_URL=http://localhost:3020 bash scripts/install.sh
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
