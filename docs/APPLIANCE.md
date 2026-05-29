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
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

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
- `Caddyfile`: Domain routing for the web app and API.

The installer refuses to overwrite an existing `.env` so generated secrets are
not replaced accidentally.

## Docker Compose Services

- `caddy`: Public HTTP/HTTPS entrypoint and reverse proxy.
- `arches-api`: Arches API scaffold. In v0 it stores casts in memory.
- `arches-web`: Minimal community web surface and composer.
- `postgres`: Intended local read plane for Arch-scoped data.
- `redis`: Local cache/queue dependency for the appliance.
- `hypersnap-lite`: The write engine consumed through its Docker image contract.

The script prints Docker installation guidance if Docker Compose is missing. It
only starts services automatically when `--yes` is passed.

## v0 Honesty

This scaffold does not publish casts to Farcaster yet, does not verify admin
ownership, and does not index global Farcaster data. It only establishes the
appliance shape and the "posted via this Arch" local provenance path.
