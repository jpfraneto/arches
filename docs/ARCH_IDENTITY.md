# Arch Identity

Arches is a seed. An Arch is the village that grows from it.

The Arches project can provide installer code, setup routing, Cloudflare Tunnel
provisioning, and a Farcaster signer-request flow. It must not become the
identity that posts for every community.

## Roles

- Arches factory: publishes the installer and setup DNA.
- Setup broker: coordinates zero-info install sessions, QR verification, channel
  selection, slug reservation, and tunnel provisioning.
- Arch host: the verified Farcaster user running the appliance.
- Arch signer: the signer approved by the host FID and stored with that
  appliance.
- Farcaster: the source-of-truth protocol.

## App FID Boundary

An Arches app/factory FID may be needed to create Farcaster signer requests.
That FID is only a bootstrap/requesting identity.

It is not:

- the owner of every Arch
- the poster of every cast
- a custody layer for user signer keys
- a replacement for channel ownership or moderation

Every Arch should publish through a signer approved by the verified host FID.
That signer should live with the appliance the host runs.

## Channel Hosting

After QR approval, the setup broker can use Neynar or another Farcaster data API
to discover channels where the verified FID is eligible to host an Arch.

Eligibility should come from Farcaster channel state, for example:

- the FID is the channel lead
- the FID is a channel moderator

The terminal can then offer:

```text
Farcaster verified: FID 18350

You can host an Arch for:

[1] /anky      lead
[2] /example   moderator

Choose a channel:
```

Choosing a channel does not make the user the Farcaster channel owner. It only
launches an Arch for a channel the verified FID already controls or moderates.

## Unclaimed Subdomains

If someone visits an unclaimed hostname such as:

```text
some-community.arches.lat
```

the wildcard router should serve a creation page for that subdomain. The page
should invite the visitor to start the installer, scan a Farcaster QR, prove
channel eligibility, and launch the Arch.

## Product Law

Arches data must map 1:1 to Farcaster data. Local-only casts are not valid Arch
feed data. If Farcaster publishing is unavailable, posting must be disabled.
