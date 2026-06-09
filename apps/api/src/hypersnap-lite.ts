export type HypersnapLiteEnv = Record<string, string | undefined>;

export type ArchPublishConfig = {
  archId: string;
  archDomain: string;
  adminFid: number | null;
  channelId?: string;
  channelUrl?: string;
  signerPublicKey?: string;
  provenanceLabel: string;
};

export type CastPublishRequest = {
  text: string;
  dotAnky?: string;
  parentId?: string;
};

export type SignedFarcasterMessage = {
  bytes: Uint8Array;
  fid: number;
  signerPublicKey: string;
};

export type FarcasterMessageBuilder = {
  canBuildCastAdd(config: ArchPublishConfig): MessageBuildCapability;
  buildCastAdd(config: ArchPublishConfig, cast: CastPublishRequest): Promise<SignedFarcasterMessage>;
};

export type MessageBuildCapability =
  | {
      ok: true;
      signerPublicKey: string;
      mode: "local-signed-protobuf";
    }
  | {
      ok: false;
      reason:
        | "missing_admin_fid"
        | "missing_channel"
        | "missing_signer"
        | "missing_signer_private_key"
        | "invalid_signer_private_key"
        | "invalid_signer_public_key"
        | "invalid_network"
        | "invalid_cast"
        | "message_builder_missing";
      nextAction: string;
    };

export type PublishingReadiness =
  | {
      enabled: true;
      engine: "hypersnap-lite";
      arch: string;
      adminFid: number;
      channelId?: string;
      channelUrl?: string;
      signerPublicKey: string;
      proofMode: "signed-farcaster-message-submit";
      status: "ready";
      protocol: "farcaster";
      ok: true;
      checkedAt: string;
      details?: Record<string, string | number | boolean>;
    }
  | {
      enabled: false;
      engine: "hypersnap-lite";
      reason: PublishingDisabledReason;
      nextAction: string;
      checkedAt: string;
      statusCode: 409 | 501 | 502;
      details?: Record<string, string | number | boolean>;
    };

export type PublishingDisabledReason =
  | "missing_hypersnap_lite_url"
  | "missing_admin_fid"
  | "missing_channel"
  | "missing_signer"
  | "missing_signer_private_key"
  | "invalid_signer_private_key"
  | "invalid_signer_public_key"
  | "invalid_network"
  | "invalid_cast"
  | "message_builder_missing"
  | "hypersnap_unreachable"
  | "hypersnap_submit_failed"
  | "invalid_submit_response";

export type CastPublishResult = {
  status: "confirmed";
  protocol: "farcaster";
  proofMode: "signed-farcaster-message-submit";
  farcasterHash: string;
  messageId?: string;
  fid?: number;
  username?: string;
  signerPublicKey?: string;
};

type FetchLike = typeof fetch;

type HypersnapLiteClientConfig = {
  env: HypersnapLiteEnv;
  fetchImpl?: FetchLike;
  messageBuilder?: FarcasterMessageBuilder;
};

type JsonRecord = Record<string, unknown>;

export class HypersnapLiteClient {
  private readonly env: HypersnapLiteEnv;
  private readonly fetchImpl: FetchLike;
  private readonly messageBuilder: FarcasterMessageBuilder;

  constructor(config: HypersnapLiteClientConfig) {
    this.env = config.env;
    this.fetchImpl = config.fetchImpl ?? fetch;
    this.messageBuilder = config.messageBuilder ?? new NotConfiguredMessageBuilder();
  }

  async checkPublishingReadiness(config: ArchPublishConfig): Promise<PublishingReadiness> {
    const checkedAt = new Date().toISOString();
    const baseUrl = trimmed(this.env.HYPERSNAP_LITE_URL);

    if (!baseUrl) {
      return disabled(
        "missing_hypersnap_lite_url",
        "Start the generated appliance with Hypersnap Lite and set HYPERSNAP_LITE_URL.",
        checkedAt,
        501,
      );
    }

    const configReadiness = basicConfigReadiness(config, checkedAt);
    if (!configReadiness.ok) return configReadiness.readiness;

    const buildCapability = this.messageBuilder.canBuildCastAdd(config);
    if (!buildCapability.ok) {
      return disabled(
        buildCapability.reason,
        buildCapability.nextAction,
        checkedAt,
        buildCapability.reason === "message_builder_missing" ? 501 : 409,
      );
    }

    try {
      const info = await this.getInfo(baseUrl);
      return {
        enabled: true,
        engine: "hypersnap-lite",
        arch: config.archId,
        adminFid: config.adminFid!,
        channelId: config.channelId,
        channelUrl: config.channelUrl,
        signerPublicKey: buildCapability.signerPublicKey,
        proofMode: "signed-farcaster-message-submit",
        status: "ready",
        protocol: "farcaster",
        ok: true,
        checkedAt,
        details: nonSecretDetails(info),
      };
    } catch {
      return disabled(
        "hypersnap_unreachable",
        "Hypersnap Lite /v1/info is not reachable from arches-api.",
        checkedAt,
        502,
      );
    }
  }

