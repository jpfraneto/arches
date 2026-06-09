# Arches API

Minimal Bun + Hono API for the appliance.

Endpoints:

- `GET /health`
- `GET /api/arch`
- `GET /api/feed`
- `POST /api/casts`
- `POST /api/publishing/probe`
- `POST /api/quote`

The v0.1 implementation rejects local-only casts. It stores a feed record only
after the Hypersnap Lite adapter submits signed Farcaster message bytes and
receives a valid Farcaster hash/result. The intended future Postgres model is in
`schema.sql`.

The web composer reads `publishing.farcaster.enabled` from `GET /api/arch`.
While that value is false, the browser disables composer controls and the API
continues to reject `POST /api/casts` with the readiness failure status.

`POST /api/publishing/probe` returns `200` only when Arch config, channel config,
signer state, Arches-side message construction, and Hypersnap Lite `/v1/info`
are all ready. Otherwise it fails closed with a reason and next action.

Hypersnap Lite is consumed through its existing primitives:

```env
HYPERSNAP_LITE_URL=http://hypersnap-lite:3381
HYPERSNAP_LITE_HEALTH_PATH=/v1/info
ARCH_SIGNER_PUBLIC_KEY=0x...
ARCH_SIGNER_PRIVATE_KEY=0x...
FARCASTER_NETWORK=mainnet
```

Publishing uses:

```http
POST /v1/submitMessage
content-type: application/octet-stream

<signed Farcaster Message protobuf bytes>
```

Arches owns construction/signing policy and uses `@farcaster/core` to create the
signed protobuf bytes. Hypersnap Lite only relays signed messages.

The API reads the first surface defaults from appliance env:

```env
ARCH_CHANNEL_ID=anky
ARCH_CHANNEL_URL=https://warpcast.com/~/channel/anky
ARCH_SURFACE_TITLE=/anky
ARCH_PROVENANCE_LABEL=posted via anky
ARCH_SURFACE_PRESET=village
ARCH_GRAMMAR_PRESET=open-casts
ARCH_THEME_PRESET=daylight
FARCASTER_NETWORK=mainnet
```

These values are produced by the setup broker config snapshot and by the dev
installer defaults.

`POST /api/quote` is experimental and disabled unless
`ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED=true`. When enabled, it calculates the
configured discount for `paymentMethod: "arches_coin"`. It does not collect
payment or verify token transfers.
