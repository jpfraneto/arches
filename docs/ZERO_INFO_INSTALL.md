# Zero-Info Install

The intended public flow is:

```bash
curl -fsSL https://install.arches.lat | bash
```

The user should not have to know their FID, pick a deployment mode, configure
DNS, create a Cloudflare account, or open ports.

## Target Flow

1. The installer creates a local install session.
2. The terminal shows a Farcaster sign-in URL and QR code.
3. The user scans the QR code in a Farcaster client.
4. The Arches control plane verifies the Farcaster signature.
5. The control plane derives the admin FID from the verified Farcaster account.
6. The control plane reserves a slug and domain such as `anky.arches.lat`.
7. The control plane provisions a Cloudflare Tunnel and DNS route.
8. The installer receives the verified config and tunnel token.
9. Docker Compose starts the local appliance plus `cloudflared`.

No admin identity should be accepted unless it comes from a verified Farcaster
signature. Do not fake admin verification.

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

Operators or a future control plane can provision the tunnel with:

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
primitive that should only be called after identity verification has happened.

## Cloudflare DNS Shape

Once `arches.lat` uses Cloudflare nameservers:

```text
arches.lat          -> landing/control surface
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

## Control Plane Contract

The missing production component is the Arches control plane. It should own:

- install sessions
- Farcaster QR/signature verification
- slug reservation
- tunnel provisioning
- tunnel token delivery to the installer
- tunnel revocation and recovery

The installer should eventually call the control plane when it receives no
arguments. Until that exists, `tunnel-local` is explicit and requires a tunnel
token.
