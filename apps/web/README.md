# Arches Web

Minimal Arch surface for the appliance.

The composer is gated by `GET /api/arch`. If
`publishing.farcaster.enabled` is not true, the browser disables all composer
controls and displays the API-provided publishing message. This mirrors the
setup rule: local-only casts are not valid Arch data.

When publishing is enabled, a successful post renders the returned Farcaster
hash and refreshes the scoped feed.

Run locally:

```bash
API_ORIGIN=http://localhost:3000 bun run server.ts
```

Test:

```bash
bun test
```
