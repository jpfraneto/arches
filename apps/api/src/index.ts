import { Hono } from "hono";
import { cors } from "hono/cors";

type CastStatus = "local" | "submitted" | "confirmed" | "failed";

type ArchCast = {
  id: string;
  archId: string;
  text: string;
  dotAnky?: string;
  fid?: number;
  username?: string;
  parentId?: string;
  farcasterHash?: string;
  status: CastStatus;
  createdAt: string;
};

const archId = Bun.env.ARCH_SLUG ?? "local";
const archDomain = Bun.env.ARCH_DOMAIN ?? "localhost";
const adminFid = Bun.env.ARCH_ADMIN_FID ?? "";
const supportEmail = Bun.env.ARCH_SUPPORT_EMAIL ?? "";
const port = Number(Bun.env.PORT ?? 3000);

// TODO: replace this in-memory store with Postgres using schema.sql.
const casts: ArchCast[] = [];

const app = new Hono();

app.use(
  "*",
  cors({
    origin: "*",
    allowMethods: ["GET", "POST", "OPTIONS"],
    allowHeaders: ["Content-Type"],
  }),
);

app.get("/health", (c) => {
  return c.json({
    ok: true,
    service: "arches-api",
    archId,
  });
});

app.get("/api/arch", (c) => {
  return c.json({
    id: archId,
    slug: archId,
    domain: archDomain,
    adminFid: adminFid ? Number(adminFid) : null,
    supportEmail,
    provenanceLabel: `posted via ${archId}`,
  });
});

app.get("/api/feed", (c) => {
  const archCasts = casts
    .filter((cast) => cast.archId === archId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return c.json({
    archId,
    casts: archCasts,
  });
});

app.post("/api/casts", async (c) => {
  const body = await c.req.json().catch(() => null);

  if (!body || typeof body.text !== "string" || body.text.trim().length === 0) {
    return c.json({ error: "text is required" }, 400);
  }

  const fid =
    typeof body.fid === "number"
      ? body.fid
      : typeof body.fid === "string" && body.fid.trim() !== ""
        ? Number(body.fid)
        : undefined;

  if (fid !== undefined && (!Number.isInteger(fid) || fid <= 0)) {
    return c.json({ error: "fid must be a positive integer" }, 400);
  }

  const cast: ArchCast = {
    id: crypto.randomUUID(),
    archId,
    text: body.text.trim(),
    dotAnky: optionalString(body.dotAnky),
    fid,
    username: optionalString(body.username),
    parentId: optionalString(body.parentId),
    status: "local",
    createdAt: new Date().toISOString(),
  };

  casts.push(cast);

  return c.json({ cast }, 201);
});

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

export default {
  port,
  fetch: app.fetch,
};
