import { describe, expect, test } from "bun:test";
import { Message } from "@farcaster/core";
import { buildSignedCastAddMessage } from "./farcaster-message";

const TEST_ONLY_SIGNER_PRIVATE_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_ONLY_SIGNER_PUBLIC_KEY =
  "0x207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";

describe("Farcaster castAdd message builder", () => {
  test("rejects missing fid", async () => {
    await expect(
      buildSignedCastAddMessage({
        fid: null,
        text: "hello",
        channelUrl: "https://warpcast.com/~/channel/anky",
        signerPrivateKey: TEST_ONLY_SIGNER_PRIVATE_KEY,
      }),
    ).rejects.toThrow("admin FID");
  });

  test("rejects missing signer", async () => {
    await expect(
      buildSignedCastAddMessage({
        fid: 123,
        text: "hello",
        channelUrl: "https://warpcast.com/~/channel/anky",
      }),
    ).rejects.toThrow("ARCH_SIGNER_PRIVATE_KEY");
  });

  test("rejects empty text", async () => {
    await expect(
      buildSignedCastAddMessage({
        fid: 123,
        text: "   ",
        channelUrl: "https://warpcast.com/~/channel/anky",
        signerPrivateKey: TEST_ONLY_SIGNER_PRIVATE_KEY,
      }),
    ).rejects.toThrow("Cast text is required");
  });

  test("returns signed protobuf bytes for valid config", async () => {
    const result = await buildSignedCastAddMessage({
      fid: 123,
      text: "hello from an Arch",
      channelUrl: "https://warpcast.com/~/channel/anky",
      signerPrivateKey: TEST_ONLY_SIGNER_PRIVATE_KEY,
      signerPublicKey: TEST_ONLY_SIGNER_PUBLIC_KEY,
      network: "testnet",
      timestamp: 123456,
    });
    const decoded = Message.decode(result.bytes);

    expect(result.bytes).toBeInstanceOf(Uint8Array);
    expect(result.bytes.length).toBeGreaterThan(100);
    expect(result.fid).toBe(123);
    expect(result.signerPublicKey).toBe(TEST_ONLY_SIGNER_PUBLIC_KEY);
    expect(decoded.data?.fid).toBe(123);
    expect(decoded.data?.castAddBody?.text).toBe("hello from an Arch");
    expect(decoded.data?.castAddBody?.parentUrl).toBe("https://warpcast.com/~/channel/anky");
  });
});
