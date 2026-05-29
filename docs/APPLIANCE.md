# Arches Appliance

The appliance goal is a fresh VPS install flow that creates a community-owned
Farcaster client from one command:

```bash
curl -fsSL https://install.arches.lat | bash -s -- \
  --arch YOUR_COMMUNITY \
  --domain YOUR_DOMAIN \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

For v0, use the local script from this repo:

```bash
bash scripts/install.sh \
  --arch anky \
  --domain anky.arches.lat \
  --mode vps \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

`vps` is the default mode so the future one-liner can stay short.

## Install Directory

The installer writes generated appliance files to:

- `/opt/arches` when running as root.
- `$HOME/.arches` when running as a normal user.

For local testing, set `ARCHES_INSTALL_DIR` before running the installer.

## Generated Files

The installer creates:

- `.env`: Arch identity, admin FID, support email, image contract, and generated
  Postgres/Redis passwords.
- `docker-compose.yml`: The local appliance service graph.
- `Caddyfile`: Domain routing for the web app and API in `vps` mode only.

The installer refuses to overwrite an existing `.env` so generated secrets are
not replaced accidentally.

## GHCR Images

The generated `.env` pins the image contract to GHCR:

```env
ARCHES_API_IMAGE=ghcr.io/jpfraneto/arches-api:latest
ARCHES_WEB_IMAGE=ghcr.io/jpfraneto/arches-web:latest
HYPERSNAP_LITE_IMAGE=ghcr.io/jpfraneto/hypersnap-lite:latest
```

This repo publishes `arches-api` and `arches-web` from GitHub Actions using
`GITHUB_TOKEN` with package write permissions. Hypersnap Lite remains a separate
image consumed through its Docker image/config contract.

## Modes

- `local`: no Caddy is rendered, `--domain` can default to `localhost`, and the
  web/API ports are bound on localhost for direct testing.
- `vps`: Caddy is rendered, a real domain is required, ports 80 and 443 are
  opened by Caddy, and `--email` is used for ACME/contact config.
- `existing-proxy`: no Caddy is rendered, a real domain is required, and
  localhost web/API ports are exposed for a user-managed reverse proxy.

## Docker Compose Services

- `caddy`: Public HTTP/HTTPS entrypoint and reverse proxy in `vps` mode.
- `arches-api`: Arches API scaffold. In v0 it stores casts in memory.
- `arches-web`: Minimal community web surface and composer.
- `postgres`: Intended local read plane for Arch-scoped data.
- `redis`: Local cache/queue dependency for the appliance.
- `hypersnap-lite`: The write engine consumed through its Docker image contract.

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

This scaffold does not publish casts to Farcaster yet, does not verify admin
ownership, does not implement payment/licensing, and does not index global
Farcaster data. Production persistence is still deferred while casts are stored
in memory by the API process. It only establishes the appliance shape and the
"posted via this Arch" local provenance path.
