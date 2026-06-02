# Discourse to Arches

Arches is not a forum clone. The useful Discourse lesson is not topics,
categories, or email accounts. The useful lesson is how Discourse turns
community software into a durable home that a real community can own,
configure, moderate, and extend.

Discourse proved that community infrastructure works when setup is opinionated,
self-hosting remains possible, managed hosting can exist without lock-in, and
the product treats community health as a first-class software problem. Arches
should bring that same posture to Farcaster: shared protocol, local home,
community-owned surface.

## Source Study

This review used the public Discourse repository:

```text
https://github.com/discourse/discourse
```

The setup flow is concentrated in a small set of files:

- `lib/wizard.rb`: ordered steps, completion checks, first incomplete step.
- `lib/wizard/builder.rb`: builds the setup schema for staff users.
- `lib/wizard/step.rb`: step and update callback registration.
- `lib/wizard/field.rb`: generic field and choice definitions.
- `lib/wizard/step_updater.rb`: validates and applies settings.
- `app/controllers/wizard_controller.rb`: admin-gated wizard JSON endpoint.
- `app/serializers/wizard*_serializer.rb`: server schema exposed to the UI.
- `frontend/discourse/app/static/wizard/models/wizard.js`: client model,
  validation, serialization, and save behavior.
- `frontend/discourse/app/static/wizard/components/wizard-step.gjs`: generic
  step renderer.
- `frontend/discourse/app/static/wizard/components/wizard-field.gjs`: generic
  field renderer.
- `frontend/discourse/app/static/wizard/components/fields/*.gjs`: reusable text,
  radio, and dropdown fields.
- `frontend/discourse/admin/routes/new-category/setup.js` and
  `frontend/discourse/admin/templates/new-category/setup.gjs`: a later guided
  creation flow for community spaces inside an already configured site.
- `config/site_settings.yml`, `app/models/site_setting.rb`, and
  `app/services/staff_action_logger.rb`: durable settings and audit trail.

## What Worked

Discourse's setup model works because the wizard is a product boundary, not a
decorative onboarding screen.

- The server owns the setup schema. The client renders whatever steps and fields
  the server says are valid.
- Steps are explicit and ordered. The product can resume at the first incomplete
  step instead of asking the user to understand internal state.
- Fields are generic. Text, radio, dropdown, uploads, and choices can be reused
  across setup surfaces.
- Updates have side effects. Completing a step writes durable settings, reseeds
  defaults when needed, and logs that the setup happened.
- Completion is gated. Discourse checks whether the first real admin has
  completed the wizard before letting the normal product experience take over.
- Community shape is configurable early. Title, language, public/private mode,
  invite policy, user approval, theme, and category choices are not afterthoughts.
- Plugins and later admin flows can extend the setup model without replacing the
  whole product.

The category setup flow reinforces the same idea at a smaller scope: ask the
community operator what kind of space they are creating, show concrete choices,
and then move into a focused configuration screen.

## What Not To Copy

Arches should not inherit Discourse's forum assumptions.

- Do not make local database content the protocol truth. Arches data must map
  1:1 to Farcaster data.
- Do not make email/account creation the first identity layer. The first
  identity proof is Farcaster signing.
- Do not copy Discourse's topic/category model as the core social primitive.
  Farcaster casts, channels, FIDs, and signers are the primitives.
- Do not turn Arches into a global indexer. Each Arch reads enough to render its
  own surface and provenance.
- Do not make Arches the universal posting identity. Each Arch needs its own
  host FID and signer.
- Do not hide infrastructure ownership. A local appliance on a laptop can go
  offline; an always-on machine or VPS is more reliable.

## Arches Translation

The Discourse wizard maps to an Arches setup broker plus installer session.

```text
Discourse server wizard schema -> Arches setup session schema
Discourse admin user           -> verified Farcaster host FID
Discourse site settings        -> Arch config and appliance .env
Discourse category setup       -> Farcaster channel / Arch creation
Discourse staff action log     -> setup audit and provenance log
Discourse normal app unlock    -> composer unlock after publish probe
```

