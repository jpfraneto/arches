# Arches API

Minimal Bun + Hono API for appliance v0.

Endpoints:

- `GET /health`
- `GET /api/arch`
- `GET /api/feed`
- `POST /api/casts`
- `POST /api/quote`

The v0 implementation stores casts in memory and marks new casts as `local`.
It does not publish to Farcaster yet. The intended Postgres model is in
`schema.sql`.

The API reads the first surface defaults from appliance env:

```env
ARCH_SURFACE_TITLE=/anky
ARCH_PROVENANCE_LABEL=posted via anky
ARCH_SURFACE_PRESET=village
ARCH_GRAMMAR_PRESET=open-casts
ARCH_THEME_PRESET=daylight
```

These values are produced by the setup broker config snapshot and by the
explicit installer defaults.

`POST /api/quote` is experimental and disabled unless
`ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED=true`. When enabled, it calculates the
configured discount for `paymentMethod: "arches_coin"`. It does not collect
payment or verify token transfers.
