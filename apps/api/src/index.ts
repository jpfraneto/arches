import { Hono } from "hono";
import { cors } from "hono/cors";

type CastStatus = "submitted" | "confirmed" | "failed";
type PaymentMethod = "fiat" | "arches_coin";

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
const surfacePreset = Bun.env.ARCH_SURFACE_PRESET ?? "village";
const grammarPreset = Bun.env.ARCH_GRAMMAR_PRESET ?? "open-casts";
const themePreset = Bun.env.ARCH_THEME_PRESET ?? "daylight";
const surfaceTitle = Bun.env.ARCH_SURFACE_TITLE ?? `/${archId}`;
const provenanceLabel = Bun.env.ARCH_PROVENANCE_LABEL ?? `posted via ${archId}`;
const port = Number(Bun.env.PORT ?? 3000);
const experimentalPaymentsEnabled = parseBoolean(Bun.env.ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED);
const archesCoinSymbol = Bun.env.ARCHES_COIN_SYMBOL ?? "ARCHES";
const archesCoinContractAddress =
  Bun.env.ARCHES_COIN_CONTRACT_ADDRESS ?? "0x09b8903aBf2ea0721E34427353988c2F43c6d64F";
const archesCoinDiscountBps = parseBasisPoints(Bun.env.ARCHES_COIN_DISCOUNT_BPS, 1618);

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
    title: surfaceTitle,
    surface: {
      preset: surfacePreset,
      grammar: grammarPreset,
      theme: themePreset,
    },
    adminFid: adminFid ? Number(adminFid) : null,
    supportEmail,
    provenanceLabel,
    publishing: {
      farcaster: {
        enabled: false,
        status: "not_implemented",
        message:
          "Farcaster publishing is not wired yet. Arches will not accept local-only casts.",
      },
    },
    payments: {
      experimental: true,
      enabled: experimentalPaymentsEnabled,
      archesCoin: experimentalPaymentsEnabled
        ? {
            symbol: archesCoinSymbol,
            contractAddress: archesCoinContractAddress,
            discountBps: archesCoinDiscountBps,
            discountPercent: basisPointsToPercent(archesCoinDiscountBps),
          }
        : null,
    },
  });
});

app.post("/api/quote", async (c) => {
  if (!experimentalPaymentsEnabled) {
    return c.json({ error: "experimental payments are disabled" }, 404);
  }

  const body = await c.req.json().catch(() => null);

  if (!body || !Number.isInteger(body.subtotalCents) || body.subtotalCents < 0) {
    return c.json({ error: "subtotalCents must be a non-negative integer" }, 400);
  }

  const paymentMethod = parsePaymentMethod(body.paymentMethod);
  if (!paymentMethod) {
    return c.json({ error: "paymentMethod must be fiat or arches_coin" }, 400);
  }

  return c.json({
    quote: quoteTotal(body.subtotalCents, paymentMethod),
  });
});

app.get("/api/feed", (c) => {
  const archCasts = casts
    .filter((cast) => cast.archId === archId && cast.status === "confirmed")
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return c.json({
    archId,
    casts: archCasts,
  });
});

app.post("/api/casts", async (c) => {
  return c.json(
    {
      error: "Farcaster publishing is not implemented yet",
      message:
        "Arches data must map 1:1 to Farcaster data. Local-only casts are rejected.",
    },
    501,
  );
});

app.post("/api/publishing/probe", async (c) => {
  return c.json(
    {
      ok: false,
      protocol: "farcaster",
      status: "not_implemented",
      error: "Hypersnap Lite publishing probe is not implemented yet",
      message:
        "The setup broker must not unlock posting until this endpoint returns confirmed Farcaster proof from Hypersnap Lite.",
    },
    501,
  );
});

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function parsePaymentMethod(value: unknown): PaymentMethod | null {
  if (value === "fiat" || value === "arches_coin") return value;
  return null;
}

function quoteTotal(subtotalCents: number, paymentMethod: PaymentMethod) {
  const discountBps = paymentMethod === "arches_coin" ? archesCoinDiscountBps : 0;
  const discountCents = Math.floor((subtotalCents * discountBps) / 10_000);
  const totalCents = subtotalCents - discountCents;

  return {
    currency: "USD",
    subtotalCents,
    paymentMethod,
    discount: {
      eligible: paymentMethod === "arches_coin",
      symbol: archesCoinSymbol,
      contractAddress: archesCoinContractAddress,
      bps: discountBps,
      percent: basisPointsToPercent(discountBps),
      amountCents: discountCents,
    },
    totalCents,
  };
}

function parseBasisPoints(value: string | undefined, fallback: number): number {
  if (!value) return fallback;

  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > 10_000) return fallback;

  return parsed;
}

function basisPointsToPercent(bps: number): number {
  return bps / 100;
}

function parseBoolean(value: string | undefined): boolean {
  return value === "1" || value === "true" || value === "yes";
}

export default {
  port,
  fetch: app.fetch,
};
