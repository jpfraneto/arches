# ARCHES

Arches lets any community create its own Farcaster client in one command.

This is the master product document for the repo. It defines the philosophy,
identity model, protocol boundaries, and Discourse-inspired product posture that
all implementation work should preserve.

## Thesis

Arches is a seed. An Arch is the village that grows from it.

The internet has many global feeds and very few durable local homes. Discourse
proved that communities want their own address, norms, moderation model,
knowledge base, interface, and sense of place. Farcaster adds a shared social
protocol underneath that local experience. Arches exists to join those two
ideas:

```text
shared protocol, local home
```

An Arch should feel like a community's own place while still writing to the
same Farcaster protocol surface as everyone else.

## Product Law

- Farcaster is the protocol.
- Hypersnap Lite is the write engine.
- Arches is the factory, installer, setup DNA, and routing layer.
- An Arch is a custom social surface for one community.
- Each Arch has its own domain, feed, interface, grammar, provenance, host, and
  signer.
- Arches data must map 1:1 to Farcaster data.
- The Arch feed only shows casts created through that Arch and published to
  Farcaster.
- Local-only casts are not valid Arch feed data.
- If Farcaster publishing is unavailable, posting must be disabled.
- Arches must not become a full Farcaster indexer.
- Arches must not custody private signer keys.
- Arches must not become the identity that posts for every community.
- Arches must not fake admin, host, signer, or channel verification.

The protocol is law. Arches can compose on top of Farcaster, but it cannot
pretend that local database writes are Farcaster casts.

## Vocabulary

- Arches: the factory that publishes the installer, setup broker, templates,
  docs, and default routing.
- Arch: one community's Farcaster-native social surface.
- Host: the verified Farcaster user running or responsible for the appliance.
- Signer: the Farcaster signer approved by the host and stored with the
  appliance.
- Appliance: the Docker Compose stack that runs one Arch.
- Setup broker: the control plane that coordinates QR verification, channel
  eligibility, slug reservation, tunnel provisioning, and installer config.
- Hypersnap Lite: the write engine consumed through a Docker image/config
  contract.
- Farcaster: the source-of-truth protocol for identity, signing, channels, and
  casts.

## Core Flow

The intended public command is:

```bash
curl -fsSL https://install.arches.lat | bash
```

That command should:

1. Start a setup session.
2. Generate or prepare a local signer for the appliance.
3. Show a Farcaster QR code.
4. Let the user approve the signer from a Farcaster client.
5. Derive the host FID from that approval.
6. Query the Farcaster channels that host FID can lead or moderate.
7. Show those communities in the terminal and browser setup page.
8. Let the user choose one eligible community.
9. Reserve a hostname such as `anky.arches.lat`.
10. Provision a Cloudflare Tunnel route for that hostname.
11. Render the appliance config and start Docker services.
12. Run a Farcaster publishing probe through Hypersnap Lite.
13. Enable posting only after publishing is verified.

The person running the command holds the community up. Arches helps them spawn
the home, but Arches is not the home.

## Identity Model

There may be an Arches app or factory FID used to create signer requests. That
FID is only a bootstrap requester.

It is not:

- the identity of every Arch
- the owner of every Arch
- the poster of every cast
- a custody layer for community signer keys
- a replacement for Farcaster channel roles

Every Arch should publish through a signer approved by the verified host FID.
That signer should live with the appliance the host runs.

## Composability

An Arch is a composable layer over Farcaster.

The protocol layer is shared:

- FIDs
- casts
- channels
- signers
- reactions
- replies
- social graph

The Arch layer is local:

- domain
- surface
- feed boundary
- interface density
- posting grammar
- moderation defaults
- provenance label
- community affordances
- theme and layout
- hosting mode

This separation is the point. The global protocol stays interoperable, while
each community can develop a specific home, culture, and interface.

Composability means an Arch can be small without being isolated. A cast created
through one Arch can still be a Farcaster cast. A community surface can be
custom without becoming a private database. A host can run the appliance on a
laptop, home server, VPS, or future managed host without changing the protocol
underneath.

## Programmable Links

Wildcard routing is the programmable link layer.

If someone visits:

```text
some-community.arches.lat
```

and no Arch exists for that slug, Arches should not show a generic 404. It
should show a creation page for that exact hostname:

```text
This Arch does not exist yet.

To host it:
curl -fsSL https://install.arches.lat | bash
```

After QR verification, the broker checks whether the verified FID can host a
matching Farcaster channel. If yes, it reserves the hostname and provisions the
tunnel. If no, it shows the communities that FID is eligible to host.

That makes links programmable without making Arches a custody layer:

- missing `*.arches.lat` hostnames invite creation
- existing hostnames route to user-run appliances
- channel eligibility comes from Farcaster state
- setup derives identity from signing, not from forms

## What Discourse Proved

Arches is deeply inspired by Discourse, but it should not copy Discourse as a
forum product.

What worked:

- Community software is infrastructure, not just a feed.
- Each community gets its own durable URL, norms, knowledge base, staff tools,
  and governance surface.
- Setup is opinionated. The product guides the operator from blank instance to
  usable community instead of dropping them into raw configuration.
- The server owns the setup schema. The UI renders setup steps and fields from a
  product-defined model.
- Moderation, trust, roles, customization, integrations, and community health
  are first-class product surfaces.
- Themes and plugins let communities change the experience without forking the
  whole platform.
- Open source matters because community infrastructure must be auditable,
  forkable, and extendable.
