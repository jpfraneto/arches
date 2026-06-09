# Arches Appliance

The appliance goal is a setup-first install flow that creates a community-owned
Farcaster client from one command:

```bash
curl -fsSL https://install.arches.lat | bash
```

That command opens setup. The operator scans with Farcaster, approves setup,
chooses an eligible channel, and lets Arches derive the rest.

For local dev, use explicit flags from this repo:

```bash
bash scripts/install.sh \
  --arch anky \
  --domain anky.arches.lat \
  --mode vps \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

`vps` remains an explicit dev/manual mode. Manual `--arch`, `--admin-fid`, and
`--email` flags are not the primary product path.

## Install Directory

The installer writes generated appliance files to:

- `/opt/arches` when running as root.
- `$HOME/.arches` when running as a normal user.

For local testing, set `ARCHES_INSTALL_DIR` before running the installer.

## Generated Files

The installer creates:

- `.env`: Arch identity, selected channel config, admin FID, support email,
  image contract, Hypersnap Lite endpoint config, and mode-specific runtime
  credentials.
- `docker-compose.yml`: The local appliance service graph.
- `Caddyfile`: Domain routing for the web app and API in `vps` mode only.

The installer refuses to overwrite an existing `.env` so runtime credentials are
not replaced accidentally.

## GHCR Images

The generated `.env` pins the image contract to GHCR:

```env
ARCHES_API_IMAGE=ghcr.io/jpfraneto/arches-api:latest
ARCHES_WEB_IMAGE=ghcr.io/jpfraneto/arches-web:latest
HYPERSNAP_LITE_IMAGE=ghcr.io/jpfraneto/hypersnap-lite:latest
HYPERSNAP_LITE_PLATFORM=linux/amd64
HYPERSNAP_LITE_URL=http://hypersnap-lite:3381
HYPERSNAP_LITE_HEALTH_PATH=/v1/info
FARCASTER_NETWORK=mainnet
```

This repo publishes `arches-api` and `arches-web` from GitHub Actions using
`GITHUB_TOKEN` with package write permissions. Hypersnap Lite remains a separate
image consumed through its Docker image/config contract. Arches submits signed
Farcaster protobuf messages to `/v1/submitMessage`; Hypersnap Lite does not need
Arches-specific endpoints. Its default platform is set explicitly so local arm64
machines can still run the current amd64 image.

For v0.1 dev publishing, `ARCH_SIGNER_PRIVATE_KEY` can be added to the generated
`.env`. It is passed only to `arches-api`, never to `arches-web`.

## Modes

- `local`: no Caddy is rendered, `--domain` can default to `localhost`, and the
  web/API ports are bound on localhost for direct testing.
- `tunnel-local`: no Caddy is rendered, a real domain is required, and the
  generated appliance includes `cloudflared`. Cloudflare routes public traffic
  to the appliance over an outbound tunnel. This mode requires a tunnel token
  from Cloudflare or the Arches control plane.
- `vps`: Caddy is rendered, a real domain is required, ports 80 and 443 are
  opened by Caddy, and `--email` is used for ACME/contact config.
- `existing-proxy`: no Caddy is rendered, a real domain is required, and
  localhost web/API ports are exposed for a user-managed reverse proxy.

## Docker Compose Services

- `caddy`: Public HTTP/HTTPS entrypoint and reverse proxy in `vps` mode.
- `cloudflared`: Public tunnel connector in `tunnel-local` mode.
- `arches-api`: Arches API, publishing probe, scoped feed, and cast boundary.
- `arches-web`: Minimal community web surface and composer.
- `hypersnap-lite`: The write engine consumed through its Docker image contract.

The current v0.1 template does not start Postgres or Redis because the API does
not connect to them yet. A future durable local read plane can add them back when
the code uses them.

The script prints Docker installation guidance if Docker Compose is missing. It
only starts services automatically when `--yes` is passed.

## Local Testing

Render a local install without starting services:

```bash
rm -rf /tmp/arches-local
ARCHES_INSTALL_DIR=/tmp/arches-local bash scripts/install.sh \
  --arch anky \
  --mode local \
  --admin-fid 123 \
  --email support@example.com
```

Inspect the generated files:

```bash
sed -n '1,120p' /tmp/arches-local/.env
sed -n '1,220p' /tmp/arches-local/docker-compose.yml
```

Start only when ready:

```bash
cd /tmp/arches-local
docker compose up -d
```

Build images locally:

```bash
docker build -t arches-api:local apps/api
docker build -t arches-web:local apps/web
```

## Experimental $ARCHES Discount

Generated environments include:

```env
ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED=false
ARCHES_COIN_SYMBOL=ARCHES
ARCHES_COIN_CONTRACT_ADDRESS=0x09b8903aBf2ea0721E34427353988c2F43c6d64F
ARCHES_COIN_DISCOUNT_BPS=1618
```

Payment, licensing, discounts, and token verification are disabled by default
and are not part of the core v0 install path. If explicitly enabled, the API can
calculate an experimental quote discount, but it does not collect payment or
verify token transfers.

## v0 Honesty

This scaffold does not verify admin ownership by form input, does not implement
payment/licensing, and does not index global Farcaster data. Because Arches data
must map 1:1 to Farcaster data, `POST /api/casts` rejects local-only casts until
Arches can sign a real Farcaster message and Hypersnap Lite returns a real
Farcaster publish result. The appliance currently establishes the install,
routing, and provenance shape without pretending local writes are Farcaster
casts.
