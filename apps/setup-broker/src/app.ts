import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  createChannelEligibilityProvider,
  type ChannelEligibilityProvider,
} from "./channel-eligibility";
import {
  buildSetupSession,
  renderTerminalSession,
  type SetupField,
  type SetupSession,
  type SetupState,
  type SetupStep,
} from "../../../packages/setup-schema/src/index";

type SessionRecord = {
  state: SetupState;
  createdAt: string;
  updatedAt: string;
};

type BrokerOptions = {
  allowDevStateUpdates?: boolean;
  channelEligibilityProvider?: ChannelEligibilityProvider;
  publicOrigin?: string;
};

type SessionResponse = {
  session: SetupSession;
  terminal: string;
  setupUrl: string;
  next: {
    verification: "not_implemented";
    message: string;
  };
};

const sessions = new Map<string, SessionRecord>();
const slugReservations = new Map<string, string>();
const RESERVED_ARCHES_SUBDOMAINS = new Set(["install", "setup", "www"]);

export function createSetupBrokerApp(options: BrokerOptions = {}) {
  const app = new Hono();
  const publicOrigin = options.publicOrigin ?? "http://localhost:3020";
  const allowDevStateUpdates = options.allowDevStateUpdates ?? false;
  const channelEligibilityProvider =
    options.channelEligibilityProvider ?? createChannelEligibilityProvider({});

  app.use(
    "*",
    cors({
      origin: "*",
      allowMethods: ["GET", "POST", "PUT", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    }),
  );

  app.get("/health", (c) => {
    return c.json({
      ok: true,
      service: "arches-setup-broker",
      sessions: sessions.size,
    });
  });

  app.get("/", (c) => {
    const requestedSlug = requestedSlugFromHost(c.req.header("host"));
    if (requestedSlug) return c.html(renderUnclaimedArchHtml(requestedSlug));

    return c.redirect("/setup", 302);
  });

  app.post("/api/setup/sessions", (c) => {
    const requestedSlug = normalizeSlug(c.req.query("requested"));
    const state = createSetupSession(publicOrigin, requestedSlug);

    return c.json(sessionResponse(state, publicOrigin), 201);
  });

  app.post("/api/setup/sessions/terminal", (c) => {
    const state = createSetupSession(publicOrigin);
    const response = sessionResponse(state, publicOrigin);

    return c.text(`${response.terminal}\n\nBrowser setup: ${response.setupUrl}\n`);
  });

  app.get("/setup", (c) => {
    const requestedSlug = normalizeSlug(c.req.query("requested"));
    const state = createSetupSession(publicOrigin, requestedSlug);
    return c.redirect(`/setup/${state.sessionId}`, 302);
  });

  app.get("/setup/:sessionId", (c) => {
    const record = sessions.get(c.req.param("sessionId"));
    if (!record) return c.html(renderMissingSessionHtml(), 404);

    return c.html(renderSetupHtml(buildSetupSession(record.state)));
  });

  app.get("/api/setup/sessions/:sessionId", (c) => {
    const record = sessions.get(c.req.param("sessionId"));
    if (!record) return c.json({ error: "setup session not found" }, 404);

    return c.json(sessionResponse(record.state, publicOrigin));
  });

  app.get("/api/setup/sessions/:sessionId/terminal", (c) => {
    const record = sessions.get(c.req.param("sessionId"));
    if (!record) return c.text("setup session not found", 404);

    return c.text(renderTerminalSession(buildSetupSession(record.state)));
  });

  app.post("/api/setup/sessions/:sessionId/farcaster/verify", (c) => {
    const record = sessions.get(c.req.param("sessionId"));
    if (!record) return c.json({ error: "setup session not found" }, 404);

    return c.json(
      {
        error: "farcaster verification is not implemented yet",
        message:
          "The setup broker will derive the host FID from a verified Farcaster signature. Manual admin FID input is rejected.",
      },
      501,
    );
  });

  app.post("/api/setup/sessions/:sessionId/channels/refresh", async (c) => {
    const sessionId = c.req.param("sessionId");
    const record = sessions.get(sessionId);
    if (!record) return c.json({ error: "setup session not found" }, 404);

    const hostFid = record.state.hostFid;
    if (!hostFid) {
      return c.json(
        {
          error: "farcaster verification required",
          message:
            "Channel eligibility can only be loaded after the setup broker derives a host FID from Farcaster verification.",
        },
        409,
      );
    }

    const eligibleChannels = await channelEligibilityProvider.listEligibleChannels(hostFid);
    const updatedState = {
      ...record.state,
      eligibleChannels,
    };

    sessions.set(sessionId, {
      ...record,
      state: updatedState,
      updatedAt: new Date().toISOString(),
    });

    return c.json(sessionResponse(updatedState, publicOrigin));
  });

  app.post("/api/setup/sessions/:sessionId/slug/reserve", async (c) => {
    const sessionId = c.req.param("sessionId");
    const record = sessions.get(sessionId);
    if (!record) return c.json({ error: "setup session not found" }, 404);

    const body = await c.req.json().catch(() => ({}));
    if (!isObject(body)) return c.json({ error: "reservation body must be an object" }, 400);

    const result = reserveArchSlug(record.state, normalizeSlug(body.slug));
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status);

    const updatedState = {
      ...record.state,
      reservedSlug: result.slug,
      domain: `${result.slug}.arches.lat`,
    };

    sessions.set(sessionId, {
      ...record,
      state: updatedState,
      updatedAt: new Date().toISOString(),
    });

    return c.json(sessionResponse(updatedState, publicOrigin));
  });

  app.put("/api/setup/sessions/:sessionId/dev-state", async (c) => {
    if (!allowDevStateUpdates) {
      return c.json({ error: "dev state updates are disabled" }, 404);
    }

    const sessionId = c.req.param("sessionId");
    const record = sessions.get(sessionId);
    if (!record) return c.json({ error: "setup session not found" }, 404);

    const body = await c.req.json().catch(() => null);
    if (!isObject(body)) return c.json({ error: "state patch must be an object" }, 400);

    const updatedState = {
      ...record.state,
      ...body,
      sessionId,
    };
    const updatedRecord = {
      ...record,
      state: updatedState,
      updatedAt: new Date().toISOString(),
    };
    sessions.set(sessionId, updatedRecord);

    return c.json(sessionResponse(updatedState, publicOrigin));
  });

  return app;
}

