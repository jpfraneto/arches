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
      async createChannel() {
        throw new Error("createChannel is not needed for this test");
      },
      async status() {
        throw new Error("status is not needed for this test");
      },
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

  test("auth-client provider creates a Farcaster auth channel", async () => {
    const provider = new AuthClientFarcasterVerificationProvider({
      async createChannel(args) {
        expect(args).toEqual({
          siweUri: "https://setup.arches.lat/setup/setup_1",
          domain: "setup.arches.lat",
          nonce: "nonce1234",
          requestId: "setup_1",
          acceptAuthAddress: true,
        });

        return {
          isError: false,
          data: {
            channelToken: "channel_123",
            url: "farcaster://connect?channelToken=channel_123",
            nonce: "nonce1234",
          },
        };
      },
      async status() {
        throw new Error("status is not needed for this test");
      },
      async verifySignInMessage() {
        throw new Error("verifySignInMessage is not needed for this test");
      },
    });

    await expect(
      provider.createSignInChannel({
        sessionId: "setup_1",
        nonce: "nonce1234",
        domain: "setup.arches.lat",
        siweUri: "https://setup.arches.lat/setup/setup_1",
      }),
    ).resolves.toEqual({
      channelToken: "channel_123",
      url: "farcaster://connect?channelToken=channel_123",
      nonce: "nonce1234",
    });
  });

  test("auth-client provider returns completed Farcaster auth channel status", async () => {
    const provider = new AuthClientFarcasterVerificationProvider({
      async createChannel() {
        throw new Error("createChannel is not needed for this test");
      },
      async status(args) {
        expect(args).toEqual({ channelToken: "channel_123" });

        return {
          isError: false,
          data: {
            state: "completed",
            nonce: "nonce1234",
            message: "signed SIWF message",
            signature: "0xabc123",
            fid: 18350,
            username: "anky",
            displayName: "Anky",
          },
        };
      },
      async verifySignInMessage() {
        throw new Error("verifySignInMessage is not needed for this test");
      },
    });

    await expect(provider.getSignInChannelStatus("channel_123")).resolves.toEqual({
      state: "completed",
      nonce: "nonce1234",
      message: "signed SIWF message",
      signature: "0xabc123",
      fid: 18350,
      username: "anky",
      displayName: "Anky",
    });
  });

  test("auth-client provider rejects non-hex signatures before verifying", async () => {
    const provider = new AuthClientFarcasterVerificationProvider({
      async createChannel() {
        throw new Error("createChannel is not needed for this test");
      },
      async status() {
        throw new Error("status is not needed for this test");
      },
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
      async createChannel() {
        throw new Error("createChannel is not needed for this test");
      },
      async status() {
        throw new Error("status is not needed for this test");
      },
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
