export type SignerApprovalProvider = {
  createSignerRequest(request: SignerRequestInput): Promise<SignerRequest>;
  getSignerStatus(requestToken: string): Promise<SignerStatus>;
};

export type SignerRequestInput = {
  sessionId: string;
  hostFid: number;
};

export type SignerRequest = {
  requestToken: string;
  url: string;
};

export type SignerStatus =
  | {
      state: "pending";
    }
  | {
      state: "approved";
      fid: number;
      publicKey: string;
    };

export class SignerApprovalError extends Error {
  constructor(
    message: string,
    public status: 400 | 401 | 409 | 501 | 502 = 400,
  ) {
    super(message);
    this.name = "SignerApprovalError";
  }
}

export class NoopSignerApprovalProvider implements SignerApprovalProvider {
  async createSignerRequest(): Promise<SignerRequest> {
    throw new SignerApprovalError(
      "Signer approval is not configured. The setup broker must request a host-approved Arch signer without storing signer private keys.",
      501,
    );
  }

  async getSignerStatus(): Promise<SignerStatus> {
    throw new SignerApprovalError(
      "Signer status polling is not configured. The setup broker cannot approve an Arch signer without a signer provider.",
      501,
    );
  }
}

export function createSignerApprovalProvider(): SignerApprovalProvider {
  return new NoopSignerApprovalProvider();
}

