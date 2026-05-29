# Hypersnap Lite Contract

Hypersnap Lite is the write engine. Arches is the factory and appliance layer.
Farcaster is the protocol.

Arches must consume Hypersnap Lite through its Docker image/config contract:

```env
HYPERSNAP_LITE_IMAGE=ghcr.io/jpfraneto/hypersnap-lite:latest
```

The Docker Compose template uses:

```yaml
image: ${HYPERSNAP_LITE_IMAGE}
```

## Boundary

The canonical Hypersnap Lite repo is `jpfraneto/hypersnap-lite`.

Arches must not copy Hypersnap Lite source code because the responsibilities are
separate:

- Hypersnap Lite owns the write engine implementation.
- Arches owns installer flow, appliance templates, domain wiring, API/web/feed
  scaffolding, and community-specific provenance.
- Farcaster owns the protocol surface Arches writes to through the write engine.

Keeping this boundary makes the appliance replaceable and keeps this repo from
turning into a second implementation of Hypersnap Lite.

## v0 Status

The v0 API marks new casts as `local`. It does not yet call Hypersnap Lite or
claim Farcaster submission. Future work should define the exact request/response
contract between `arches-api` and the `hypersnap-lite` service.
