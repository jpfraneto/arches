# Arches Setup Broker

This is the first broker scaffold for the Discourse-inspired Arches setup flow.
It creates setup sessions and returns the shared setup schema plus terminal
rendering from `packages/setup-schema`.

The broker has a Farcaster verification provider boundary. The default provider
returns `501`, but the public API already rejects manual `fid`, `hostFid`, and
`adminFid` claims.

Enable the official Farcaster auth-client verifier with:

```bash
ARCHES_FARCASTER_VERIFIER=auth-client \
FARCASTER_ETH_RPC_URL=https://your-optimism-rpc.example \
bun run src/index.ts
```

`FARCASTER_AUTH_RELAY_URL` can override the default Farcaster auth relay.
`FARCASTER_ACCEPT_AUTH_ADDRESS=0` disables auth-address signatures and only
accepts custody-address signatures. The broker still requires the posted SIWF
nonce to match the setup session nonce before calling the verifier.

When the auth-client verifier is enabled, new setup sessions ask the Farcaster
auth relay for a sign-in channel. The session's Farcaster QR field becomes the
relay URL. The browser setup page renders that URL as an inline QR plus a link
and auto-polls the channel status until the verified FID advances setup.

Run locally:

```bash
bun install
bun run dev
```

Create a session:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions
```

Create a terminal-rendered session for the installer:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/terminal
```

Start a browser setup session:

```bash
open http://localhost:3020/setup
```

Render an unclaimed Arch page:

```bash
curl -H 'Host: anky.arches.lat' http://localhost:3020/
```

Render terminal output:

```bash
curl -fsSL http://localhost:3020/api/setup/sessions/SESSION_ID/terminal
```

Poll a Farcaster auth channel:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/farcaster/status
```

If the channel is pending, the setup session remains on `verify-farcaster`. If
the channel is completed, the broker verifies the returned SIWF message and
signature before deriving the host FID.

## Signer Approval

The broker has a signer approval provider boundary. The default provider fails
closed with `501`; it does not mint, store, or accept signer private keys.

Create a signer approval request after Farcaster verification:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/signer/request
```

Poll signer approval:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/signer/status
```

Only an approved signer for the verified host FID advances setup to channel
selection. The setup state may store a request URL and signer public key; it must
not store signer private keys, mnemonic material, or custody secrets.

The browser setup wizard exposes the same flow on the `Prepare Signer` step.
Before a request exists it renders `Request signer approval`; after the broker
creates a request URL it renders `Check signer approval`. Both browser actions
use the same provider boundary as the JSON API and fail closed when signer
approval is not configured.

## Step Updates

The broker exposes a Discourse-style generic step updater:

```bash
curl -fsSL -X POST \
  -H 'content-type: application/json' \
  -d '{"channel":"anky"}' \
  http://localhost:3020/api/setup/sessions/SESSION_ID/steps/choose-community
```

The updater validates submitted values against the current server-owned setup
schema. Only the current active step can be submitted. Steps that require real
protocol proof still return explicit errors instead of faking progress:

- `verify-farcaster` requires real Farcaster signature verification.
- `prepare-signer` requires signer approval from the verified host FID.
- `launch-appliance` requires broker tunnel provisioning and installer config
  delivery.
- `verify-publishing` requires a Hypersnap Lite/Farcaster publish probe.

The browser setup page renders active schema fields as forms that post to the
same updater model. This keeps the terminal and browser setup surfaces aligned
with the same server-defined setup session.

The browser renderer also consumes the schema's Discourse-style wizard
metadata: step index, display index, previous/next ids, status, icon name, and
choice extra labels. This keeps the visible setup order and channel role badges
server-owned instead of hard-coded in the browser shell.

The session response includes a server-derived setup summary with readiness,
progress count, blocked step count, current step title, and next action. The
terminal renderer and browser sidebar both display that summary so the host can
see setup status without reading the whole schema.

When browser form validation fails, the broker re-renders the same setup session
with field-level error descriptions instead of sending the host to a generic
error page. JSON API callers still receive the normal structured error response.

## Setup Audit Events

The broker records an in-memory audit trail for each setup session:

```bash
curl -fsSL http://localhost:3020/api/setup/sessions/SESSION_ID/events
```

Events are also included in the normal session response and rendered as a
compact setup log in the browser setup sidebar. Current events include session
creation, Farcaster verification, channel refresh, step submission, slug
reservation, tunnel provisioning, tunnel provisioning failure, and local
dev-state mutation.

This mirrors the useful Discourse pattern where wizard updates are logged by the
server after the step succeeds. The scaffold is intentionally in-memory for now;
production storage should make these events durable and queryable by session,
host FID, Arch slug, and domain.

The broker now also derives step provenance from those events. Completed steps
in the session schema can include `completedAt`, `completedByFid`,
`completionEventId`, and `completionEventType`, and the browser sidebar renders
that proof under the completed step. This keeps setup progress tied to audited
server actions rather than only local form state.

Audit events must not store private signer material, mnemonic data, Cloudflare
API tokens, tunnel tokens, or full generated install commands.

## Arch Config Export

The broker can export a non-secret Arch config snapshot after setup has enough
verified state:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/arch/config
```

