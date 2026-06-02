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

Start a browser setup session:

```bash
open http://localhost:3020/setup
```

Render terminal output:

```bash
curl -fsSL http://localhost:3020/api/setup/sessions/SESSION_ID/terminal
```

For local tests only, `createSetupBrokerApp({ allowDevStateUpdates: true })`
enables a dev-only state mutation endpoint. The runtime server only enables that
endpoint when `ARCHES_SETUP_BROKER_DEV=1`.
