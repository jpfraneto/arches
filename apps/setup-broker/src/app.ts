import { Hono } from "hono";
import { cors } from "hono/cors";
import { buildArchConfigSnapshot, renderEnvSnapshot } from "./arch-config";
import {
  createChannelEligibilityProvider,
  type ChannelEligibilityProvider,
} from "./channel-eligibility";
import {
  TunnelProvisioningError,
  createTunnelProvisioningProvider,
  type TunnelProvisioningProvider,
} from "./tunnel-provisioning";
import {
  buildSetupSession,
  findStep,
  renderTerminalSession,
  validateStepSubmission,
  type FieldValues,
  type GrammarPreset,
  type HostingMode,
  type SetupField,
  type SetupSession,
  type SetupState,
  type SetupStep,
  type SetupStepId,
  type SurfacePreset,
  type ThemePreset,
} from "../../../packages/setup-schema/src/index";

type SessionRecord = {
  state: SetupState;
  events: SetupAuditEvent[];
  createdAt: string;
  updatedAt: string;
};

type SetupAuditEventType =
  | "session_created"
  | "dev_state_updated"
  | "channels_refreshed"
  | "step_submitted"
  | "slug_reserved"
  | "tunnel_provisioned"
  | "tunnel_provision_failed"
  | "arch_config_exported";

type SetupAuditEvent = {
  id: string;
  sessionId: string;
  type: SetupAuditEventType;
  at: string;
  actorFid?: number;
  data?: Record<string, string | number | boolean | undefined>;
};

type BrokerOptions = {
  allowDevStateUpdates?: boolean;
  channelEligibilityProvider?: ChannelEligibilityProvider;
  tunnelProvisioningProvider?: TunnelProvisioningProvider;
  publicOrigin?: string;
};

