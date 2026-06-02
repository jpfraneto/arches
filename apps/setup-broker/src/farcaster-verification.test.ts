import { describe, expect, test } from "bun:test";
import {
  AuthClientFarcasterVerificationProvider,
  FarcasterVerificationError,
  NoopFarcasterVerificationProvider,
  createFarcasterVerificationProvider,
} from "./farcaster-verification";

describe("farcaster verification providers", () => {
  test("uses a no-op provider unless auth-client verification is selected", () => {
    expect(createFarcasterVerificationProvider({})).toBeInstanceOf(
      NoopFarcasterVerificationProvider,
    );
  });

  test("auth-client provider verifies a SIWF message and returns the FID", async () => {
    const provider = new AuthClientFarcasterVerificationProvider({
      async verifySignInMessage(args) {
        expect(args).toEqual({
          nonce: "nonce1234",
          domain: "setup.arches.lat",
          message: "setup.arches.lat wants you to sign in",
          signature: "0xabc123",
          acceptAuthAddress: true,
        });

        return {
          isError: false,
          success: true,
          fid: 18350,
        };
      },
    });

    await expect(
      provider.verifyHostSignature({
        sessionId: "setup_1",
        nonce: "nonce1234",
        domain: "setup.arches.lat",
        message: "setup.arches.lat wants you to sign in",
        signature: "0xabc123",
      }),
    ).resolves.toEqual({ fid: 18350 });
  });

  test("auth-client provider rejects non-hex signatures before verifying", async () => {
    const provider = new AuthClientFarcasterVerificationProvider({
      async verifySignInMessage() {
        throw new Error("invalid signature should fail before auth-client is called");
      },
    });

    await expect(
      provider.verifyHostSignature({
        sessionId: "setup_1",
        nonce: "nonce1234",
        domain: "setup.arches.lat",
        message: "setup.arches.lat wants you to sign in",
        signature: "not-a-signature",
      }),
    ).rejects.toThrow(FarcasterVerificationError);
  });

  test("auth-client provider fails closed when SIWF verification is unsuccessful", async () => {
    const provider = new AuthClientFarcasterVerificationProvider({
      async verifySignInMessage() {
        return {
          isError: false,
          success: false,
          fid: 0,
        };
      },
    });

    try {
      await provider.verifyHostSignature({
        sessionId: "setup_1",
        nonce: "nonce1234",
        domain: "setup.arches.lat",
        message: "setup.arches.lat wants you to sign in",
        signature: "0xabc123",
      });
      throw new Error("expected verification to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(FarcasterVerificationError);
      expect((error as FarcasterVerificationError).status).toBe(401);
    }
  });
});
