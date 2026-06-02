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
7. The terminal asks the user which channel/community to launch.
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

## Current Shippable Primitive

The repo now supports the runtime shape required by the target flow:

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
- `postgres`
- `redis`
- `hypersnap-lite`
- `cloudflared`

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

The missing production component is a setup broker. It should coordinate:

- install sessions
- Farcaster QR/signature verification for the host FID
- local signer-key approval
- Farcaster channel eligibility lookup
- slug reservation
- tunnel provisioning
- tunnel token delivery to the installer
- tunnel revocation and recovery

The broker should not own the Arch identity. The appliance host owns the local
process and the signer that publishes to Farcaster. The installer should
eventually call this broker when it receives no arguments. Until that exists,
`tunnel-local` is explicit and requires a tunnel token.

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

For `tunnel-local`, this export requires the Cloudflare Tunnel route to be
provisioned. It does not include tunnel tokens, signer material, mnemonic
material, or API tokens.