The key change is that Arches must verify identity before it asks for
configuration. The user should not manually provide a FID, slug, channel, or
admin claim. The terminal command starts the session, the QR scan proves the
host identity, and the setup broker derives the rest.

## Target Setup Flow

The public command should remain:

```bash
curl -fsSL https://install.arches.lat | bash
```

That command should produce a Discourse-style setup flow, but rendered for both
terminal and web:

1. Create a local install session.
2. Display a Farcaster QR code.
3. Verify the signature and derive the host FID.
4. Request or prepare a signer that will live with the appliance.
5. Query Farcaster channel eligibility for that host FID.
6. Show eligible channels and roles in the terminal.
7. Let the host choose the community to launch.
8. Reserve the slug and `*.arches.lat` hostname.
9. Provision a Cloudflare Tunnel route for that hostname.
10. Render appliance config and start Docker services.
11. Run a Farcaster publishing probe through Hypersnap Lite.
12. Unlock the composer only after publishing succeeds.

If publishing cannot be proven, the Arch may render read-only setup state, but
it must not accept local-only casts.

## Setup Schema

Arches should define setup as data so the same session can be rendered in a
terminal, a local browser page, or the unclaimed `*.arches.lat` page.

Example shape:

```json
{
  "sessionId": "setup_123",
  "start": "verify-farcaster",
  "steps": [
    {
      "id": "verify-farcaster",
      "title": "Verify Farcaster",
      "fields": [
        {
          "id": "qr",
          "type": "qr",
          "required": true
        }
      ]
    },
    {
      "id": "choose-community",
      "title": "Choose Community",
      "fields": [
        {
          "id": "channel",
          "type": "radio",
          "required": true,
          "choices": [
            {
              "id": "anky",
              "label": "/anky",
              "description": "lead"
            }
          ]
        }
      ]
    },
    {
      "id": "launch",
      "title": "Launch Arch",
      "fields": [
        {
          "id": "hostname",
          "type": "text",
          "required": true,
          "value": "anky.arches.lat"
        }
      ]
    }
  ]
}
```

The renderer should stay boring:

- `text`: slug, hostname override, support email fallback.
- `radio`: deployment target, eligible channel, theme preset.
- `dropdown`: language, channel list, grammar preset.
- `qr`: Farcaster signer approval.
- `status`: tunnel, Docker, publish probe, feed sync.
- `copy`: explicit command fallback.

The updater is where the product law lives. For example, the publish step can
write `ARCHES_PUBLISHING_ENABLED=true` only after a real Farcaster publish probe
passes.

## First Arches Wizard Steps

The first production setup flow should have these steps:

- Verify Farcaster: scan QR, derive host FID, reject unverified manual admin
  input.
- Prepare signer: create or request a signer for this Arch, stored with the
  appliance, not by Arches as a central custodian.
- Choose community: list channels the host FID leads or moderates.
- Name surface: reserve slug and hostname, defaulting to the channel slug.
- Choose hosting: default to `tunnel-local`; offer local-only testing and VPS as
  explicit advanced paths.
- Configure surface: lightweight theme, title, grammar, and provenance label.
- Launch appliance: render `.env`, compose files, tunnel token, and start
  Docker.
- Verify publishing: send a controlled Farcaster publish probe or equivalent
  Hypersnap Lite readiness check.
- Unlock Arch: enable composer and show the live hostname.

## Unclaimed Subdomains

Wildcard routing is the programmable link layer.

When a visitor opens:

```text
some-community.arches.lat
```

and no Arch is reserved for that slug, the router should serve a creation page
for that exact hostname. The page should not ask the visitor to claim ownership
with a form. It should offer the one-liner and a Farcaster QR path:

```text
This Arch does not exist yet.

To host it:
curl -fsSL https://install.arches.lat | bash
```

After QR verification, the broker checks whether the verified FID can host a
matching Farcaster channel. If yes, it reserves the hostname and provisions the
tunnel. If no, it can show eligible channels instead.

This makes links programmable without making Arches a custody layer:

