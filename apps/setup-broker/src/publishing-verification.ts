export type PublishingVerificationRequest = {
  sessionId: string;
  slug: string;
  domain: string;
  hostFid: number;
  signerPublicKey?: string;
};

export type PublishingVerificationResult = {
  verified: true;
  checkedUrl: string;
  farcasterHash: string;
};

export type PublishingVerificationProvider = {
  verifyPublishing(request: PublishingVerificationRequest): Promise<PublishingVerificationResult>;
};

export type PublishingVerificationEnv = {
  ARCHES_PUBLISHING_VERIFICATION_PROVIDER?: string;
};

type FetchLike = typeof fetch;

type PublishingProbeResponse = {
  ok?: unknown;
  protocol?: unknown;
  status?: unknown;
  farcasterHash?: unknown;
};

export class PublishingVerificationError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "PublishingVerificationError";
  }
}

export class NoopPublishingVerificationProvider implements PublishingVerificationProvider {
  async verifyPublishing(): Promise<PublishingVerificationResult> {
    throw new PublishingVerificationError(
      "Publishing verification is not configured. Set ARCHES_PUBLISHING_VERIFICATION_PROVIDER=http-probe for the setup broker.",
      501,
    );
  }
}

export class HttpPublishingVerificationProvider implements PublishingVerificationProvider {
  constructor(
    private readonly config: {
      fetchImpl?: FetchLike;
    } = {},
  ) {}

  async verifyPublishing(
    request: PublishingVerificationRequest,
  ): Promise<PublishingVerificationResult> {
    validatePublishingVerificationRequest(request);

    const checkedUrl = `https://${request.domain}/api/publishing/probe`;
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(checkedUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: request.sessionId,
        slug: request.slug,
        hostFid: request.hostFid,
        signerPublicKey: request.signerPublicKey,
      }),
    });

    if (!response.ok) {
      throw new PublishingVerificationError("Publishing probe request failed.", 502);
    }

    const payload = (await response.json().catch(() => null)) as PublishingProbeResponse | null;
    if (
      !payload ||
      payload.ok !== true ||
      payload.protocol !== "farcaster" ||
      payload.status !== "confirmed" ||
      !isFarcasterHash(payload.farcasterHash)
    ) {
      throw new PublishingVerificationError(
        "Publishing probe did not return confirmed Farcaster proof.",
        502,
      );
    }

    return {
      verified: true,
      checkedUrl,
      farcasterHash: payload.farcasterHash,
    };
  }
}

export function createPublishingVerificationProvider(
  env: PublishingVerificationEnv,
): PublishingVerificationProvider {
  if (env.ARCHES_PUBLISHING_VERIFICATION_PROVIDER !== "http-probe") {
    return new NoopPublishingVerificationProvider();
  }

  return new HttpPublishingVerificationProvider();
}

function validatePublishingVerificationRequest(request: PublishingVerificationRequest) {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(request.slug)) {
    throw new PublishingVerificationError("Arch slug must be lowercase URL-safe text.", 400);
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.arches\.lat$/.test(request.domain)) {
    throw new PublishingVerificationError("Arch domain must be a valid arches.lat hostname.", 400);
  }

  if (request.domain !== `${request.slug}.arches.lat`) {
    throw new PublishingVerificationError("Arch slug and domain must match.", 400);
  }

  if (!Number.isInteger(request.hostFid) || request.hostFid <= 0) {
    throw new PublishingVerificationError("Host FID must be a positive integer.", 400);
  }
}

function isFarcasterHash(value: unknown): value is string {
  return typeof value === "string" && /^0x[0-9a-fA-F]{8,}$/.test(value);
}
