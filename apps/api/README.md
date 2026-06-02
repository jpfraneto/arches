# Arches API

Minimal Bun + Hono API for appliance v0.

Endpoints:

- `GET /health`
- `GET /api/arch`
- `GET /api/feed`
- `POST /api/casts`
- `POST /api/publishing/probe`
- `POST /api/quote`

The v0 implementation rejects local-only casts. It does not publish to
Farcaster yet. The intended Postgres model is in `schema.sql`.

The web composer reads `publishing.farcaster.enabled` from `GET /api/arch`.
While that value is false, the browser disables composer controls and the API
continues to reject `POST /api/casts` with `501`.

`POST /api/publishing/probe` is the future setup-broker proof endpoint for
Hypersnap Lite publishing. It intentionally returns `501` until the API can
return confirmed Farcaster proof.

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