- `*.arches.lat` can be an invitation to create.
- Existing hostnames route to user-run appliances.
- Missing hostnames route to setup.
- Channel eligibility comes from Farcaster, not from an Arches form.

## Proposed Arches Modules

The next implementation should add a setup broker. It can start small.

```text
apps/setup-broker/
  sessions
  Farcaster QR verification
  Neynar channel lookup adapter
  slug reservation
  Cloudflare Tunnel provisioning adapter
  installer config delivery

packages/setup-schema/
  step definitions
  field definitions
  validation helpers
  terminal renderer contract
  browser renderer contract

scripts/install.sh
  zero-argument setup session client
  explicit fallback flags preserved

site/
  arches.lat homepage
  install endpoint
  unclaimed-host creation surface
```

The broker is allowed to coordinate. It is not allowed to own every Arch.

`apps/setup-broker` now contains the first in-memory session API for this model.
It creates setup sessions, serves schema JSON, serves terminal output, serves a
focused browser setup page at `/setup`, renders unclaimed `*.arches.lat`
hostnames as setup invitations, includes an optional Neynar channel eligibility
adapter, includes a generic current-step updater for schema-backed browser/API
submissions, includes the first Cloudflare Tunnel provisioning provider boundary,
records an in-memory setup audit trail for successful setup actions, and
includes a Farcaster verification provider boundary that rejects manual identity
claims. It can use the official Farcaster auth-client verifier when
`ARCHES_FARCASTER_VERIFIER=auth-client`; in that mode it creates Farcaster auth
relay channels, stores the relay URL on the setup session, polls channel status,
verifies completed SIWF messages before deriving the host FID, and renders an
inline QR with browser auto-polling on the setup page. Otherwise the default
verification provider intentionally returns `501`.

The broker also has the first signer approval provider boundary. It can create
a signer request URL, poll signer status, and advance setup only when the
approved signer FID matches the verified host FID. The current default provider
fails closed; setup state may store a request URL and signer public key, but
must not store signer private keys, mnemonic material, or custody secrets.
The browser wizard now exposes those same request/status actions on the
`Prepare Signer` step, so the operator can continue setup from the Discourse-like
UI while still using the broker provider boundary underneath.

The browser wizard also exposes channel lookup as a provider-backed
`Choose Community` action. `Refresh eligible channels` calls the same
host-FID-gated channel eligibility provider as the API endpoint, records
`channels_refreshed`, and re-renders the eligible Farcaster channels with role
badges. This follows the Discourse lesson that the wizard should make setup
state visible, while preserving the Arches rule that channel ownership is
derived from Farcaster state and never typed in as a claim.

`packages/setup-schema` now contains the first concrete version of this shape:
renderer-neutral setup steps, fields, choices, completion state, submission
validation, a terminal renderer, and the product invariant that composer unlock
remains blocked until Farcaster publishing has been verified.

The schema now carries Discourse-like step metadata as well: `index`,
`displayIndex`, `previousStepId`, `nextStepId`, status, icon name, fields,
choices, and choice extra labels. That mirrors the useful part of Discourse's
wizard serializers while keeping Arches' Farcaster-first setup contract.
It also carries a server-derived setup summary with readiness, progress count,
blocked step count, current step title, and next action so terminal and browser
renderers share the same operator status model.
It also supports field-level error descriptions so browser submissions can stay
inside the wizard when validation fails.

The broker audit trail is the first Arches equivalent of Discourse's wizard
history logging. Discourse records completed wizard steps through user history
and logs setting changes through server-side staff action logging. Arches should
eventually persist setup events for host verification, channel eligibility, slug
reservation, tunnel provisioning, appliance launch, publish probes, and composer
unlock. These events should prove setup provenance without storing signer
secrets, mnemonic material, API tokens, tunnel tokens, or full install commands.
The broker now derives completed-step provenance from those audit events and
attaches `completedAt`, `completedByFid`, `completionEventId`, and
`completionEventType` to completed setup steps. The browser sidebar and terminal
rendering can show that proof directly next to the step.

