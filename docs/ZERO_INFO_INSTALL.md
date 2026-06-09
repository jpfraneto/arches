# Zero-Info Install

The intended public flow is:

```bash
curl -fsSL https://install.arches.lat | bash
```

The user should not have to know their FID, pick a deployment mode, configure
DNS, create a Cloudflare account, or open ports.

Arches is the seed, not the host. Running the command should spawn an appliance
held by the verified Farcaster user who approved it. Arches may broker setup,
but each Arch should have its own host FID, local signer, hostname, and
community context.

## Target Flow

1. The installer creates a local install session.
2. The terminal shows a Farcaster sign-in URL and QR code.
3. The user scans the QR code in a Farcaster client.
4. A setup broker verifies the Farcaster signature.
5. The broker derives the host FID from the verified Farcaster account.
6. The broker lists Farcaster channels this FID can host.
7. Setup asks the user which channel/community to launch.
8. The broker reserves a slug and domain such as `anky.arches.lat`.
9. The broker provisions a Cloudflare Tunnel and DNS route.
10. The installer receives the verified config and tunnel token.
11. Docker Compose starts the local appliance plus `cloudflared`.

No admin identity should be accepted unless it comes from a verified Farcaster
signature. Do not fake admin verification.

The app/factory FID, if used, is only a bootstrap identity for creating signer
requests. It is not the universal posting identity for Arches. User/community
casts must be signed by a signer approved by the verified host FID and stored
with the appliance that host runs.

## Channel Selection

After signer approval, the setup broker can query channel metadata for the
verified host FID and show eligible communities in the terminal:

```text
Farcaster verified: FID 18350

You can host an Arch for:

[1] /anky      lead
[2] /example   moderator

Choose a channel:
```

Eligibility should come from Farcaster channel state, with Neynar used as a
convenience API for channel metadata. Arches must not claim channel ownership;
it should only recognize that the verified FID is already allowed to lead or
moderate that Farcaster channel.

If someone visits an unclaimed `*.arches.lat` hostname, the router should serve
a creation page for that subdomain. It should invite a verified Farcaster user
to scan, prove they can host that community, and launch the appliance.

## Current Dev Primitive

The repo still supports explicit dev rendering of the appliance:

```bash
curl -fsSL https://install.arches.lat | bash -s -- \
  --arch anky \
  --mode tunnel-local \
  --domain anky.arches.lat \
  --admin-fid 123 \
  --tunnel-token CLOUDFLARE_TUNNEL_TOKEN \
  --yes
```

`--email` is optional in `tunnel-local` mode and defaults to
`support@arches.lat` because Caddy/ACME is not used.

In `tunnel-local` mode, the generated Docker Compose file includes:

- `arches-web`
- `arches-api`
- `hypersnap-lite`
- `cloudflared`

It does not include Redis or Postgres in v0.1 because the current API does not
connect to them yet.

The `cloudflared` container connects outbound to Cloudflare using the tunnel
token. The user does not need a public IP address, inbound firewall rule, router
configuration, or VPS.

## Cloudflare Provisioning

Operators or a future setup broker can provision the tunnel with:

```bash
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_ZONE_ID=... \
CLOUDFLARE_API_TOKEN=... \
  scripts/provision-cloudflare-tunnel.sh \
    --arch anky \
    --domain anky.arches.lat \
    --admin-fid 123 \
    --email support@arches.lat
```

The script:

1. Creates a remotely managed Cloudflare Tunnel.
2. Configures tunnel ingress:
   - `/api/*` to `http://arches-api:3000`
   - `/health` to `http://arches-api:3000`
   - everything else to `http://arches-web:3000`
3. Creates or updates the `CNAME` DNS record for the Arch domain.
4. Fetches the tunnel token.
5. Prints the install command for the local appliance.

This script does not verify Farcaster identity. It is a low-level provisioning
primitive that should only be called after identity and channel eligibility have
been verified.

## Cloudflare DNS Shape

Once `arches.lat` uses Cloudflare nameservers:

```text
arches.lat          -> landing/setup surface
install.arches.lat  -> installer endpoint
*.arches.lat        -> Arch appliances via Cloudflare Tunnel
```

Each provisioned Arch gets a record like:

```text
CNAME anky.arches.lat <tunnel-id>.cfargotunnel.com
```

The record is proxied by Cloudflare. Cloudflare terminates TLS and forwards
traffic through the tunnel to the appliance running on the user's machine.

## Reliability Language

This mode should be described honestly:

- If the user runs the appliance on a laptop and closes it, the Arch goes
  offline.
- If the same appliance runs on an always-on home machine or VPS, it behaves
  like a normal hosted site.
- The tunnel model makes local hosting simple; it does not make a sleeping
  machine reliable.

## Setup Broker Contract

The setup broker should coordinate:

- install sessions
- Farcaster QR/signature verification for the host FID
- local signer-key approval and safe signer handoff to the generated appliance
- Farcaster channel eligibility lookup
- slug reservation
- tunnel provisioning
- tunnel token delivery to the installer
- tunnel revocation and recovery

The broker should not own the Arch identity. The appliance host owns the local
process and the signer that publishes to Farcaster. The current installer
renders this setup-first broker when it receives no arguments. The current setup
broker has a Farcaster verification provider boundary with a per-session
nonce/domain challenge. It can verify SIWF messages through the official
Farcaster auth client when `ARCHES_FARCASTER_VERIFIER=auth-client`, including
auth relay channel creation, inline QR rendering, and browser status polling;
the default verifier still fails closed with `501`.

It also has the first signer approval provider boundary. The broker can create
a signer request URL and poll signer status, but the default signer provider
fails closed. Signer private keys and mnemonic material must stay out of setup
audit state and the web container; approved setup state may only carry
non-secret signer metadata such as a public key. The remaining production gap is
the safe local signing primitive that turns this approval into signed Farcaster
protobuf bytes inside the generated appliance.

## Broker Provisioning Scaffold

`apps/setup-broker` now has the first Cloudflare Tunnel provider boundary. It
mirrors the shell script above but runs behind the setup session API:

```bash
ARCHES_TUNNEL_PROVIDER=cloudflare \
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_ZONE_ID=... \
CLOUDFLARE_API_TOKEN=... \
bun run src/index.ts
```

Then, after the session has a verified host FID, selected eligible channel,
reserved `*.arches.lat` hostname, `tunnel-local` hosting mode, and configured
surface defaults:

```bash
curl -fsSL -X POST \
  http://localhost:3020/api/setup/sessions/SESSION_ID/tunnel/provision
```

The broker stores the generated install command and tunnel route status in the
setup session. It does not mark the appliance as launched and does not unlock
posting.

## Arch Config Snapshot

After verified setup state exists, the broker can export non-secret appliance
config:

```bash
curl -fsSL -X POST \
  http://localhost:3020/api/setup/sessions/SESSION_ID/arch/config
```

The snapshot includes structured config and `.env` values derived from the setup
session. It is the setup-broker counterpart to Discourse writing wizard values
into site settings.

The config includes the first community-surface presets:

```env
ARCH_SURFACE_PRESET=village
ARCH_GRAMMAR_PRESET=open-casts
ARCH_THEME_PRESET=daylight
ARCH_SIGNER_PUBLIC_KEY=0x...
FARCASTER_NETWORK=mainnet
```

For `tunnel-local`, this export requires the Cloudflare Tunnel route to be
provisioned. It does not include tunnel tokens, private signer material, mnemonic
material, or API tokens.
