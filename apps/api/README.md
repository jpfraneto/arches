# Arches API

Minimal Bun + Hono API for appliance v0.

Endpoints:

- `GET /health`
- `GET /api/arch`
- `GET /api/feed`
- `POST /api/casts`

The v0 implementation stores casts in memory and marks new casts as `local`.
It does not publish to Farcaster yet. The intended Postgres model is in
`schema.sql`.
