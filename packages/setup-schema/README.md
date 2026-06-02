# @arches/setup-schema

Discourse keeps setup disciplined by having the server define wizard steps,
fields, choices, completion state, and update behavior. This package starts the
same pattern for Arches.

The schema is intentionally renderer-neutral. A setup broker can return it as
JSON, `scripts/install.sh` can render it in a terminal, and a browser setup page
can render the same steps later.

Like Discourse's wizard serializer, each step carries server-owned wizard
metadata: zero-based `index`, one-based `displayIndex`, previous/next step ids,
status, icon name, fields, choices, and choice badges. Renderers should display
that metadata rather than inventing their own setup order.

The schema also supports field-level error descriptions. Browser renderers can
re-render the same setup session with invalid fields marked, matching the useful
Discourse pattern of keeping the operator inside the wizard after validation
fails.

The schema enforces the Arches setup order:

1. Verify Farcaster.
2. Prepare an Arch signer. The schema may show a signer approval URL and public
   key metadata, but never private signer material.
3. Choose an eligible Farcaster channel.
4. Reserve the Arch hostname.
5. Choose hosting.
6. Configure the surface type, posting grammar, theme, title, and provenance.
7. Launch the appliance, including tunnel route status and the explicit install
   command when the broker has provisioned one. The launch step can also render
   the exported non-secret Arch config env block for review and copying.
8. Verify publishing.
9. Unlock the Arch.

The composer can only be unlocked after Farcaster publishing is verified. Local
database writes are never treated as valid Arch feed data.

The configure step borrows the useful part of Discourse's category setup model:
ask what kind of community surface is being created before moving into launch.
The first presets are:

- surface type: `village`, `bulletin`, `library`
- posting grammar: `open-casts`, `curated-updates`, `knowledge-base`
- theme: `daylight`, `high-contrast`, `night`

## Terminal Renderer

The package includes a small terminal renderer so the installer can show the
same setup state as a future browser wizard:

```ts
import { buildSetupSession, renderTerminalSession } from "@arches/setup-schema";

const session = buildSetupSession({
  sessionId: "setup_123",
  hostFid: 18350,
  signerApproved: true,
  eligibleChannels: [{ slug: "anky", role: "lead" }],
});

console.log(renderTerminalSession(session));
```

The renderer uses the same step statuses as the schema:

- `[x]`: completed
- `[>]`: active
- `[ ]`: pending
- `[!]`: blocked
