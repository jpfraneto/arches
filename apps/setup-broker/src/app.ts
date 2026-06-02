import { Hono } from "hono";
import { cors } from "hono/cors";
import {
  buildSetupSession,
  renderTerminalSession,
  type SetupSession,
  type SetupState,
} from "../../../packages/setup-schema/src/index";

type SessionRecord = {
  state: SetupState;
  createdAt: string;
  updatedAt: string;
};

type BrokerOptions = {
  allowDevStateUpdates?: boolean;
  publicOrigin?: string;
};

type SessionResponse = {
  session: SetupSession;
  terminal: string;
  next: {
    verification: "not_implemented";
    message: string;
  };
};

const sessions = new Map<string, SessionRecord>();

export function createSetupBrokerApp(options: BrokerOptions = {}) {
  const app = new Hono();
  const publicOrigin = options.publicOrigin ?? "http://localhost:3020";
  const allowDevStateUpdates = options.allowDevStateUpdates ?? false;

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

  app.post("/api/setup/sessions", (c) => {
    const sessionId = createSessionId();
    const now = new Date().toISOString();
    const state: SetupState = {
      sessionId,
      farcasterQrUrl: `${publicOrigin}/api/setup/sessions/${sessionId}/farcaster/verify`,
    };

    sessions.set(sessionId, {
      state,
      createdAt: now,
      updatedAt: now,
    });

    return c.json(sessionResponse(state), 201);
  });

  app.get("/api/setup/sessions/:sessionId", (c) => {
    const record = sessions.get(c.req.param("sessionId"));
    if (!record) return c.json({ error: "setup session not found" }, 404);

    return c.json(sessionResponse(record.state));
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

    return c.json(sessionResponse(updatedState));
  });

  return app;
}

export function resetSetupBrokerSessionsForTests() {
  sessions.clear();
}

function sessionResponse(state: SetupState): SessionResponse {
  const session = buildSetupSession(state);

  return {
    session,
    terminal: renderTerminalSession(session),
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
