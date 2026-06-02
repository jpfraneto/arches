# Arches Setup Contract

This document turns the Discourse setup lesson into an Arches implementation
contract. `ARCHES.md` defines the product law. `docs/DISCOURSE_TO_ARCHES.md`
explains the source model. This file defines what each setup step must prove,
write, and unlock.

## Discourse Pattern To Preserve

The current Discourse setup wizard is useful because it is a server boundary:

- `lib/wizard.rb` owns ordered steps, first incomplete step selection, and
  completion checks.
- `lib/wizard/builder.rb` defines the setup fields and lets extensions attach
  more wizard behavior.
- `lib/wizard/step.rb` and `lib/wizard/field.rb` keep steps, fields, and
  choices generic.
- `lib/wizard/step_updater.rb` applies accepted fields into durable settings
  and logs the completed step.
- `app/controllers/wizard_controller.rb` gates the wizard behind an admin user
  and returns serialized server-owned setup state.
- `frontend/discourse/app/static/wizard` renders fields generically and submits
  the current step back to the server.

Arches should preserve the shape, not the forum assumptions:

```text
server-defined schema -> generic terminal/browser renderer
current active step    -> only valid update target
step updater           -> durable side effects plus audit event
completion gate        -> normal product unlock only after proof
extension hook         -> provider boundary, not local fake state
```

## Arches Invariants

- The setup broker owns the setup schema.
- The installer, terminal view, browser setup page, and unclaimed subdomain page
  must render server-owned setup state instead of inventing their own order.
- Only the current active setup step may be submitted.
- Provider-backed actions may only run when the current active step exposes that
  action.
- Step completion must come from audited server events or durable appliance
  state, not from client optimism.
- Local-only casts are never valid Arch feed data.
- The composer stays locked until Hypersnap Lite has proven Farcaster
  publishing for this Arch.
- No setup path may accept manual host FID, manual channel ownership, private
  signer key material, mnemonic material, Cloudflare tokens, or tunnel tokens as
  durable broker state.

## Step Contract

| Step | Required proof | Durable state or artifact | Audit event | Unlocks |
| --- | --- | --- | --- | --- |
| `verify-farcaster` | Valid SIWF signature for the session nonce and broker domain. | Host FID and non-secret Farcaster profile hints. | `farcaster_verified` | Signer approval request. |
| `prepare-signer` | Provider confirms an approved signer for the verified host FID. | Signer public key and approved status. No private key. | `signer_request_created`, `signer_approved` | Channel eligibility lookup. |
| `choose-community` | Selected channel is in the provider-returned eligible channel list for the host FID. | Selected Farcaster channel slug and role metadata. | `channels_refreshed`, `step_submitted` | Slug reservation. |
| `name-surface` | Requested slug matches the selected eligible channel and is not already reserved. | Reserved slug and `*.arches.lat` domain. | `slug_reserved` | Hosting choice. |
| `choose-hosting` | Valid hosting mode from the server schema. | Hosting mode. Default is `tunnel-local`. | `step_submitted` | Surface configuration. |
| `configure-surface` | Valid surface preset, grammar preset, theme preset, title, and provenance label. | First appliance-visible surface settings. | `step_submitted` | Tunnel/config launch actions. |
| `launch-appliance` | For `tunnel-local`, Cloudflare Tunnel route is provisioned, non-secret Arch config is exported, and the public appliance health endpoint is verified. | Tunnel id, generated delivery command, non-secret env snapshot, and appliance launch marker. | `tunnel_provisioned`, `arch_config_exported`, `appliance_launched` | Publishing verification. |
| `verify-publishing` | Hypersnap Lite proves it can publish Farcaster data for this Arch signer and surface. | Publishing verified marker, probe cast id or equivalent proof. | `publishing_verified` | Composer unlock. |
| `unlock-arch` | Publishing is verified and the Farcaster proof is recorded. | Composer enabled marker. | `composer_unlocked` | Normal Arch product experience. |