type SessionResponse = {
  session: SetupSession;
  terminal: string;
  setupUrl: string;
  events: SetupAuditEvent[];
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
  const tunnelProvisioningProvider =
    options.tunnelProvisioningProvider ?? createTunnelProvisioningProvider({});

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
    const record = sessions.get(state.sessionId)!;

    return c.json(sessionResponse(record, publicOrigin), 201);
  });

  app.post("/api/setup/sessions/terminal", (c) => {
    const state = createSetupSession(publicOrigin);
    const record = sessions.get(state.sessionId)!;
    const response = sessionResponse(record, publicOrigin);

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

    return c.html(renderSetupHtml(buildSetupSession(record.state), record.events));
  });

  app.get("/api/setup/sessions/:sessionId", (c) => {
    const record = sessions.get(c.req.param("sessionId"));
    if (!record) return c.json({ error: "setup session not found" }, 404);

    return c.json(sessionResponse(record, publicOrigin));
  });

  app.get("/api/setup/sessions/:sessionId/events", (c) => {
    const record = sessions.get(c.req.param("sessionId"));
    if (!record) return c.json({ error: "setup session not found" }, 404);

    return c.json({ events: record.events });
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
    const updatedRecord = withSetupEvent(
      {
        ...record,
        state: updatedState,
        updatedAt: new Date().toISOString(),
      },
      "channels_refreshed",
      { actorFid: hostFid, data: { channelCount: eligibleChannels.length } },
    );

    sessions.set(sessionId, updatedRecord);

    return c.json(sessionResponse(updatedRecord, publicOrigin));
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
    const updatedRecord = withSetupEvent(
      {
        ...record,
        state: updatedState,
        updatedAt: new Date().toISOString(),
      },
      "slug_reserved",
      {
        actorFid: updatedState.hostFid,
        data: { slug: result.slug, domain: updatedState.domain },
      },
    );

    sessions.set(sessionId, updatedRecord);

    return c.json(sessionResponse(updatedRecord, publicOrigin));
  });

  app.post("/api/setup/sessions/:sessionId/steps/:stepId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const record = sessions.get(sessionId);
    if (!record) return c.json({ error: "setup session not found" }, 404);

    const values = await parseStepValues(c.req.raw);
    const result = applySetupStepSubmission(
      record.state,
      c.req.param("stepId") as SetupStepId,
      values,
    );
    if (!result.ok) return c.json({ error: result.error, message: result.message }, result.status);

    let updatedRecord = withSetupEvent(
      {
        ...record,
        state: result.state,
        updatedAt: new Date().toISOString(),
      },
      "step_submitted",
      {
        actorFid: result.state.hostFid,
        data: { stepId: c.req.param("stepId") },
      },
    );
    updatedRecord = withStepSideEffectEvents(updatedRecord, record.state, c.req.param("stepId"));

    sessions.set(sessionId, updatedRecord);

    return c.json(sessionResponse(updatedRecord, publicOrigin));
  });

  app.post("/api/setup/sessions/:sessionId/tunnel/provision", async (c) => {
    const sessionId = c.req.param("sessionId");
    const record = sessions.get(sessionId);
    if (!record) return c.json({ error: "setup session not found" }, 404);

    const readiness = tunnelProvisioningReadiness(record.state);
    if (!readiness.ok) {
      return c.json(
        { error: readiness.error, message: readiness.message },
        readiness.status,
      );
    }

    try {
      const result = await tunnelProvisioningProvider.provisionArchTunnel({
        slug: record.state.reservedSlug!,
        domain: record.state.domain!,
        adminFid: record.state.hostFid!,
        supportEmail: "support@arches.lat",
      });
      const updatedState = {
        ...record.state,
        tunnelId: result.tunnelId,
        tunnelProvisioned: true,
        installCommand: result.installCommand,
        applianceLaunched: undefined,
        publishingVerified: undefined,
        composerUnlocked: undefined,
      };

      const updatedRecord = withSetupEvent(
        {
          ...record,
          state: updatedState,
          updatedAt: new Date().toISOString(),
        },
        "tunnel_provisioned",
        {
          actorFid: updatedState.hostFid,
          data: {
            slug: updatedState.reservedSlug,
            domain: updatedState.domain,
            tunnelId: updatedState.tunnelId,
          },
        },
      );

      sessions.set(sessionId, updatedRecord);

      return c.json(sessionResponse(updatedRecord, publicOrigin));
    } catch (error) {
      if (error instanceof TunnelProvisioningError) {
        sessions.set(
          sessionId,
          withSetupEvent(
            {
              ...record,
              updatedAt: new Date().toISOString(),
            },
            "tunnel_provision_failed",
            {
              actorFid: record.state.hostFid,
              data: { status: error.status },
            },
          ),
        );

        return c.json(
          { error: "tunnel provisioning failed", message: error.message },
          error.status as 400 | 409 | 500 | 501 | 502,
        );
      }

      return c.json(
        {
          error: "tunnel provisioning failed",
          message: "Tunnel provisioning failed before installer config could be delivered.",
        },
        500,
      );
    }
  });

  app.post("/api/setup/sessions/:sessionId/arch/config", (c) => {
    const sessionId = c.req.param("sessionId");
    const record = sessions.get(sessionId);
    if (!record) return c.json({ error: "setup session not found" }, 404);

    const result = buildArchConfigSnapshot(record.state);
    if (!result.ok) {
      return c.json({ error: result.error, message: result.message }, result.status);
    }

    const updatedRecord = withSetupEvent(
      {
        ...record,
        updatedAt: new Date().toISOString(),
      },
      "arch_config_exported",
      {
        actorFid: record.state.hostFid,
        data: {
          slug: result.config.arch.slug,
          domain: result.config.arch.domain,
          mode: result.config.hosting.mode,
        },
      },
    );

    sessions.set(sessionId, updatedRecord);

    return c.json({
      config: result.config,
      env: renderEnvSnapshot(result.config.env),
      events: updatedRecord.events,
    });
  });

  app.post("/setup/:sessionId/steps/:stepId", async (c) => {
    const sessionId = c.req.param("sessionId");
    const record = sessions.get(sessionId);
    if (!record) return c.html(renderMissingSessionHtml(), 404);

    const values = await parseStepValues(c.req.raw);
    const result = applySetupStepSubmission(
      record.state,
      c.req.param("stepId") as SetupStepId,
      values,
    );
    if (!result.ok) return c.html(renderStepErrorHtml(result.message), result.status);

    let updatedRecord = withSetupEvent(
      {
        ...record,
        state: result.state,
        updatedAt: new Date().toISOString(),
      },
      "step_submitted",
      {
        actorFid: result.state.hostFid,
        data: { stepId: c.req.param("stepId") },
      },
    );
    updatedRecord = withStepSideEffectEvents(updatedRecord, record.state, c.req.param("stepId"));

    sessions.set(sessionId, updatedRecord);

    return c.redirect(`/setup/${sessionId}`, 303);
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
    const auditedRecord = withSetupEvent(updatedRecord, "dev_state_updated", {
      actorFid: updatedState.hostFid,
      data: { devOnly: true },
    });
    sessions.set(sessionId, auditedRecord);

    return c.json(sessionResponse(auditedRecord, publicOrigin));
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
    events: [
      createSetupEvent(sessionId, "session_created", {
        data: { requestedSlug },
      }),
    ],
    createdAt: now,
    updatedAt: now,
  });

  return state;
}

