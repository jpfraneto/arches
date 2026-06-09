# Arches

Your channel is not just a tag. It can have its own client.

Arches lets Farcaster communities run small local clients: their own domain,
scoped feed, composer, admin tools, and plugin-ready surface.

Same Farcaster identity. Same protocol. A surface shaped by the community.

No new graph. No new account system. No fake casts.

Many clients. One Farcaster.

## Who It Is For

Arches is for Farcaster-native channel and community operators who want a local
surface without creating a new social network or asking members to use a new
identity.

An Arch is not a generic SaaS workspace. It is one community-owned Farcaster
client surface. The feed is scoped to casts created through that Arch.

## What One Command Creates

The default installer is setup-first:

```bash
curl -fsSL https://install.arches.lat | bash
```

It renders a local setup broker appliance and tells the operator where to open
setup. The intended setup ceremony is:

1. Open setup.
2. Scan with Farcaster.
3. Sign/approve with the Farcaster account.
4. Let Arches derive the admin FID.
5. Choose a channel that FID owns or administers.
6. Let Arches derive the slug, domain, surface config, signer state, and audit
   events.

The explicit dev installer can also render a full Docker Compose appliance:

- `arches-api`: Arch config, publishing probe, scoped feed, and cast API.
- `arches-web`: the web composer and scoped feed.
- `hypersnap-lite`: the Farcaster write engine consumed by Arches.
- `caddy`: only in `vps` mode.
- `cloudflared`: only in `tunnel-local` mode.

Redis and Postgres are not started by the current v0.1 templates because the
API does not use them yet.

## Boundary

- Farcaster is the protocol.
- Hypersnap Lite is the write engine.
- Arches is the factory.

Hypersnap Lite is a primitive write relay. Arches does not require Hypersnap
Lite to expose Arches-specific endpoints. Arches must construct and sign
Farcaster messages, then submit the signed protobuf bytes to Hypersnap Lite:

- `GET /v1/info`
- `POST /v1/submitMessage`

`POST /v1/submitMessage` takes an already signed Farcaster `Message` protobuf as
an `application/octet-stream` body. It returns the submitted Message as JSON,
including the real Farcaster `hash`, `signer`, and `data`.

Arches must not copy Hypersnap Lite source, become Hypersnap, custody secrets in
the browser, or become a global Farcaster indexer.

## What Works Today

- Static `arches.lat` site and raw installer endpoint.
- Zero-info installer that renders a setup-first appliance.
- Dev installer modes: `local`, `tunnel-local`, `vps`, `existing-proxy`.
- Setup broker schema and audit flow.
- Farcaster verification, signer approval, channel eligibility, tunnel,
  appliance launch, publishing verification, and composer unlock boundaries.
- API publishing probe that fails closed unless Arch config, server-only signer
  private key, message-building capability, and Hypersnap Lite `/v1/info` are
  all present.
- API cast endpoint that submits signed message bytes to
  Hypersnap Lite `/v1/submitMessage`.
- Web composer locked from API publishing readiness.
- Scoped feed that stores only real publish records created through this Arch.

## What Is Intentionally Locked

Posting is locked until Arches can load an approved server-only signer private
key, build and sign a real Farcaster `castAdd` message for the selected
Arch/channel, and submit it through Hypersnap Lite.

Arches will not write local-only fake casts to the feed. It will not generate
fake hashes. It will not make local data look like Farcaster data.

Arches now builds signed protobuf bytes locally with `@farcaster/core`. The
remaining default-product blocker is safe signer handoff: the setup flow has the
signer approval boundary, but the generated appliance does not yet receive the
approved signer private key automatically.

## v0.1 Golden Path

Render the setup-first appliance:

```bash
rm -rf /tmp/arches-zero-info
ARCHES_INSTALL_DIR=/tmp/arches-zero-info bash scripts/install.sh
cd /tmp/arches-zero-info
docker compose config
```

Expected behavior:

- a setup broker compose file is rendered
- no admin FID, arch slug, email, signer secret, or Hypersnap path is required
- setup provider env is blank by default and fails closed until configured

Render a local dev appliance without starting Docker:

```bash
rm -rf /tmp/arches-local
ARCHES_INSTALL_DIR=/tmp/arches-local bash scripts/install.sh \
  --arch anky \
  --mode local \
  --admin-fid 123 \
  --email support@example.com
cd /tmp/arches-local
docker compose config
```

Start the dev appliance:

