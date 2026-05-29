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

`POST /api/quote` is experimental and disabled unless
`ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED=true`. When enabled, it calculates the
configured discount for `paymentMethod: "arches_coin"`. It does not collect
payment or verify token transfers.
