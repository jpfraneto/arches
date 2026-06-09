# Hypersnap Lite Contract

Hypersnap Lite is the write engine. Arches is the factory and appliance layer.
Farcaster is the protocol.

Arches consumes Hypersnap Lite through its public Docker/config/API contract:

```env
HYPERSNAP_LITE_IMAGE=ghcr.io/jpfraneto/hypersnap-lite:latest
HYPERSNAP_LITE_PLATFORM=linux/amd64
HYPERSNAP_LITE_URL=http://hypersnap-lite:3381
HYPERSNAP_LITE_HEALTH_PATH=/v1/info
```

The Docker Compose template uses:

```yaml
image: ${HYPERSNAP_LITE_IMAGE:-ghcr.io/jpfraneto/hypersnap-lite:latest}
platform: ${HYPERSNAP_LITE_PLATFORM:-linux/amd64}
```

## Boundary

The canonical Hypersnap Lite repo is `jpfraneto/hypersnap-lite`.

Hypersnap Lite is a low-level Farcaster write relay. It does not need to know
what an Arch is.

Arches owns:

- setup ceremony
- channel selection
- Arch slug/domain/surface config
- signer approval policy
- Farcaster message construction/signing policy
- community-specific provenance
- scoped feed records created through one Arch

Hypersnap Lite owns:

- accepting already signed Farcaster messages
- submitting them through its Snapchain/Farcaster write path
- returning the submitted Message result

Arches must not copy Hypersnap Lite internals or require Arches-specific
Hypersnap Lite endpoints.

## Current Hypersnap Lite Public Contract

The current public Hypersnap Lite runtime exposes:

- HTTP on `3381`
- Gossip UDP on `3382`
- gRPC on `3383`
- `GET /v1/info`
- `POST /v1/submitMessage`

`GET /v1/info` is the health/readiness primitive Arches uses to confirm the
write engine is reachable.

`POST /v1/submitMessage` accepts an already signed Farcaster `Message` protobuf:

```http
POST /v1/submitMessage
content-type: application/octet-stream

<signed Farcaster Message protobuf bytes>
```

If RPC auth is enabled, Arches must provide Hypersnap Lite credentials through
runtime config. Secrets must not be exposed to the web container or setup audit
JSON.

The response is the submitted Message represented as JSON. For a cast add,
Arches expects fields equivalent to:

```json
{
  "data": {
    "type": "MESSAGE_TYPE_CAST_ADD",
    "fid": 123,
    "castAddBody": {
      "text": "First cast through this Arch"
    }
  },
  "hash": "0x...",
  "hashScheme": "HASH_SCHEME_BLAKE3",
  "signature": "0x...",
  "signatureScheme": "SIGNATURE_SCHEME_ED25519",
  "signer": "0x..."
}
```

Arches validates the returned hash, message type, FID, signer, and text when
those fields are present.

## Arches Publishing Probe

The appliance probe is:

```http
POST /api/publishing/probe
```

It returns `200` only when all of these are true:

- selected Arch/channel config exists
- admin FID exists
- server-only `ARCH_SIGNER_PRIVATE_KEY` exists
- Arches can produce signed Farcaster protobuf bytes with `@farcaster/core`
- Hypersnap Lite `GET /v1/info` is reachable

A passing response includes non-secret readiness details:

```json
{
  "enabled": true,
  "engine": "hypersnap-lite",
  "arch": "anky",
  "adminFid": 123,
  "signerPublicKey": "0x...",
  "proofMode": "signed-farcaster-message-submit",
  "checkedAt": "2026-06-02T00:00:00.000Z"
}
```

If any boundary is missing, the probe fails closed with a specific reason and
next action. Local-only readiness is never accepted.

## Publishing Flow

`POST /api/casts` follows this boundary:

1. Validate text and selected Arch/channel config.
2. Require publishing readiness.
3. Use `@farcaster/core` to create signed `castAdd` protobuf bytes for the
   selected FID/signer/channel/provenance context.
4. Submit those bytes to Hypersnap Lite `POST /v1/submitMessage`.
5. Validate the returned Farcaster Message and hash.
6. Store only that real publish result in the scoped Arch feed.

Arches does not generate fake hashes and does not store local-only casts as feed
data.

## v0.1 Status

The adapter and API boundary now target Hypersnap Lite's existing primitives.
Arches builds signed castAdd protobuf bytes locally with `@farcaster/core` and
submits those bytes to `/v1/submitMessage`.

For v0.1 dev testing, `ARCH_SIGNER_PRIVATE_KEY` can be supplied manually in the
generated API env. It must stay server-only and must not be exposed to the web
container or setup audit JSON.

The remaining production gap is safe signer handoff from setup approval into the
generated API runtime.
