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

