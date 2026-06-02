# @arches/setup-schema

Discourse keeps setup disciplined by having the server define wizard steps,
fields, choices, completion state, and update behavior. This package starts the
same pattern for Arches.

The schema is intentionally renderer-neutral. A setup broker can return it as
JSON, `scripts/install.sh` can render it in a terminal, and a browser setup page
can render the same steps later.

The schema enforces the Arches setup order:

1. Verify Farcaster.
2. Prepare an Arch signer.
3. Choose an eligible Farcaster channel.
4. Reserve the Arch hostname.
5. Choose hosting.
6. Configure the surface.
7. Launch the appliance.
8. Verify publishing.
9. Unlock the Arch.

The composer can only be unlocked after Farcaster publishing is verified. Local
database writes are never treated as valid Arch feed data.