- Self-hosting and managed hosting can coexist when the software avoids lock-in.
- Data ownership matters. Communities need exportability, operational control,
  and a path away from any single provider.

Discourse made independent web communities feel like real homes. Its public
positioning emphasizes customizable community spaces, many use cases, themes
and plugins, open source, data control, and the choice to self-host or use
managed hosting. Its code-level setup model reinforces the same lesson: a
community product needs a durable setup boundary, not a decorative onboarding
screen.

## The Arches Opportunity

Discourse made standalone communities durable on the web. Farcaster makes
identity, signing, channels, and social distribution protocol-native. Arches can
combine both:

```text
Discourse: durable community home on the web
Farcaster: shared identity and social protocol
Hypersnap Lite: write engine
Arches: factory, setup DNA, routing, and local community surface
```

The opportunity is not to rebuild forums. The opportunity is to make Farcaster
communities locally inhabitable:

- a village can have its own client
- a channel can have its own front door
- a cast can carry provenance from the surface that created it
- a non-technical host can launch by pasting one command and scanning one QR
  code
- infrastructure can be replicated instead of centralized

Arches should feel like Discourse in its respect for community ownership and
setup quality, but Farcaster-native in its identity, write path, and data
model.

## What Arches Brings

Arches brings:

- one-command community client creation
- default `*.arches.lat` hostnames
- Cloudflare Tunnel routing from user-run appliances
- Docker Compose appliance templates
- a Farcaster-first setup flow
- community-specific interface and grammar
- provenance: posted through this Arch
- a feed scoped to casts created through the Arch
- channel eligibility derived from Farcaster state
- explicit composer lock until Farcaster publishing is verified
- a path from Farcaster channel stewardship to a dedicated community surface
- composable deployment: laptop, home server, VPS, or future managed host

Arches is a replication pattern. The factory exists to help communities spawn
their own homes, not to centralize them.

## What Arches Should Not Copy

Arches should not inherit Discourse's forum assumptions:

- Do not make topics/categories the core primitive. Farcaster casts, channels,
  FIDs, and signers are the primitives.
- Do not make email/account creation the first identity layer. The first
  identity proof is Farcaster signing.
- Do not make local database content the protocol truth.
- Do not turn Arches into a global indexer.
- Do not make Arches the universal posting identity.
- Do not hide infrastructure ownership. A laptop can go offline; an always-on
  machine or VPS is more reliable.
- Do not turn the first version into payments, accounts, dashboards, or a SaaS
  admin product.

## Current Implementation Map

Implemented scaffolding in this repo:

- static public website in `site/`
- raw installer endpoint in `site/install`
- explicit appliance installer in `scripts/install.sh`
- Docker Compose appliance templates in `templates/`
- `local`, `vps`, `existing-proxy`, and `tunnel-local` install modes
- Cloudflare Tunnel provisioning primitive in
  `scripts/provision-cloudflare-tunnel.sh`
- API/web scaffolds in `apps/api` and `apps/web`
- local-only posting rejection until Farcaster publishing is wired
- setup schema package in `packages/setup-schema`
- setup broker scaffold in `apps/setup-broker`
- terminal and browser setup rendering
- server-derived setup summary/readiness rendering
- generic current-step setup updater for schema-backed fields
- Discourse-style setup step metadata, browser progress, and field-error rendering
- Farcaster verification provider boundary with per-session nonce/domain
  challenge
- optional official Farcaster auth-client SIWF verifier
- Farcaster auth relay channel creation and status polling scaffold
- inline SIWF QR rendering and browser auto-polling scaffold
- signer approval provider boundary and setup-session polling scaffold
- Cloudflare Tunnel provider boundary and setup-session provisioning endpoint
- in-memory setup audit events for broker actions
- derived completed-step provenance in setup responses
- non-secret Arch config snapshot export from setup state
- browser launch-step review for exported non-secret Arch config env
- server-defined surface, grammar, and theme presets for Arch setup
- unclaimed hostname setup invitation scaffold
- optional Neynar channel eligibility adapter
- in-memory eligible-channel slug reservation scaffold

Not implemented yet:

- production SIWF recovery, timeout, and mobile handoff UX
- production signer request provider and appliance-side signer storage
- production-authenticated Cloudflare Tunnel provisioning behind the broker
- persistent setup sessions, audit events, and reservations
- production channel-selection terminal UI
- Hypersnap Lite publishing contract
- publish probe and composer unlock
- confirmed Arch feed persistence from Farcaster-published casts
- wildcard production routing for all unclaimed subdomains

The current repo is a scaffold for the product law. It should continue to
prefer small, explicit, verifiable primitives over fake completeness.

## Operating Principle

When in doubt, preserve the core flow:

```text
paste command -> scan QR -> derive host -> choose eligible community -> launch
```

Do not ask users for information that can be derived from verified Farcaster
state. Do not accept manual claims when the protocol can prove the claim. Do not
enable posting until the write path reaches Farcaster.

The best version of Arches lets a zero-technical community host create a real
Farcaster-native home without understanding DNS, tunnels, signers, Docker, or
deployment modes.

## References

- Discourse public positioning: https://www.discourse.org/
- Discourse open source repository: https://github.com/discourse/discourse
- Detailed Discourse setup translation: `docs/DISCOURSE_TO_ARCHES.md`
- Arches identity model: `docs/ARCH_IDENTITY.md`
- Zero-info install target: `docs/ZERO_INFO_INSTALL.md`
- Farcaster docs: https://docs.farcaster.xyz/