export function resetSetupBrokerSessionsForTests() {
  sessions.clear();
  slugReservations.clear();
}

function createSetupSession(publicOrigin: string, requestedSlug?: string): SetupState {
  const sessionId = createSessionId();
  const now = new Date().toISOString();
  const state: SetupState = {
    sessionId,
    requestedSlug,
    farcasterQrUrl: `${publicOrigin}/api/setup/sessions/${sessionId}/farcaster/verify`,
  };

  sessions.set(sessionId, {
    state,
    createdAt: now,
    updatedAt: now,
  });

  return state;
}

function sessionResponse(state: SetupState, publicOrigin: string): SessionResponse {
  const session = buildSetupSession(state);

  return {
    session,
    terminal: renderTerminalSession(session),
    setupUrl: `${publicOrigin}/setup/${state.sessionId}`,
    next: {
      verification: "not_implemented",
      message:
        "Farcaster QR verification is not wired yet. Posting and composer unlock remain blocked.",
    },
  };
}

function createSessionId(): string {
  return `setup_${crypto.randomUUID()}`;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

type ReservationResult =
  | {
      ok: true;
      slug: string;
    }
  | {
      ok: false;
      status: 400 | 409;
      error: string;
      message: string;
    };

function reserveArchSlug(state: SetupState, requestedSlug?: string): ReservationResult {
  if (!state.hostFid) {
    return {
      ok: false,
      status: 409,
      error: "farcaster verification required",
      message:
        "Slug reservation can only happen after the setup broker derives a host FID from Farcaster verification.",
    };
  }

  if (!state.selectedChannelSlug) {
    return {
      ok: false,
      status: 409,
      error: "channel selection required",
      message: "Choose an eligible Farcaster channel before reserving an Arch hostname.",
    };
  }

  const selectedChannel = state.eligibleChannels?.find(
    (channel) => channel.slug === state.selectedChannelSlug,
  );
  if (!selectedChannel) {
    return {
      ok: false,
      status: 409,
      error: "selected channel is not eligible",
      message: "The selected channel must come from verified Farcaster channel eligibility.",
    };
  }

  const slug = requestedSlug ?? state.requestedSlug ?? state.selectedChannelSlug;
  if (!slug) {
    return {
      ok: false,
      status: 400,
      error: "invalid slug",
      message: "Arch slug must be lowercase URL-safe text.",
    };
  }

  if (RESERVED_ARCHES_SUBDOMAINS.has(slug)) {
    return {
      ok: false,
      status: 409,
      error: "reserved slug",
      message: `${slug}.arches.lat is reserved for Arches infrastructure.`,
    };
  }

  if (slug !== state.selectedChannelSlug) {
    return {
      ok: false,
      status: 409,
      error: "custom slugs are not implemented",
      message:
        "This scaffold only reserves the selected eligible channel slug. Custom slugs can be added after verified ownership rules exist.",
    };
  }

  const existingSessionId = slugReservations.get(slug);
  if (existingSessionId && existingSessionId !== state.sessionId) {
    return {
      ok: false,
      status: 409,
      error: "slug already reserved",
      message: `${slug}.arches.lat is already reserved by another setup session.`,
    };
  }

  slugReservations.set(slug, state.sessionId);

  return {
    ok: true,
    slug,
  };
}

function renderSetupHtml(session: SetupSession): string {
  const currentStep = session.steps.find((step) => step.id === session.currentStepId);

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Arches Setup</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #161616;
      --muted: #62666d;
      --line: #d7d9dd;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --accent: #0f6b5f;
      --accent-soft: #dff2ec;
      --warn: #a24c12;
      --blocked: #8f1d2c;
    }

    * { box-sizing: border-box; }

    body {
      margin: 0;
      background: var(--bg);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      min-height: 100vh;
      display: grid;
      grid-template-columns: minmax(220px, 320px) minmax(0, 1fr);
    }

    aside {
      padding: 32px 28px;
      border-right: 1px solid var(--line);
      background: #eeeeea;
    }

    section {
      padding: 44px;
      max-width: 880px;
    }

    h1, h2, p { margin-top: 0; }

    h1 {
      font-size: 26px;
      line-height: 1.15;
      margin-bottom: 8px;
      letter-spacing: 0;
    }

    h2 {
      font-size: 22px;
      line-height: 1.2;
      margin-bottom: 10px;
      letter-spacing: 0;
    }

    .session {
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 12px;
      overflow-wrap: anywhere;
      margin-bottom: 28px;
    }

    .steps {
      list-style: none;
      padding: 0;
      margin: 0;
      display: grid;
      gap: 8px;
    }

    .step {
      display: grid;
      grid-template-columns: 28px 1fr;
      align-items: start;
      gap: 10px;
      color: var(--muted);
      min-height: 28px;
    }

    .marker {
      width: 26px;
      height: 26px;
      border: 1px solid var(--line);
      display: grid;
      place-items: center;
      font-size: 12px;
      background: var(--panel);
    }

    .step.completed .marker { background: var(--accent); border-color: var(--accent); color: #fff; }
    .step.active { color: var(--ink); font-weight: 650; }
    .step.active .marker { border-color: var(--accent); background: var(--accent-soft); color: var(--accent); }
    .step.blocked .marker { border-color: var(--blocked); color: var(--blocked); }

    .surface {
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 28px;
    }

    .description {
      color: var(--muted);
      max-width: 680px;
    }

    .fields {
      display: grid;
      gap: 18px;
      margin-top: 28px;
    }

    label {
      display: block;
      font-weight: 650;
      margin-bottom: 6px;
    }

    input[type="text"] {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 11px 12px;
      font: inherit;
      background: #fafafa;
      color: var(--ink);
    }

    input[readonly] { color: var(--muted); }

    .choice {
      display: grid;
      grid-template-columns: 22px 1fr;
      gap: 10px;
      padding: 12px;
      border: 1px solid var(--line);
      border-radius: 6px;
      margin-top: 8px;
    }

    .choice.selected { border-color: var(--accent); background: var(--accent-soft); }

    .choice-title { font-weight: 650; }
    .choice-desc, .field-desc { color: var(--muted); font-size: 13px; }

    .status {
      display: inline-flex;
      align-items: center;
      min-height: 30px;
      padding: 4px 9px;
      border-radius: 6px;
      background: #f0f0ed;
      color: var(--muted);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      font-size: 13px;
    }

    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      border: 1px solid var(--line);
      border-radius: 6px;
      padding: 14px;
      background: #f4f4f1;
    }

    .notice {
      margin-top: 28px;
      padding: 12px 14px;
      border: 1px solid #ddb889;
      border-radius: 6px;
      color: var(--warn);
      background: #fff7eb;
    }

    @media (max-width: 720px) {
      main { grid-template-columns: 1fr; }
      aside {
        border-right: 0;
        border-bottom: 1px solid var(--line);
        padding: 24px 20px;
      }
      section { padding: 24px 20px; }
      .surface { padding: 20px; }
    }
  </style>
</head>
<body>
  <main>
    <aside>
      <h1>Arches Setup</h1>
      <div class="session">${escapeHtml(session.sessionId)}</div>
      ${renderRequestedSlug(session)}
      <div class="session">Current step: ${escapeHtml(currentStep?.title ?? session.currentStepId)}</div>
      <ol class="steps">
        ${session.steps.map(renderProgressStep).join("")}
      </ol>
    </aside>
    <section>
      ${currentStep ? renderCurrentStep(currentStep) : ""}
      <div class="notice">Farcaster verification is not wired yet. Posting and composer unlock remain blocked.</div>
    </section>
  </main>
</body>
</html>`;
}

function renderUnclaimedArchHtml(slug: string): string {
  const host = `${slug}.arches.lat`;

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(host)} is unclaimed</title>
  <style>
    :root {
      color-scheme: light;
      --ink: #161616;
      --muted: #62666d;
      --line: #d7d9dd;
      --bg: #f7f7f4;
      --panel: #ffffff;
      --accent: #0f6b5f;
    }

    * { box-sizing: border-box; }

    body {
      min-height: 100vh;
      margin: 0;
      display: grid;
      place-items: center;
      padding: 24px;
      background: var(--bg);
      color: var(--ink);
      font: 15px/1.5 ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    }

    main {
      width: min(100%, 760px);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 8px;
      padding: 32px;
    }

    h1 {
      margin: 0 0 10px;
      font-size: 28px;
      line-height: 1.15;
      letter-spacing: 0;
    }

    p { color: var(--muted); }

    code, pre {
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
    }

    pre {
      white-space: pre-wrap;
      overflow-wrap: anywhere;
      padding: 14px;
      border-radius: 6px;
      border: 1px solid var(--line);
      background: #f4f4f1;
    }

    a {
      color: var(--accent);
      font-weight: 650;
    }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(host)} is unclaimed</h1>
    <p>This Arch does not exist yet. To host it, start setup and verify with Farcaster. Arches will not accept a manual admin claim.</p>
    <pre>curl -fsSL https://install.arches.lat | bash</pre>
    <p><a href="/setup?requested=${encodeURIComponent(slug)}">Start browser setup for ${escapeHtml(host)}</a></p>
  </main>
</body>
</html>`;
}

function renderMissingSessionHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Setup Session Not Found</title>
</head>
<body>
  <h1>Setup session not found</h1>
</body>
</html>`;
}

function renderRequestedSlug(session: SetupSession): string {
  return session.requestedSlug
    ? `<div class="session">Requested Arch: ${escapeHtml(`${session.requestedSlug}.arches.lat`)}</div>`
    : "";
}

function renderProgressStep(step: SetupStep): string {
  return `<li class="step ${escapeHtml(step.status)}">
    <span class="marker">${escapeHtml(statusGlyph(step.status))}</span>
    <span>${escapeHtml(step.title)}</span>
  </li>`;
}

function renderCurrentStep(step: SetupStep): string {
  return `<div class="surface">
    <h2>${escapeHtml(step.title)}</h2>
    <p class="description">${escapeHtml(step.description)}</p>
    <div class="fields">
      ${step.fields.map(renderField).join("")}
    </div>
  </div>`;
}

function renderField(field: SetupField): string {
  switch (field.type) {
    case "radio":
    case "dropdown":
      return renderChoiceField(field);
    case "status":
    case "qr":
      return renderStatusField(field);
    case "copy":
      return renderCopyField(field);
    case "text":
      return renderTextField(field);
  }
}

function renderChoiceField(field: SetupField): string {
  const choices = field.choices ?? [];

  return `<div>
    <label>${escapeHtml(requiredLabel(field))}</label>
    ${field.description ? `<div class="field-desc">${escapeHtml(field.description)}</div>` : ""}
    ${
      choices.length > 0
        ? choices
            .map((choice) => {
              const selected = choice.id === field.value;
              return `<div class="choice${selected ? " selected" : ""}">
                <input type="radio" disabled${selected ? " checked" : ""}>
                <div>
                  <div class="choice-title">${escapeHtml(choice.label)}</div>
                  ${choice.description ? `<div class="choice-desc">${escapeHtml(choice.description)}</div>` : ""}
                </div>
              </div>`;
            })
            .join("")
        : `<div class="field-desc">No choices available yet.</div>`
    }
  </div>`;
}

function renderStatusField(field: SetupField): string {
  return `<div>
    <label>${escapeHtml(requiredLabel(field))}</label>
    <span class="status">${escapeHtml(field.value ?? "waiting")}</span>
    ${field.description ? `<div class="field-desc">${escapeHtml(field.description)}</div>` : ""}
  </div>`;
}

function renderCopyField(field: SetupField): string {
  return `<div>
    <label>${escapeHtml(requiredLabel(field))}</label>
    ${field.value ? `<pre>${escapeHtml(field.value)}</pre>` : `<div class="field-desc">No command available yet.</div>`}
    ${field.description ? `<div class="field-desc">${escapeHtml(field.description)}</div>` : ""}
  </div>`;
}

function renderTextField(field: SetupField): string {
  return `<div>
    <label for="${escapeHtml(field.id)}">${escapeHtml(requiredLabel(field))}</label>
    <input id="${escapeHtml(field.id)}" type="text" value="${escapeHtml(field.value ?? "")}" placeholder="${escapeHtml(
      field.placeholder ?? "",
    )}" readonly>
    ${field.description ? `<div class="field-desc">${escapeHtml(field.description)}</div>` : ""}
  </div>`;
}

function requiredLabel(field: SetupField): string {
  return field.required ? `${field.label} *` : field.label;
}

function statusGlyph(status: SetupStep["status"]): string {
  switch (status) {
    case "completed":
      return "x";
    case "active":
      return ">";
    case "blocked":
      return "!";
    case "pending":
      return "";
  }
}

function requestedSlugFromHost(hostHeader: string | undefined): string | undefined {
  if (!hostHeader) return undefined;

  const host = hostHeader.split(":")[0].toLowerCase();
  if (!host.endsWith(".arches.lat")) return undefined;

  const slug = host.slice(0, -".arches.lat".length);
  if (!slug || slug.includes(".") || RESERVED_ARCHES_SUBDOMAINS.has(slug)) return undefined;

  return normalizeSlug(slug);
}

function normalizeSlug(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const slug = value.trim().toLowerCase();
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) ? slug : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
