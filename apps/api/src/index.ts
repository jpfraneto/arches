import { Hono } from "hono";
import { cors } from "hono/cors";
import { EnvFarcasterMessageBuilder } from "./farcaster-message";
import {
  HypersnapLiteClient,
  PublishingNotReadyError,
  type ArchPublishConfig,
  type CastPublishRequest,
  type CastPublishResult,
  type FarcasterMessageBuilder,
  type HypersnapLiteEnv,
  type PublishingReadiness,
} from "./hypersnap-lite";

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
  messageId?: string;
  status: CastStatus;
  provenanceLabel: string;
  proofMode: "signed-farcaster-message-submit";
  createdAt: string;
};

type ArchesApiOptions = {
  env?: HypersnapLiteEnv;
  fetchImpl?: typeof fetch;
  messageBuilder?: FarcasterMessageBuilder;
};

// TODO: replace this in-memory store with Postgres using schema.sql.
const casts: ArchCast[] = [];

export function createArchesApi(options: ArchesApiOptions = {}) {
  const env = options.env ?? Bun.env;
  const archId = env.ARCH_SLUG ?? "local";
  const archDomain = env.ARCH_DOMAIN ?? "localhost";
  const adminFid = parsePositiveInteger(env.ARCH_ADMIN_FID);
  const supportEmail = env.ARCH_SUPPORT_EMAIL ?? "";
  const signerPublicKey = optionalString(env.ARCH_SIGNER_PUBLIC_KEY);
  const channelId = optionalString(env.ARCH_CHANNEL_ID) ?? optionalString(env.ARCH_SELECTED_CHANNEL);
  const channelUrl = optionalString(env.ARCH_CHANNEL_URL);
  const surfacePreset = env.ARCH_SURFACE_PRESET ?? "village";
  const grammarPreset = env.ARCH_GRAMMAR_PRESET ?? "open-casts";
  const themePreset = env.ARCH_THEME_PRESET ?? "daylight";
  const surfaceTitle = env.ARCH_SURFACE_TITLE ?? `/${archId}`;
  const provenanceLabel = env.ARCH_PROVENANCE_LABEL ?? `posted via ${archId}`;
  const experimentalPaymentsEnabled = parseBoolean(env.ARCHES_EXPERIMENTAL_PAYMENTS_ENABLED);
  const archesCoinSymbol = env.ARCHES_COIN_SYMBOL ?? "ARCHES";
  const archesCoinContractAddress =
    env.ARCHES_COIN_CONTRACT_ADDRESS ?? "0x09b8903aBf2ea0721E34427353988c2F43c6d64F";
  const archesCoinDiscountBps = parseBasisPoints(env.ARCHES_COIN_DISCOUNT_BPS, 1618);
  const hypersnapLite = new HypersnapLiteClient({
    env,
    fetchImpl: options.fetchImpl,
    messageBuilder: options.messageBuilder ?? new EnvFarcasterMessageBuilder(env),
  });
  const publishConfig: ArchPublishConfig = {
    archId,
    archDomain,
    adminFid,
    channelId,
    channelUrl,
    signerPublicKey,
    provenanceLabel,
  };

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

  app.get("/api/arch", async (c) => {
    const readiness = await hypersnapLite.checkPublishingReadiness(publishConfig);

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
      adminFid,
      supportEmail,
      provenanceLabel,
      publishing: {
        farcaster: publishingStateForArch(readiness),
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
      quote: quoteTotal(body.subtotalCents, paymentMethod, {
        archesCoinSymbol,
        archesCoinContractAddress,
        archesCoinDiscountBps,
      }),
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
    const body = await c.req.json().catch(() => null);
    const parsed = parseCastRequest(body);
    if (!parsed.ok) return c.json({ error: parsed.error }, 400);

    try {
      const result = await hypersnapLite.publishCast(publishConfig, parsed.cast);
      const cast = storePublishedCast(archId, provenanceLabel, parsed.cast, result);
      return c.json({ cast, proof: castProof(result) }, 201);
    } catch (error) {
      if (error instanceof PublishingNotReadyError) {
        return c.json(
          {
            error: "publishing not ready",
            message:
              "Arches will not create local-only fake casts. Connect Hypersnap Lite and pass publishing verification to unlock the composer.",
            publishing: publicReadiness(error.readiness),
          },
          error.readiness.statusCode,
        );
      }

      return c.json(
        {
          error: "publishing failed",
          message: "Hypersnap Lite did not return a real Farcaster publish result.",
        },
        502,
      );
    }
  });

  app.post("/api/publishing/probe", async (c) => {
    const readiness = await hypersnapLite.checkPublishingReadiness(publishConfig);
    if (!readiness.enabled) {
      return c.json(publicReadiness(readiness), readiness.statusCode);
    }

    return c.json(publicReadiness(readiness));
  });

  return app;
}

function parsePaymentMethod(value: unknown): PaymentMethod | null {
  if (value === "fiat" || value === "arches_coin") return value;
  return null;
}

function quoteTotal(
  subtotalCents: number,
  paymentMethod: PaymentMethod,
  config: {
    archesCoinSymbol: string;
    archesCoinContractAddress: string;
    archesCoinDiscountBps: number;
  },
) {
  const discountBps = paymentMethod === "arches_coin" ? config.archesCoinDiscountBps : 0;
  const discountCents = Math.floor((subtotalCents * discountBps) / 10_000);
  const totalCents = subtotalCents - discountCents;

  return {
    currency: "USD",
    subtotalCents,
    paymentMethod,
    discount: {
      eligible: paymentMethod === "arches_coin",
      symbol: config.archesCoinSymbol,
      contractAddress: config.archesCoinContractAddress,
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

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}

function parsePositiveInteger(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseCastRequest(body: unknown):
  | {
      ok: true;
      cast: {
        text: string;
        dotAnky?: string;
        parentId?: string;
      };
    }
  | { ok: false; error: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "cast body must be an object" };
  }

  const text = optionalString((body as Record<string, unknown>).text);
  if (!text) return { ok: false, error: "text is required" };
  if (text.length > 1024) return { ok: false, error: "text must be 1024 characters or fewer" };

  return {
    ok: true,
    cast: {
      text,
      dotAnky: optionalString((body as Record<string, unknown>).dotAnky),
      parentId: optionalString((body as Record<string, unknown>).parentId),
    },
  };
}

function storePublishedCast(
  archId: string,
  provenanceLabel: string,
  cast: CastPublishRequest,
  result: CastPublishResult,
): ArchCast {
  const stored: ArchCast = {
    id: crypto.randomUUID(),
    archId,
    text: cast.text,
    dotAnky: cast.dotAnky,
    parentId: cast.parentId,
    fid: result.fid,
    username: result.username,
    farcasterHash: result.farcasterHash,
    messageId: result.messageId,
    status: result.status,
    provenanceLabel,
    proofMode: "signed-farcaster-message-submit",
    createdAt: new Date().toISOString(),
  };
  casts.push(stored);
  return stored;
}

function publishingStateForArch(readiness: PublishingReadiness) {
  if (readiness.enabled) {
    return {
      enabled: true,
      engine: readiness.engine,
      status: readiness.status,
      proofMode: readiness.proofMode,
      message:
        "Posting through this Arch. Arches signs Farcaster messages and submits them to Hypersnap Lite /v1/submitMessage.",
      checkedAt: readiness.checkedAt,
    };
  }

  return {
    enabled: false,
    engine: readiness.engine,
    status: readiness.reason,
    reason: readiness.reason,
    message:
      "Publishing is not wired yet. Arches will not create local-only fake casts. Connect Hypersnap Lite and pass publishing verification to unlock the composer.",
    nextAction: readiness.nextAction,
    checkedAt: readiness.checkedAt,
  };
}

function publicReadiness(readiness: PublishingReadiness) {
  if (readiness.enabled) {
    return {
      enabled: true,
      ok: true,
      protocol: "farcaster",
      status: readiness.status,
      engine: readiness.engine,
      arch: readiness.arch,
      adminFid: readiness.adminFid,
      signerPublicKey: readiness.signerPublicKey,
      proofMode: readiness.proofMode,
      checkedAt: readiness.checkedAt,
      details: readiness.details,
    };
  }

  return {
    enabled: false,
    ok: false,
    protocol: "farcaster",
    status: readiness.reason,
    engine: readiness.engine,
    reason: readiness.reason,
    nextAction: readiness.nextAction,
    checkedAt: readiness.checkedAt,
    details: readiness.details,
  };
}

function castProof(result: CastPublishResult) {
  return {
    protocol: result.protocol,
    proofMode: result.proofMode,
    farcasterHash: result.farcasterHash,
    messageId: result.messageId,
    signerPublicKey: result.signerPublicKey,
  };
}

const port = Number(Bun.env.PORT ?? 3000);
const app = createArchesApi();

export default {
  port,
  fetch: app.fetch,
};
