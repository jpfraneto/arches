import { createAppClient, viemConnector } from "@farcaster/auth-client";

export type FarcasterVerificationProvider = {
  verifyHostSignature(request: FarcasterVerificationRequest): Promise<FarcasterVerificationResult>;
};

export type FarcasterVerificationRequest = {
  sessionId: string;
  nonce: string;
  domain: string;
  message: string;
  signature: string;
};

export type FarcasterVerificationResult = {
  fid: number;
  username?: string;
  displayName?: string;
};

export type FarcasterVerificationEnv = {
  ARCHES_FARCASTER_VERIFIER?: string;
  FARCASTER_AUTH_RELAY_URL?: string;
  FARCASTER_ETH_RPC_URL?: string;
  FARCASTER_ACCEPT_AUTH_ADDRESS?: string;
};

type FarcasterAuthClient = {
  verifySignInMessage(args: {
    nonce: string;
    domain: string;
    message: string;
    signature: `0x${string}`;
    acceptAuthAddress: boolean;
  }): Promise<{
    isError: boolean;
    success?: boolean;
    fid?: number;
    error?: {
      message?: string;
      errCode?: unknown;
    };
  }>;
};

export class FarcasterVerificationError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 409 | 501 | 502 = 400,
  ) {
    super(message);
    this.name = "FarcasterVerificationError";
  }
}

export class NoopFarcasterVerificationProvider implements FarcasterVerificationProvider {
  async verifyHostSignature(): Promise<FarcasterVerificationResult> {
    throw new FarcasterVerificationError(
      "Farcaster verification is not configured. The setup broker must verify a Sign In with Farcaster signature before deriving the host FID.",
      501,
    );
  }
}

export class AuthClientFarcasterVerificationProvider implements FarcasterVerificationProvider {
  constructor(
    private appClient: FarcasterAuthClient,
    private acceptAuthAddress = true,
  ) {}

  async verifyHostSignature(
    request: FarcasterVerificationRequest,
  ): Promise<FarcasterVerificationResult> {
    if (!isHexSignature(request.signature)) {
      throw new FarcasterVerificationError(
        "Farcaster verification signature must be a 0x-prefixed hex string.",
        400,
      );
    }

    const result = await this.appClient.verifySignInMessage({
      nonce: request.nonce,
      domain: request.domain,
      message: request.message,
      signature: request.signature,
      acceptAuthAddress: this.acceptAuthAddress,
    });

    if (result.isError) {
      throw new FarcasterVerificationError(
        result.error?.message ?? "Farcaster SIWF verification failed.",
        statusForAuthClientError(result.error),
      );
    }

    if (!result.success || !Number.isInteger(result.fid) || result.fid <= 0) {
      throw new FarcasterVerificationError("Farcaster SIWF signature is invalid.", 401);
    }

    return { fid: result.fid };
  }
}

export function createFarcasterVerificationProvider(
  env: FarcasterVerificationEnv,
): FarcasterVerificationProvider {
  if (env.ARCHES_FARCASTER_VERIFIER === "auth-client") {
    return new AuthClientFarcasterVerificationProvider(
      createAppClient({
        relay: env.FARCASTER_AUTH_RELAY_URL,
        ethereum: viemConnector(
          env.FARCASTER_ETH_RPC_URL ? { rpcUrl: env.FARCASTER_ETH_RPC_URL } : undefined,
        ),
      }),
      env.FARCASTER_ACCEPT_AUTH_ADDRESS !== "0",
    );
  }

  return new NoopFarcasterVerificationProvider();
}

function isHexSignature(value: string): value is `0x${string}` {
  return /^0x[0-9a-fA-F]+$/.test(value);
}

function statusForAuthClientError(error: unknown): 400 | 401 | 409 | 501 | 502 {
  const errCode =
    typeof error === "object" && error && "errCode" in error
      ? (error as { errCode?: unknown }).errCode
      : undefined;

  switch (errCode) {
    case "unauthenticated":
    case "unauthorized":
      return 401;
    case "bad_request":
    case "bad_request.validation_failure":
      return 400;
    case "not_implemented":
      return 501;
    case "unavailable":
      return 502;
    default:
      return 400;
  }
}
