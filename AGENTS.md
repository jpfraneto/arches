# Arches

Arches lets any community create its own Farcaster client in one command.

## Product law

- Hypersnap Lite is the write engine.
- Arches is the factory.
- Farcaster is the protocol.
- An Arch is a custom social surface for one community.
- Each Arch has its own domain, feed, interface, grammar, and provenance.
- The Arches feed only shows casts created through that Arch.
- Arches must not become a full Farcaster indexer.
- Arches must not copy Hypersnap Lite source code.
- Arches consumes Hypersnap Lite through its Docker image/config contract.

## Repo boundary

This repo owns:
- the Arches installer
- Docker Compose appliance templates
- Caddy/domain wiring
- API/web/feed/admin scaffolding
- Redis/Postgres local read plane
- community-specific "via this Arch" provenance

This repo does not own:
- the Hypersnap Lite implementation
- Snapchain internals
- global Farcaster indexing
- custody of private signer keys

## First milestone

Make this work locally:

bash scripts/install.sh \
  --arch anky \
  --domain anky.arches.lat \
  --admin-fid YOUR_FID \
  --email YOUR_SUPPORT_EMAIL

The script should collect config, generate local appliance files, and optionally start Docker services.
