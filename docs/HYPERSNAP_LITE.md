# Hypersnap Lite Contract

Hypersnap Lite is the write engine. Arches is the factory and appliance layer.
Farcaster is the protocol.

Arches must consume Hypersnap Lite through its Docker image/config contract:

```env
HYPERSNAP_LITE_IMAGE=ghcr.io/jpfraneto/hypersnap-lite:latest
HYPERSNAP_LITE_PLATFORM=linux/amd64
```

The Docker Compose template uses:

```yaml
image: ${HYPERSNAP_LITE_IMAGE:-ghcr.io/jpfraneto/hypersnap-lite:latest}
platform: ${HYPERSNAP_LITE_PLATFORM:-linux/amd64}
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

## Publishing Probe Contract

The setup broker must not unlock posting until the appliance proves that
Hypersnap Lite can publish Farcaster data for this Arch. The public probe shape
is:

```http
POST /api/publishing/probe
```

A passing response must be equivalent to:

```json
{
  "ok": true,
  "protocol": "farcaster",
  "status": "confirmed",
  "farcasterHash": "0x..."
}
```

Local-only probe responses are not valid. The broker-side
`ARCHES_PUBLISHING_VERIFICATION_PROVIDER=http-probe` provider rejects anything
that is not confirmed Farcaster proof.

## v0 Status

The v0 API marks new casts as `local`. It does not yet call Hypersnap Lite or
claim Farcaster submission. Future work should define the exact request/response
contract between `arches-api` and the `hypersnap-lite` service.

The current `POST /api/publishing/probe` endpoint returns `501` until that
contract is implemented. This is intentional: setup must fail closed rather
than unlock a local-only composer.