```bash
docker compose up -d
docker compose ps
curl -fsSL http://localhost:3001/health
curl -fsSL -X POST http://localhost:3001/api/publishing/probe || true
```

Open the web surface:

```bash
open http://localhost:3000
```

Default behavior before signer/message construction is wired:

- the API is healthy
- the web surface renders
- the composer is locked
- the publishing probe fails closed with a specific reason
- no local-only casts are accepted

## Tunnel-Local

Use `tunnel-local` for dev or broker-driven setup when a Cloudflare Tunnel token
is available:

```bash
ARCHES_INSTALL_DIR=/tmp/arches-tunnel bash scripts/install.sh \
  --arch anky \
  --mode tunnel-local \
  --domain anky.arches.lat \
  --admin-fid 123 \
  --tunnel-token CLOUDFLARE_TUNNEL_TOKEN
```

The tunnel token is scoped to `cloudflared`. It is not injected into API, web, or
Hypersnap Lite containers.

## Verify Publishing Readiness

The API probe checks the real boundary:

```bash
curl -fsSL -X POST http://localhost:3001/api/publishing/probe
```

Ready means all of these are true:

- Arch config includes `ARCH_ADMIN_FID` and selected channel config.
- The API runtime has `ARCH_SIGNER_PRIVATE_KEY` in server-only env.
- Arches can build and sign `castAdd` protobuf bytes with `@farcaster/core`.
- Hypersnap Lite `GET /v1/info` is reachable.

When ready, the response includes non-secret details such as
`engine: "hypersnap-lite"`, `proofMode: "signed-farcaster-message-submit"`,
`adminFid`, `signerPublicKey`, and `checkedAt`.

## Publish One Real Cast

Only after readiness returns enabled:

```bash
curl -fsSL -X POST http://localhost:3001/api/casts \
  -H 'content-type: application/json' \
  -d '{"text":"First cast through this Arch"}'
```

Arches constructs/signs a Farcaster `castAdd` message, submits the signed
protobuf bytes to Hypersnap Lite `/v1/submitMessage`, validates the returned
Farcaster hash, and stores that result in the scoped Arch feed.

Inspect the scoped feed:

```bash
curl -fsSL http://localhost:3001/api/feed
```

The feed only contains real publish records created through this Arch.

## Logs

```bash
cd /tmp/arches-local
docker compose logs -f arches-api
docker compose logs -f arches-web
docker compose logs -f hypersnap-lite
```

## Required Env

Non-secret Arch config:

- `ARCH_SLUG`
- `ARCH_DOMAIN`
- `ARCH_CHANNEL_ID`
- `ARCH_CHANNEL_URL`
- `ARCHES_MODE`
- `ARCH_ADMIN_FID`
- `ARCH_SUPPORT_EMAIL`
- `ARCH_SURFACE_PRESET`
- `ARCH_GRAMMAR_PRESET`
- `ARCH_THEME_PRESET`
- `ARCH_SURFACE_TITLE`
- `ARCH_PROVENANCE_LABEL`
- `ARCH_SIGNER_PUBLIC_KEY`
- `FARCASTER_NETWORK`

Server-only signer config:

- `ARCH_SIGNER_PRIVATE_KEY`

Hypersnap Lite config:

- `HYPERSNAP_LITE_IMAGE`
- `HYPERSNAP_LITE_PLATFORM`
- `HYPERSNAP_LITE_URL`
- `HYPERSNAP_LITE_HEALTH_PATH`

Runtime routing:

- `ARCHES_HOST_BIND`
- `ARCHES_WEB_PORT`
- `ARCHES_API_PORT`
- `CLOUDFLARE_TUNNEL_TOKEN` for `tunnel-local`

Provider-gated setup config:

- `ARCHES_FARCASTER_VERIFIER`
- `ARCHES_CHANNEL_PROVIDER`
- `ARCHES_SIGNER_PROVIDER`
- `ARCHES_TUNNEL_PROVIDER`
- `ARCHES_APPLIANCE_LAUNCH_PROVIDER`
- `ARCHES_PUBLISHING_VERIFICATION_PROVIDER`
- provider API keys such as `NEYNAR_API_KEY`

## Secrets

Never commit:

- Cloudflare API tokens or tunnel tokens
- signer private keys
- signer request tokens
- mnemonic material
- custody private keys
- provider API keys
- generated `.env` files from real appliances

Read `ARCHES.md`, `docs/SETUP_CONTRACT.md`, `docs/HYPERSNAP_LITE.md`, and
`docs/ZERO_INFO_INSTALL.md` for the product law and setup contract.