## Current Scaffold Coverage

Implemented now:

- Server-owned setup schema in `packages/setup-schema`.
- Generic terminal renderer.
- Browser setup page driven by the same schema.
- Generic current-step updater.
- Generic current-action controller.
- Server-owned submit metadata for active field-backed steps.
- Server-owned status reasons for pending and blocked steps.
- Terminal refresh, browser handoff, action command, and submit command
  rendering from the shared schema.
- Farcaster verification provider boundary.
- Signer approval provider boundary.
- Neynar channel eligibility adapter.
- Cloudflare Tunnel provider boundary.
- Appliance launch verification provider boundary.
- Publishing verification provider boundary.
- API publishing probe endpoint that fails closed with `501` until Hypersnap
  Lite publishing is wired.
- Composer unlock action gated on recorded Farcaster publishing proof.
- In-memory setup audit events.
- Optional sanitized JSON-file setup store.
- Derived step provenance on completed schema steps.
- Non-secret Arch config export.
- Sanitized setup store snapshot boundary for future durable storage.
- Web composer lock derived from API publishing state.

Still required before this is shippable as the zero-info community creation
flow:

- Production SIWF recovery and mobile handoff behavior.
- Production signer approval provider and appliance-side signer storage.
- Production database store adapter for sessions, reservations, and audit
  events.
- Successful Hypersnap Lite publish probe that proves Farcaster publishing for
  the Arch.
- Production wildcard routing from unclaimed `*.arches.lat` hostnames to setup.
- Production auth and operator security around broker-only endpoints.

## Provider Boundary Rules

Provider boundaries are where Arches composes with external systems. They are
not places to fake protocol truth.

- Farcaster verification provider: derives the host FID from a real signed
  session challenge.
- Signer approval provider: creates and polls signer approval, returning only
  non-secret signer metadata to the broker.
- Channel eligibility provider: lists channels where the host FID can lead or
  moderate.
- Tunnel provisioning provider: creates the route and delivery command after
  identity and channel gates pass.
- Appliance launch provider: verifies the public Arch appliance health endpoint
  before publishing verification can start.
- Publishing provider: calls the public Arch publishing probe and must receive
  confirmed Farcaster proof from Hypersnap Lite before any composer unlock.

Default providers should fail closed. Local development may use explicit dev
switches, but dev-only state mutation must never be part of the public flow.

## Durable Storage Shape

The future durable store should persist:

- setup sessions and schema version
- host FID
- eligible channel facts that were returned for the session
- selected channel, reserved slug, and domain
- hosting mode and surface presets
- non-secret signer public key
- tunnel id and route status
- publishing verification proof
- setup audit events

It must not persist:

- signer private keys
- mnemonic material
- Farcaster relay channel tokens
- signer request tokens
- signer approval URLs after delivery
- Cloudflare API tokens
- Cloudflare Tunnel tokens
- full generated install commands containing secrets

The current JSON-file store persists this sanitized shape for local or small
operator deployments. Because sanitized audit events are included, a restarted
broker can reload the store and derive completed-step provenance again. A future
database-backed store should preserve the same redaction boundary.

## UI Translation

Discourse renders wizard fields generically and lets the server decide what the
current setup surface is. Arches should keep that model:

- QR fields for Farcaster and signer approval.
- Radio fields for hosting mode, community choice, and surface preset.
- Dropdown fields for grammar and theme presets.
- Status fields for tunnel, appliance, publishing, and composer readiness.
- Copy fields for fallback commands and non-secret env output.
- Action buttons only for server-exposed active-step actions.
- Terminal action and submit commands generated from the same active-step
  schema.
- Field-backed form submits generated from server-owned `submit` metadata, not
  renderer-side field inference.
- Pending and blocked explanations generated from server-owned `statusReason`
  metadata.

The terminal and browser should show the same current step, summary, validation
errors, audited provenance, and previous/current/next context. The browser can
be richer, but it must not invent extra permissions, identities, or unlock
states.
