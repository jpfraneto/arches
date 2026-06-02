# Arches Setup Broker

This is the first broker scaffold for the Discourse-inspired Arches setup flow.
It creates setup sessions and returns the shared setup schema plus terminal
rendering from `packages/setup-schema`.

The broker does not verify Farcaster identity yet. It deliberately returns `501`
for the verification endpoint and does not accept manual admin FID input on the
public API.

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
