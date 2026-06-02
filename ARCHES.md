# ARCHES

Arches lets any community create its own Farcaster client in one command.

Arches is a seed. An Arch is the village that grows from it.

## Product Law

- Farcaster is the protocol.
- Hypersnap Lite is the write engine.
- Arches is the factory, installer, and setup DNA.
- An Arch is a custom social surface for one community.
- Each Arch has its own domain, feed, interface, grammar, provenance, host, and
  signer.
- The Arches feed only shows casts created through that Arch and published to
  Farcaster.
- Arches data must map 1:1 to Farcaster data.
- Local-only casts are not valid Arch feed data.
- Arches must not become a full Farcaster indexer.
- Arches must not custody private signer keys.
- Arches must not become the identity that posts for every community.

If Farcaster publishing is unavailable, posting must be disabled.

## The Core Flow

The intended public command is:

```bash
curl -fsSL https://install.arches.lat | bash
```

That command should:

1. Start a local install session.
2. Generate or prepare a local signer for the appliance.
3. Show a Farcaster QR code.
4. Let the user approve the signer from a Farcaster client.
5. Derive the host FID from that approval.
6. Query the Farcaster channels that host FID can lead or moderate.
7. Show those communities in the terminal.
8. Let the user choose one.
9. Reserve a hostname such as `anky.arches.lat`.
10. Provision a Cloudflare Tunnel for that hostname.
11. Start the local appliance.
12. Enable posting only once Farcaster publishing is wired.

The person running the command holds the community up. Arches does not.

## Identity Model

There may be an Arches app/factory FID used to create signer requests. That FID
is only a bootstrap requester.

It is not:

- the identity of every Arch
- the owner of every Arch
- the poster of every cast
- a custody layer for community signer keys
- a replacement for Farcaster channel roles

Every Arch should publish through a signer approved by the verified host FID.
That signer should live with the appliance the host runs.

## What Arches Brings

Arches does not replace Farcaster. It makes Farcaster locally inhabitable.

Arches brings:

- one-command community client creation
- default `*.arches.lat` hostnames
- Cloudflare Tunnel routing from user-run appliances
- community-specific interface and grammar
- provenance: posted through this Arch
- a feed scoped to casts created through the Arch
- a path from Farcaster channel stewardship to a dedicated community surface
- composable deployment: laptop, home server, VPS, or future managed host

Arches is a replication pattern. The factory exists to help communities spawn
their own homes, not to centralize them.

## Composability

An Arch is a composable layer over Farcaster.

The protocol layer is shared:

- FIDs
- casts
- channels
- signers
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

Because every Arch speaks Farcaster, casts can move through the global protocol.
Because every Arch has its own surface, communities can feel local, specific,
and inhabited.

This is the useful tension: shared protocol, local home.

## Inspired By Discourse

Arches is deeply inspired by Discourse, but it should not copy Discourse as a
forum product.

What worked about Discourse:

- It treated community software as infrastructure, not a content feed.
- It prioritized durable conversation and searchable knowledge over ephemeral
  engagement.
- It was open source at the core.
- It gave communities the option to self-host or use managed hosting.
- It made moderation, trust, customization, and plugins first-class.
- It understood that community health is partly a software-design problem.
- It gave each community its own home, URL, norms, and governance surface.

The opportunity for Arches:

- Discourse made standalone communities durable on the web.
- Farcaster gives communities a shared social protocol.
- Arches can combine both: local community homes with protocol-native identity,
  signing, distribution, and provenance.

Discourse communities own their space. Arches communities should own their
surface while speaking a shared protocol.

## What Arches Is Not

Arches is not:

- a hosted social network pretending to be decentralized
- a Farcaster indexer
- a universal client for every cast
- a custody provider for signer keys
- a dashboard-first SaaS
- a payment product
- a fake admin-verification layer

Arches should remain small enough that a community can understand what is
running, where it is running, and who holds the signer.

## Unclaimed Communities

If someone visits an unclaimed hostname:

```text
some-community.arches.lat
```

the router should not show a generic 404.

It should show:

- this Arch does not exist yet
- scan with Farcaster to prove you can host it
- choose an eligible channel/community
- launch the appliance

The empty hostname is an invitation to create the village.

## Current State

Working now:

- `https://arches.lat`
- `https://install.arches.lat`
- static installer endpoint
- Cloudflare Tunnel provisioning primitive
- `tunnel-local` appliance mode
- live `anky.arches.lat` tunnel-local appliance
- local-only posting is disabled

Not implemented yet:

- Farcaster signer request flow
- QR approval in the installer
- Neynar channel eligibility lookup
- channel-selection terminal UI
- Hypersnap Lite publishing contract
- persistent confirmed Arch feed
- wildcard unclaimed-subdomain creation page

## References

- Discourse positions itself as open-source community infrastructure focused on
  durable, searchable conversation and community ownership:
  https://www.discourse.org/about
- Discourse emphasizes open source, self-hosting, managed hosting, and avoiding
  proprietary lock-in:
  https://www.discourse.org/open-source
- Farcaster remains the protocol surface Arches must publish to:
  https://docs.farcaster.xyz/