function sessionResponse(record: SessionRecord, publicOrigin: string): SessionResponse {
  const state = record.state;
  const session = buildSetupSession(state);

  return {
    session,
    terminal: renderTerminalSession(session),
    setupUrl: `${publicOrigin}/setup/${state.sessionId}`,
    events: record.events,
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

function createEventId(): string {
  return `event_${crypto.randomUUID()}`;
}

function createSetupEvent(
  sessionId: string,
  type: SetupAuditEventType,
  options: Omit<Partial<SetupAuditEvent>, "id" | "sessionId" | "type" | "at"> = {},
): SetupAuditEvent {
  return {
    id: createEventId(),
    sessionId,
    type,
    at: new Date().toISOString(),
    actorFid: options.actorFid,
    data: removeUndefinedData(options.data),
  };
}

function withSetupEvent(
  record: SessionRecord,
  type: SetupAuditEventType,
  options: Omit<Partial<SetupAuditEvent>, "id" | "sessionId" | "type" | "at"> = {},
): SessionRecord {
  return {
    ...record,
    events: [...record.events, createSetupEvent(record.state.sessionId, type, options)],
  };
}

function withStepSideEffectEvents(
  record: SessionRecord,
  previousState: SetupState,
  stepId: string,
): SessionRecord {
  if (
    stepId === "name-surface" &&
    record.state.reservedSlug &&
    record.state.domain &&
    record.state.reservedSlug !== previousState.reservedSlug
  ) {
    return withSetupEvent(record, "slug_reserved", {
      actorFid: record.state.hostFid,
      data: { slug: record.state.reservedSlug, domain: record.state.domain },
    });
  }

  return record;
}

function removeUndefinedData(
  data: SetupAuditEvent["data"],
): SetupAuditEvent["data"] {
  if (!data) return undefined;

  return Object.fromEntries(
    Object.entries(data).filter(([, value]) => value !== undefined),
  );
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

type StepSubmissionResult =
  | {
      ok: true;
      state: SetupState;
    }
  | {
      ok: false;
      status: 400 | 409 | 501;
      error: string;
      message: string;
    };

function applySetupStepSubmission(
  state: SetupState,
  stepId: SetupStepId,
  values: FieldValues,
): StepSubmissionResult {
  const session = buildSetupSession(state);
  const step = findStep(session, stepId);

  if (!step) {
    return {
      ok: false,
      status: 400,
      error: "unknown setup step",
      message: "The requested setup step is not part of the Arches setup schema.",
    };
  }

  if (step.id !== session.currentStepId || step.status !== "active") {
    return {
      ok: false,
      status: 409,
      error: "step is not active",
      message: "Only the current active setup step can be submitted.",
    };
  }

  const validationErrors = validateStepSubmission(step, values);
  if (validationErrors.length > 0) {
    return {
      ok: false,
      status: 400,
      error: "invalid setup step submission",
      message: validationErrors
        .map((validationError) => `${validationError.fieldId}: ${validationError.message}`)
        .join(", "),
    };
  }

  switch (step.id) {
    case "verify-farcaster":
      return {
        ok: false,
        status: 501,
        error: "farcaster verification is not implemented yet",
        message:
          "The setup broker must derive the host FID from a verified Farcaster signature before setup can continue.",
      };
    case "prepare-signer":
      return {
        ok: false,
        status: 501,
        error: "signer approval is not implemented yet",
        message:
          "The Arch signer must be approved by the verified host FID before setup can continue.",
      };
    case "choose-community":
      return applyChooseCommunitySubmission(state, values);
    case "name-surface":
      return applyNameSurfaceSubmission(state, values);
    case "choose-hosting":
      return applyChooseHostingSubmission(state, values);
    case "configure-surface":
      return applyConfigureSurfaceSubmission(state, values);
    case "launch-appliance":
      return {
        ok: false,
        status: 501,
        error: "appliance launch is not implemented yet",
        message:
          "Automatic appliance launch requires broker tunnel provisioning and installer config delivery.",
      };
    case "verify-publishing":
      return {
        ok: false,
        status: 501,
        error: "publishing verification is not implemented yet",
        message:
          "The composer stays locked until Hypersnap Lite publishing to Farcaster is verified.",
      };
    case "unlock-arch":
      return {
        ok: false,
        status: 501,
        error: "composer unlock is not implemented yet",
        message: "The composer can only unlock after Farcaster publishing has been verified.",
      };
  }
}

function applyChooseCommunitySubmission(
  state: SetupState,
  values: FieldValues,
): StepSubmissionResult {
  const selectedChannelSlug = normalizeSlug(values.channel);
  const selectedChannel = state.eligibleChannels?.find(
    (channel) => channel.slug === selectedChannelSlug,
  );

  if (!selectedChannelSlug || !selectedChannel) {
    return {
      ok: false,
      status: 409,
      error: "selected channel is not eligible",
      message: "The selected channel must come from verified Farcaster channel eligibility.",
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      selectedChannelSlug,
      reservedSlug: undefined,
      domain: undefined,
      hostingMode: undefined,
      surfacePreset: undefined,
      grammarPreset: undefined,
      themePreset: undefined,
      surfaceTitle: undefined,
      provenanceLabel: undefined,
      surfaceConfigured: undefined,
      tunnelId: undefined,
      tunnelProvisioned: undefined,
      applianceLaunched: undefined,
      installCommand: undefined,
      publishingVerified: undefined,
      composerUnlocked: undefined,
    },
  };
}

function applyNameSurfaceSubmission(state: SetupState, values: FieldValues): StepSubmissionResult {
  const requestedSlug = normalizeSlug(values.slug);
  const rawDomain = values.domain?.trim();
  const requestedDomain = normalizeDomain(rawDomain);

  if (rawDomain && !requestedDomain) {
    return {
      ok: false,
      status: 400,
      error: "invalid domain",
      message: "The setup broker only accepts default *.arches.lat hostnames in this scaffold.",
    };
  }

  const expectedSlug = requestedSlug ?? state.requestedSlug ?? state.selectedChannelSlug;
  if (requestedDomain && expectedSlug && requestedDomain !== `${expectedSlug}.arches.lat`) {
    return {
      ok: false,
      status: 409,
      error: "custom domains are not implemented",
      message:
        "The setup broker only reserves the selected channel's default arches.lat hostname in this scaffold.",
    };
  }

  const result = reserveArchSlug(state, requestedSlug);
  if (!result.ok) return result;

  const domain = `${result.slug}.arches.lat`;
  if (requestedDomain && requestedDomain !== domain) {
    return {
      ok: false,
      status: 409,
      error: "custom domains are not implemented",
      message:
        "The setup broker only reserves the selected channel's default arches.lat hostname in this scaffold.",
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      reservedSlug: result.slug,
      domain,
      hostingMode: undefined,
      surfacePreset: undefined,
      grammarPreset: undefined,
      themePreset: undefined,
      surfaceTitle: undefined,
      provenanceLabel: undefined,
      surfaceConfigured: undefined,
      tunnelId: undefined,
      tunnelProvisioned: undefined,
      applianceLaunched: undefined,
      installCommand: undefined,
      publishingVerified: undefined,
      composerUnlocked: undefined,
    },
  };
}

function applyChooseHostingSubmission(state: SetupState, values: FieldValues): StepSubmissionResult {
  const mode = values.mode as HostingMode | undefined;
  if (!mode || !["tunnel-local", "local", "vps"].includes(mode)) {
    return {
      ok: false,
      status: 400,
      error: "invalid hosting mode",
      message: "Choose a valid hosting mode from the setup schema.",
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      hostingMode: mode,
      surfacePreset: undefined,
      grammarPreset: undefined,
      themePreset: undefined,
      surfaceTitle: undefined,
      provenanceLabel: undefined,
      surfaceConfigured: undefined,
      tunnelId: undefined,
      tunnelProvisioned: undefined,
      applianceLaunched: undefined,
      installCommand: undefined,
      publishingVerified: undefined,
      composerUnlocked: undefined,
    },
  };
}

function applyConfigureSurfaceSubmission(
  state: SetupState,
  values: FieldValues,
): StepSubmissionResult {
  const surfacePreset = values.surfacePreset as SurfacePreset | undefined;
  const grammarPreset = values.grammarPreset as GrammarPreset | undefined;
  const themePreset = values.themePreset as ThemePreset | undefined;
  const surfaceTitle = values.title?.trim();
  const provenanceLabel = values.provenance?.trim();

  if (!surfacePreset || !grammarPreset || !themePreset || !surfaceTitle || !provenanceLabel) {
    return {
      ok: false,
      status: 400,
      error: "invalid surface configuration",
      message: "Surface type, grammar, theme, title, and provenance label are required.",
    };
  }

  return {
    ok: true,
    state: {
      ...state,
      surfacePreset,
      grammarPreset,
      themePreset,
      surfaceTitle,
      provenanceLabel,
      surfaceConfigured: true,
      tunnelId: undefined,
      tunnelProvisioned: undefined,
      applianceLaunched: undefined,
      installCommand: undefined,
      publishingVerified: undefined,
      composerUnlocked: undefined,
    },
  };
}

async function parseStepValues(request: Request): Promise<FieldValues> {
  const contentType = request.headers.get("content-type") ?? "";
  const values: FieldValues = {};

  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => ({}));
    if (!isObject(body)) return values;

    for (const [key, value] of Object.entries(body)) {
      values[key] = typeof value === "string" ? value : value === undefined ? undefined : String(value);
    }

    return values;
  }

  if (
    contentType.includes("application/x-www-form-urlencoded") ||
    contentType.includes("multipart/form-data")
  ) {
    const formData = await request.formData();
    for (const [key, value] of formData.entries()) {
      values[key] = typeof value === "string" ? value : value.name;
    }
  }

  return values;
}

type TunnelProvisioningReadiness =
  | {
      ok: true;
    }
  | {
      ok: false;
      status: 409;
      error: string;
      message: string;
    };

function tunnelProvisioningReadiness(state: SetupState): TunnelProvisioningReadiness {
  if (!state.hostFid) {
    return {
      ok: false,
      status: 409,
      error: "farcaster verification required",
      message:
        "Tunnel provisioning can only happen after the setup broker derives a host FID from Farcaster verification.",
    };
  }

  if (!state.reservedSlug || !state.domain) {
    return {
      ok: false,
      status: 409,
      error: "arch hostname required",
      message: "Reserve a verified default arches.lat hostname before provisioning a tunnel.",
    };
  }

  if (state.reservedSlug !== state.selectedChannelSlug) {
    return {
      ok: false,
      status: 409,
      error: "selected channel mismatch",
      message: "The reserved hostname must match the selected eligible Farcaster channel.",
    };
  }

  if (state.hostingMode !== "tunnel-local") {
    return {
      ok: false,
      status: 409,
      error: "tunnel hosting required",
      message: "Cloudflare Tunnel provisioning is only available for tunnel-local hosting.",
    };
  }

  if (!state.surfaceConfigured) {
    return {
      ok: false,
      status: 409,
      error: "surface configuration required",
      message: "Configure the first visible community defaults before provisioning a tunnel.",
    };
  }

  return { ok: true };
}

function renderSetupHtml(session: SetupSession, events: SetupAuditEvent[]): string {
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

    .events {
      border-top: 1px solid var(--line);
      margin-top: 28px;
      padding-top: 22px;
    }

    .events h2 {
      font-size: 14px;
      margin-bottom: 12px;
    }

    .event-list {
      list-style: none;
      display: grid;
      gap: 10px;
      margin: 0;
      padding: 0;
      color: var(--muted);
      font-size: 12px;
    }

    .event-type {
      color: var(--ink);
      font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
      overflow-wrap: anywhere;
    }

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

    .actions {
      margin-top: 24px;
    }

    button {
      min-height: 38px;
      border: 0;
      border-radius: 6px;
      padding: 0 16px;
      background: var(--accent);
      color: #fff;
      font: inherit;
      font-weight: 650;
      cursor: pointer;
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
      ${renderSetupEvents(events)}
    </aside>
    <section>
      ${currentStep ? renderCurrentStep(session.sessionId, currentStep) : ""}
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

function renderStepErrorHtml(message: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Setup Step Error</title>
</head>
<body>
  <h1>Setup step error</h1>
  <p>${escapeHtml(message)}</p>
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

function renderSetupEvents(events: SetupAuditEvent[]): string {
  const recentEvents = events.slice(-6).reverse();

  return `<div class="events">
    <h2>Setup Log</h2>
    <ol class="event-list">
      ${recentEvents.map(renderSetupEvent).join("")}
    </ol>
  </div>`;
}

function renderSetupEvent(event: SetupAuditEvent): string {
  const detail = eventDetail(event);

  return `<li>
    <div class="event-type">${escapeHtml(event.type)}</div>
    <div>${escapeHtml(detail)}</div>
  </li>`;
}

function eventDetail(event: SetupAuditEvent): string {
  const actor = event.actorFid ? `FID ${event.actorFid}` : "system";
  const domain = event.data?.domain ? ` ${event.data.domain}` : "";
  const step = event.data?.stepId ? ` ${event.data.stepId}` : "";
  const count = event.data?.channelCount !== undefined ? ` ${event.data.channelCount}` : "";

  switch (event.type) {
    case "session_created":
      return `${actor} created setup`;
    case "dev_state_updated":
      return "dev-only state update";
    case "channels_refreshed":
      return `${actor} refreshed${count} channel choices`;
    case "step_submitted":
      return `${actor} submitted${step}`;
    case "slug_reserved":
      return `${actor} reserved${domain}`;
    case "tunnel_provisioned":
      return `${actor} provisioned${domain}`;
    case "tunnel_provision_failed":
      return `${actor} tunnel provisioning failed`;
    case "arch_config_exported":
      return `${actor} exported${domain} config`;
  }
}

function renderCurrentStep(sessionId: string, step: SetupStep): string {
  const canSubmit = isSubmittableStep(step);

  return `<div class="surface">
    <h2>${escapeHtml(step.title)}</h2>
    <p class="description">${escapeHtml(step.description)}</p>
    <form method="post" action="/setup/${escapeHtml(sessionId)}/steps/${escapeHtml(step.id)}">
      <div class="fields">
        ${step.fields.map((field) => renderField(field, canSubmit)).join("")}
      </div>
      ${canSubmit ? `<div class="actions"><button type="submit">Continue</button></div>` : ""}
    </form>
  </div>`;
}

function renderField(field: SetupField, editable = false): string {
  switch (field.type) {
    case "radio":
    case "dropdown":
      return renderChoiceField(field, editable);
    case "status":
    case "qr":
      return renderStatusField(field);
    case "copy":
      return renderCopyField(field);
    case "text":
      return renderTextField(field, editable);
  }
}

function renderChoiceField(field: SetupField, editable: boolean): string {
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
                <input type="radio" name="${escapeHtml(field.id)}" value="${escapeHtml(choice.id)}"${
                  editable && !choice.disabled ? "" : " disabled"
                }${selected ? " checked" : ""}${field.required ? " required" : ""}>
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

function renderTextField(field: SetupField, editable: boolean): string {
  return `<div>
    <label for="${escapeHtml(field.id)}">${escapeHtml(requiredLabel(field))}</label>
    <input id="${escapeHtml(field.id)}" name="${escapeHtml(field.id)}" type="text" value="${escapeHtml(
      field.value ?? "",
    )}" placeholder="${escapeHtml(field.placeholder ?? "")}"${field.required ? " required" : ""}${
      editable ? "" : " readonly"
    }>
    ${field.description ? `<div class="field-desc">${escapeHtml(field.description)}</div>` : ""}
  </div>`;
}

function isSubmittableStep(step: SetupStep): boolean {
  if (step.status !== "active") return false;
  return step.fields.some(
    (field) => field.type === "text" || field.type === "radio" || field.type === "dropdown",
  );
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

function normalizeDomain(value: string | undefined): string | undefined {
  if (!value) return undefined;

  const domain = value.trim().toLowerCase();
  if (!domain.endsWith(".arches.lat")) return undefined;

  const slug = normalizeSlug(domain.slice(0, -".arches.lat".length));
  return slug ? `${slug}.arches.lat` : undefined;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