The broker also exports the first Arch config snapshot. This is the Arches
equivalent of Discourse applying wizard fields into `SiteSetting`: verified
session state becomes appliance config fields such as `ARCH_SLUG`,
`ARCH_DOMAIN`, `ARCH_ADMIN_FID`, `ARCH_SURFACE_PRESET`,
`ARCH_GRAMMAR_PRESET`, `ARCH_THEME_PRESET`, `ARCH_SURFACE_TITLE`, and
`ARCH_PROVENANCE_LABEL`. When available, it may also include non-secret
`ARCH_SIGNER_PUBLIC_KEY`. The snapshot is intentionally non-secret and does not
carry tunnel tokens or private signer material.
The browser launch step can now apply that same export from inside the wizard:
it logs `arch_config_exported`, stores the non-secret env block on the session,
and renders it as a copy field for review. Upstream setup changes clear the
exported env block so stale settings are not reused.

The first configure-surface choices now mirror the useful Discourse category
setup pattern: pick the kind of space before detailed configuration. Arches
starts with surface presets (`village`, `bulletin`, `library`), grammar presets
(`open-casts`, `curated-updates`, `knowledge-base`), and theme presets
(`daylight`, `high-contrast`, `night`).

The browser setup renderer now preserves that UI model: the current step shows
its server-owned step count, the sidebar shows indexed progress and step icons,
channel choices can show role badges from the schema, and the surface preset is
a card chooser while grammar and theme are select fields. Validation failures
re-render the same setup page with inline field errors instead of a generic
error screen. This keeps the Discourse category-type-card and field-error ideas
while leaving Arches' setup schema, broker, Cloudflare routing, and appliance
config as the underlying infra.

## Implementation Phases

1. Define setup session schema and terminal renderer (implemented in
   `packages/setup-schema`).
2. Add setup broker session API with in-memory storage for local development
   (started in `apps/setup-broker`).
3. Add browser/API step updater for the current active setup step (started in
   `apps/setup-broker`).
4. Add Farcaster QR verification and host FID derivation (provider boundary,
   auth-client SIWF verifier, relay-channel creation, and status polling started
   in `apps/setup-broker`; inline QR rendering and browser auto-polling
   scaffold started; production recovery and mobile handoff UX still needed).
5. Add Neynar channel lookup for eligible channels (adapter and browser refresh
   action started in `apps/setup-broker`).
6. Add slug reservation for `*.arches.lat` (started with in-memory reservation
   in `apps/setup-broker`).
7. Move Cloudflare Tunnel provisioning behind the broker (provider boundary and
   session endpoint started in `apps/setup-broker`).
8. Add setup audit/provenance events (started as in-memory events in
   `apps/setup-broker`; completed-step provenance now derived into session
   schema).
9. Add Arch config export from setup state and browser launch-step review
   (started in `apps/setup-broker`).
10. Add community surface/grammar/theme presets (started in
   `packages/setup-schema` and exported by `apps/setup-broker`).
11. Add Discourse-like wizard step metadata and browser rendering for step
   count, indexed progress, icons, choice badges, and inline field errors
   (started in
   `packages/setup-schema` and `apps/setup-broker`).
12. Add server-derived setup summary/readiness for terminal and browser
   renderers (started in `packages/setup-schema` and `apps/setup-broker`).
13. Teach `scripts/install.sh` to call the broker when no flags are passed
   (started with the terminal session handoff).
14. Add unclaimed-subdomain page and wildcard routing (started in
   `apps/setup-broker`).
15. Add production signer request provider and appliance-side signer storage
   (provider boundary and browser step actions started in `apps/setup-broker`).
16. Wire Hypersnap Lite publish probe.
17. Enable posting only when the publish contract is confirmed.

## Product Principle

Discourse made independent web communities feel like real homes. Arches should
make Farcaster communities feel locally inhabited without leaving the protocol.

That is the opportunity:

- Discourse: durable community home on the web.
- Farcaster: shared identity and social protocol.
- Hypersnap Lite: write engine.
- Arches: factory, setup DNA, routing, and local community surface.

Arches wins if a non-technical host can paste one command, scan a QR code, pick
their community, and keep a real Farcaster-native home alive from their own
machine.