The response includes structured JSON plus an `.env`-style block for the
appliance:

```text
ARCH_SLUG=anky
ARCH_DOMAIN=anky.arches.lat
ARCHES_MODE=tunnel-local
ARCH_ADMIN_FID=18350
ARCH_SUPPORT_EMAIL=support@arches.lat
ARCH_SIGNER_PUBLIC_KEY=0x...
ARCH_SURFACE_PRESET=village
ARCH_GRAMMAR_PRESET=open-casts
ARCH_THEME_PRESET=daylight
ARCH_SURFACE_TITLE=/anky
ARCH_PROVENANCE_LABEL=posted via anky
ARCHES_PUBLISHING_ENABLED=false
ARCHES_FARCASTER_PUBLISHING_STATUS=not_implemented
CLOUDFLARE_TUNNEL_ID=tunnel_123
```

For `tunnel-local`, export is gated on tunnel provisioning. The snapshot does
not include the Cloudflare Tunnel token, private signer material, mnemonic
material, or private API tokens. The installer command remains the delivery path
for the tunnel token until a safer installer handoff is implemented.

The browser launch step now exposes the same export as a wizard action. When the
host clicks `Export Arch config`, the broker logs `arch_config_exported`, stores
the non-secret env block on the setup session, and re-renders it as a copy field
inside the launch step. If earlier setup choices change, that exported env block
is cleared and must be regenerated.

The configure step follows the Discourse category-setup idea of choosing the
kind of space first. Arches currently exposes server-defined choices for surface
type, posting grammar, and theme; those choices are exported as appliance env.
The browser renderer keeps that distinction visible: surface type renders as
choice cards, while grammar and theme render as select fields backed by the same
server schema.

## Channel Eligibility

The broker has an optional channel eligibility provider. The public refresh
endpoint is gated on a session having a host FID:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/channels/refresh
```

Without a host FID, the endpoint returns `409`. The host FID must come from
Farcaster verification in the real flow; local tests can use the dev-state route
only when `ARCHES_SETUP_BROKER_DEV=1`.

Enable the Neynar provider with:

```bash
ARCHES_CHANNEL_PROVIDER=neynar \
NEYNAR_API_KEY=... \
bun run src/index.ts
```

The adapter reads Neynar's current channel list endpoint,
`GET https://api.neynar.com/v2/farcaster/channel/list/`, and maps channels where
the host FID is `lead.fid` or appears in `moderator_fids`.

## Tunnel Provisioning

The broker has a Cloudflare Tunnel provisioning provider scaffold. By default it
uses a no-op provider and fails closed:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/tunnel/provision
```

Provisioning is gated on the session already having:

- a host FID from Farcaster verification
- a selected eligible channel
- a reserved default `*.arches.lat` hostname
- `tunnel-local` hosting mode
- first surface configuration

Enable the Cloudflare provider with:

```bash
ARCHES_TUNNEL_PROVIDER=cloudflare \
CLOUDFLARE_ACCOUNT_ID=... \
CLOUDFLARE_ZONE_ID=... \
CLOUDFLARE_API_TOKEN=... \
bun run src/index.ts
```

The provider mirrors `scripts/provision-cloudflare-tunnel.sh`: it creates a
remotely managed Cloudflare Tunnel, configures ingress for the API and web
services, creates or updates the proxied CNAME, fetches the tunnel token, and
stores the explicit `tunnel-local` install command on the setup session.

This endpoint does not mark the appliance as launched. It only prepares the
route and command the installer needs. Posting still stays disabled until a real
Hypersnap Lite/Farcaster publish probe passes.

## Slug Reservation

The broker has an in-memory reservation primitive for `*.arches.lat` hostnames:

```bash
curl -fsSL -X POST http://localhost:3020/api/setup/sessions/SESSION_ID/slug/reserve
```

Reservation is gated on:

- a host FID already existing on the session
- an eligible Farcaster channel being selected
- the selected channel appearing in the session's eligible channel list

This scaffold only reserves the selected eligible channel slug. It does not
support arbitrary custom slugs yet, because custom names need their own verified
ownership rules.

For local tests only, `createSetupBrokerApp({ allowDevStateUpdates: true })`
enables a dev-only state mutation endpoint. The runtime server only enables that
endpoint when `ARCHES_SETUP_BROKER_DEV=1`.
