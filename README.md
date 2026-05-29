# Arches

Arches lets any community create its own Farcaster client in one command.

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

## Local Appliance Install

For this v0 PR, generate local appliance files with:

```bash
bash scripts/install.sh \
  --arch anky \
  --domain anky.arches.lat \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

If `--admin-fid` or `--email` still use the placeholder values, the installer
prompts for real values.

By default the installer renders files and prints next steps. It does not start
Docker services unless `--yes` is passed:

```bash
bash scripts/install.sh \
  --arch anky \
  --domain anky.arches.lat \
  --admin-fid 123 \
  --email support@example.com \
  --yes
```

Generated files are written to `/opt/arches` when run as root and
`$HOME/.arches` otherwise. Set `ARCHES_INSTALL_DIR` to override that during
local testing.

## Future One-Liner

The production goal is:

```bash
curl -fsSL https://install.arches.lat | bash -s -- \
  --arch YOUR_COMMUNITY \
  --domain YOUR_DOMAIN \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL
```

## Apps

- `apps/api` contains a minimal Bun + Hono API.
- `apps/web` contains a minimal web composer and feed.
- `templates` contains the Docker Compose, Caddy, and environment templates.

API endpoints:

- `GET /health`
- `GET /api/arch`
- `GET /api/feed`
- `POST /api/casts`

## v0 Limitations

- Casts are stored in memory in the API process.
- New casts are marked `local`; Farcaster publishing is not implemented yet.
- Admin verification is not implemented yet.
- `arches-api` and `arches-web` use placeholder Docker image names until this
  repo publishes images.
- The local read plane is scoped to casts created through an Arch. It is not a
  global Farcaster indexer.
