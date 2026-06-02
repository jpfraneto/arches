import { describe, expect, test } from "bun:test";
import {
  NoopSignerApprovalProvider,
  SignerApprovalError,
  createSignerApprovalProvider,
} from "./signer-approval";

describe("signer approval providers", () => {
  test("uses a no-op signer approval provider by default", () => {
    expect(createSignerApprovalProvider()).toBeInstanceOf(NoopSignerApprovalProvider);
  });

  test("default signer approval provider fails closed", async () => {
    const provider = createSignerApprovalProvider();

    await expect(
      provider.createSignerRequest({
        sessionId: "setup_1",
        hostFid: 18350,
      }),
    ).rejects.toThrow(SignerApprovalError);
  });
});

