# @arches/setup-schema

Discourse keeps setup disciplined by having the server define wizard steps,
fields, choices, completion state, and update behavior. This package starts the
same pattern for Arches.

The implementation contract for these steps lives in
`docs/SETUP_CONTRACT.md`. It defines the proof, durable state, audit event, and
unlock gate attached to each setup step.

The schema is intentionally renderer-neutral. A setup broker can return it as
JSON, `scripts/install.sh` can render it in a terminal, and a browser setup page
can render the same steps later.

Like Discourse's wizard serializer, each step carries server-owned wizard
metadata: zero-based `index`, one-based `displayIndex`, previous/next step ids,
status, icon name, fields, choices, and choice badges. Renderers should display
that metadata rather than inventing their own setup order.
Active field-backed steps can also expose `submit`, a server-owned form submit
descriptor with label, method, and path. Renderers should use that descriptor
instead of inferring which steps are submittable from field types.
When `submit.description` is present, renderers should display it next to the
submit affordance so the operator can see what the current-step updater will do.
Pending and blocked steps can expose `statusReason` so renderers can explain
the missing prerequisite without guessing from local UI state.

Browser renderers can use `previousStepId` and `nextStepId` to show local
wizard context, but those links are display metadata. Only the current active
step and its server-exposed actions can mutate setup state.
Terminal renderers also display that same previous/current/next context so the
operator can see where the current incomplete step sits in the server-defined
wizard.

Each setup session also carries a server-derived `summary` with readiness,
completed step count, total step count, blocked step count, current step title,
and next action. This gives terminal and browser renderers the same compact
operator status instead of asking them to infer readiness differently.
`nextAction` is concrete when the schema can derive it: it points at the active
server action, the active form submit, the QR scan, completion, or a blocked
step.

Completed steps can also carry provenance metadata: `completedAt`,
`completedByFid`, `completionEventId`, and `completionEventType`. The setup
broker derives those fields from audit events so renderers can show which
server action proved the step was completed.

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
   the exported non-secret Arch config env block for review and copying, then
   expose a launch health-check action.
8. Verify publishing through a Farcaster-only probe action.
9. Unlock the Arch with an explicit server-owned action after publishing proof
   is recorded.

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

When a setup broker passes an action base URL, active step actions render as
executable terminal commands:

```ts
console.log(
  renderTerminalSession(session, {
    actionBaseUrl: "https://setup.arches.lat/api/setup/sessions/setup_123",
    stepSubmissionBaseUrl: "https://setup.arches.lat/api/setup/sessions/setup_123",
    refreshUrl: "https://setup.arches.lat/api/setup/sessions/setup_123/terminal",
    setupUrl: "https://setup.arches.lat/setup/setup_123",
  }),
);
```

That keeps the terminal and browser wizard on the same server-defined action
model. Active field-backed steps also render JSON `curl` submit templates for
the generic step endpoint. The schema still does not execute provider actions
or setup submissions itself.

`refreshUrl` renders the command that reloads the same setup session at its
current incomplete step. That is the terminal equivalent of reloading the
browser wizard URL.
`setupUrl` renders the browser handoff for the same setup session.

Field-level validation errors from `withFieldErrors` are rendered in terminal
output too, so browser and terminal surfaces can show the same server-owned
failure state.

The renderer uses the same step statuses as the schema:

- `[x]`: completed
- `[>]`: active
- `[ ]`: pending
- `[!]`: blocked