  async publishCast(config: ArchPublishConfig, cast: CastPublishRequest): Promise<CastPublishResult> {
    const readiness = await this.checkPublishingReadiness(config);
    if (!readiness.enabled) throw new PublishingNotReadyError(readiness);

    const baseUrl = trimmed(this.env.HYPERSNAP_LITE_URL)!;
    const signedMessage = await this.messageBuilder.buildCastAdd(config, cast);
    const response = await this.fetchImpl(urlFor(baseUrl, "/v1/submitMessage"), {
      method: "POST",
      headers: { "content-type": "application/octet-stream" },
      body: signedMessage.bytes,
    }).catch(() => null);

    if (!response) {
      throw new PublishingNotReadyError(
        disabled(
          "hypersnap_submit_failed",
          "Hypersnap Lite /v1/submitMessage could not be reached.",
          new Date().toISOString(),
          502,
        ),
      );
    }

    const payload = (await response.json().catch(() => null)) as JsonRecord | null;
    const result = normalizeSubmitMessageResponse(payload, signedMessage, cast);
    if (!response.ok || !result) {
      throw new PublishingNotReadyError(
        disabled(
          response.ok ? "invalid_submit_response" : "hypersnap_submit_failed",
          "Hypersnap Lite did not return a confirmed Farcaster Message from /v1/submitMessage.",
          new Date().toISOString(),
          response.status >= 500 ? 502 : 409,
          nonSecretDetails(payload),
        ),
      );
    }

    return result;
  }

  private async getInfo(baseUrl: string) {
    const healthPath = trimmed(this.env.HYPERSNAP_LITE_HEALTH_PATH) ?? "/v1/info";
    const response = await this.fetchImpl(urlFor(baseUrl, healthPath), { method: "GET" });
    if (!response.ok) throw new Error("Hypersnap Lite info check failed");
    return (await response.json().catch(() => null)) as JsonRecord | null;
  }
}

export class PublishingNotReadyError extends Error {
  constructor(readonly readiness: Extract<PublishingReadiness, { enabled: false }>) {
    super(readiness.nextAction);
    this.name = "PublishingNotReadyError";
  }
}

class NotConfiguredMessageBuilder implements FarcasterMessageBuilder {
  canBuildCastAdd(config: ArchPublishConfig): MessageBuildCapability {
    if (!config.signerPublicKey) {
      return {
        ok: false,
        reason: "missing_signer",
        nextAction:
          "Approve an Arch publishing signer during setup. Arches will not ask operators to hand-edit signer env vars in the primary flow.",
      };
    }

    return {
      ok: false,
      reason: "message_builder_missing",
      nextAction:
        "Wire an Arches-side Farcaster Message builder that creates signed castAdd protobuf bytes for Hypersnap Lite /v1/submitMessage.",
    };
  }

  async buildCastAdd(): Promise<SignedFarcasterMessage> {
    throw new Error("Farcaster Message builder is not configured.");
  }
}

function basicConfigReadiness(
  config: ArchPublishConfig,
  checkedAt: string,
):
  | { ok: true }
  | { ok: false; readiness: Extract<PublishingReadiness, { enabled: false }> } {
  if (!config.adminFid) {
    return {
      ok: false,
      readiness: disabled(
        "missing_admin_fid",
        "Complete Farcaster QR setup so Arches can derive the admin FID.",
        checkedAt,
        409,
      ),
    };
  }

  if (!config.channelId && !config.channelUrl) {
    return {
      ok: false,
      readiness: disabled(
        "missing_channel",
        "Choose a Farcaster channel to turn into this Arch before publishing.",
        checkedAt,
        409,
      ),
    };
  }

  return { ok: true };
}

function normalizeSubmitMessageResponse(
  payload: JsonRecord | null,
  signedMessage: SignedFarcasterMessage,
  cast: CastPublishRequest,
): CastPublishResult | null {
  if (!payload) return null;

  const farcasterHash = stringValue(payload.hash);
  if (!isFarcasterHash(farcasterHash)) return null;

  const data = asRecord(payload.data);
  const castAddBody = asRecord(data?.castAddBody);
  const fid = numberValue(data?.fid);
  const signer = stringValue(payload.signer);

  if (data?.type !== "MESSAGE_TYPE_CAST_ADD") return null;
  if (fid && fid !== signedMessage.fid) return null;
  if (castAddBody && stringValue(castAddBody.text) !== cast.text) return null;
  if (signer && signer.toLowerCase() !== signedMessage.signerPublicKey.toLowerCase()) return null;

  return {
    status: "confirmed",
    protocol: "farcaster",
    proofMode: "signed-farcaster-message-submit",
    farcasterHash,
    messageId: farcasterHash,
    fid: fid ?? signedMessage.fid,
    signerPublicKey: signer ?? signedMessage.signerPublicKey,
  };
}

function disabled(
  reason: PublishingDisabledReason,
  nextAction: string,
  checkedAt: string,
  statusCode: 409 | 501 | 502,
  details?: Record<string, string | number | boolean>,
): Extract<PublishingReadiness, { enabled: false }> {
  return {
    enabled: false,
    engine: "hypersnap-lite",
    reason,
    nextAction,
    checkedAt,
    statusCode,
    details,
  };
}

function nonSecretDetails(payload: JsonRecord | null | undefined) {
  if (!payload) return undefined;
  const details: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (/token|secret|private|mnemonic|credential|password|signature/i.test(key)) continue;
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      details[key] = value;
    }
  }
  return Object.keys(details).length ? details : undefined;
}

function urlFor(baseUrl: string, path: string) {
  if (/^https?:\/\//.test(path)) return path;
  return `${baseUrl.replace(/\/+$/, "")}/${path.replace(/^\/+/, "")}`;
}

function trimmed(value: string | undefined) {
  const next = value?.trim();
  return next ? next : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numberValue(value: unknown): number | undefined {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : undefined;
}

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function isFarcasterHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value);
}
