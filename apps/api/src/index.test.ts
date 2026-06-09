import { describe, expect, test } from "bun:test";
import { createArchesApi } from "./index";
import type {
  ArchPublishConfig,
  CastPublishRequest,
  FarcasterMessageBuilder,
  MessageBuildCapability,
} from "./hypersnap-lite";

const TEST_ONLY_SIGNER_PRIVATE_KEY =
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const TEST_ONLY_SIGNER_PUBLIC_KEY =
  "0x207a067892821e25d770f1fba0c47c11ff4b813e54162ece9eb839e076231ab6";

describe("arches api", () => {
  test("publishing probe fails closed when Hypersnap Lite /v1/info is unreachable", async () => {
    const api = createArchesApi({
      env: readyEnv("unreachable"),
      messageBuilder: fakeMessageBuilder(),
      fetchImpl: async () => {
        throw new Error("connection refused");
      },
    });

    const response = await api.fetch(
      new Request("http://localhost/api/publishing/probe", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.enabled).toBe(false);
    expect(body.reason).toBe("hypersnap_unreachable");
    expect(body.nextAction).toContain("/v1/info");
  });

  test("publishing probe fails closed when signer private key is missing", async () => {
    const api = createArchesApi({
      env: {
        ...readyEnv("missing-signer"),
        ARCH_SIGNER_PRIVATE_KEY: "",
      },
      fetchImpl: fakeHypersnapFetch(),
    });

    const response = await api.fetch(
      new Request("http://localhost/api/publishing/probe", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.enabled).toBe(false);
    expect(body.reason).toBe("missing_signer_private_key");
  });

  test("publishing probe fails closed when message construction capability is missing", async () => {
    const api = createArchesApi({
      env: readyEnv("missing-builder"),
      messageBuilder: {
        canBuildCastAdd(): MessageBuildCapability {
          return {
            ok: false,
            reason: "message_builder_missing",
            nextAction: "No builder available.",
          };
        },
        async buildCastAdd() {
          throw new Error("No builder available.");
        },
      },
      fetchImpl: fakeHypersnapFetch(),
    });

    const response = await api.fetch(
      new Request("http://localhost/api/publishing/probe", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.enabled).toBe(false);
    expect(body.reason).toBe("message_builder_missing");
    expect(body.nextAction).toBe("No builder available.");
  });

  test("publishing probe succeeds when Arch config, signer, builder, and Hypersnap info are present", async () => {
    const api = createArchesApi({
      env: readyEnv("probe-ready"),
      fetchImpl: fakeHypersnapFetch(),
    });

    const response = await api.fetch(
      new Request("http://localhost/api/publishing/probe", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      enabled: true,
      ok: true,
      protocol: "farcaster",
      status: "ready",
      engine: "hypersnap-lite",
      arch: "probe-ready",
      adminFid: 123,
      signerPublicKey: TEST_ONLY_SIGNER_PUBLIC_KEY,
      proofMode: "signed-farcaster-message-submit",
    });
  });

  test("publishing probe fails when signer public and private keys do not match", async () => {
    const api = createArchesApi({
      env: {
        ...readyEnv("signer-mismatch"),
        ARCH_SIGNER_PUBLIC_KEY:
          "0x1111111111111111111111111111111111111111111111111111111111111111",
      },
      fetchImpl: fakeHypersnapFetch(),
    });

    const response = await api.fetch(
      new Request("http://localhost/api/publishing/probe", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.reason).toBe("invalid_signer_public_key");
  });

  test("POST /api/casts rejects empty text", async () => {
    const api = createArchesApi({ env: readyEnv("empty-text") });

    const response = await api.fetch(jsonRequest("http://localhost/api/casts", { text: "   " }));
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("text is required");
  });

  test("POST /api/casts rejects when publishing is locked", async () => {
    const api = createArchesApi({
      env: {
        ...readyEnv("locked-casts"),
        ARCH_SIGNER_PRIVATE_KEY: "",
      },
      fetchImpl: fakeHypersnapFetch(),
    });

    const response = await api.fetch(
      jsonRequest("http://localhost/api/casts", {
        text: "this must not become local feed data",
      }),
    );
    const body = await response.json();
    const feed = await api.fetch(new Request("http://localhost/api/feed"));
    const feedBody = await feed.json();

    expect(response.status).toBe(409);
    expect(body.publishing.reason).toBe("missing_signer_private_key");
    expect(feedBody.casts).toEqual([]);
  });

  test("POST /api/casts submits signed protobuf bytes to /v1/submitMessage", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createArchesApi({
      env: readyEnv("submit-shape"),
      fetchImpl: fakeHypersnapFetch(calls),
    });

    const response = await api.fetch(
      jsonRequest("http://localhost/api/casts", {
        text: "real Farcaster cast through this Arch",
      }),
    );

    expect(response.status).toBe(201);
    const submitCall = calls.find((call) => call.url.endsWith("/v1/submitMessage"));
    expect(submitCall?.init.method).toBe("POST");
    expect((submitCall?.init.headers as Record<string, string>)["content-type"]).toBe(
      "application/octet-stream",
    );
    expect(submitCall?.init.body).toBeInstanceOf(Uint8Array);
    expect(((submitCall?.init.body as Uint8Array) ?? []).length).toBeGreaterThan(100);
  });

  test("POST /api/casts does not call Hypersnap when the builder fails", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const api = createArchesApi({
      env: {
        ...readyEnv("builder-fails"),
        ARCH_SIGNER_PRIVATE_KEY: "not-a-key",
      },
      fetchImpl: fakeHypersnapFetch(calls),
    });

    const response = await api.fetch(
      jsonRequest("http://localhost/api/casts", {
        text: "this must not reach Hypersnap",
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.publishing.reason).toBe("invalid_signer_private_key");
    expect(calls).toEqual([]);
  });

  test("POST /api/casts stores only a real mocked Farcaster hash/result", async () => {
    const api = createArchesApi({
      env: readyEnv("real-casts"),
      fetchImpl: fakeHypersnapFetch(),
    });

    const response = await api.fetch(
      jsonRequest("http://localhost/api/casts", {
        text: "real Farcaster cast through this Arch",
        dotAnky: "local grammar",
      }),
    );
    const body = await response.json();
    const feed = await api.fetch(new Request("http://localhost/api/feed"));
    const feedBody = await feed.json();

    expect(response.status).toBe(201);
    expect(body.cast).toMatchObject({
      archId: "real-casts",
      text: "real Farcaster cast through this Arch",
      dotAnky: "local grammar",
      fid: 123,
      farcasterHash: "0x2222222222222222222222222222222222222222",
      messageId: "0x2222222222222222222222222222222222222222",
      status: "confirmed",
      provenanceLabel: "posted via real-casts",
      proofMode: "signed-farcaster-message-submit",
    });
    expect(body.proof).toMatchObject({
      protocol: "farcaster",
      proofMode: "signed-farcaster-message-submit",
      farcasterHash: "0x2222222222222222222222222222222222222222",
    });
    expect(feedBody.casts).toHaveLength(1);
    expect(feedBody.casts[0].farcasterHash).toBe(
      "0x2222222222222222222222222222222222222222",
    );
  });
});

function readyEnv(arch: string) {
  return {
    ARCH_SLUG: arch,
    ARCH_DOMAIN: `${arch}.arches.lat`,
    ARCH_ADMIN_FID: "123",
    ARCH_CHANNEL_ID: arch,
    ARCH_CHANNEL_URL: `https://warpcast.com/~/channel/${arch}`,
    ARCH_SIGNER_PUBLIC_KEY: TEST_ONLY_SIGNER_PUBLIC_KEY,
    ARCH_SIGNER_PRIVATE_KEY: TEST_ONLY_SIGNER_PRIVATE_KEY,
    FARCASTER_NETWORK: "testnet",
    HYPERSNAP_LITE_URL: "http://hypersnap.test",
    HYPERSNAP_LITE_HEALTH_PATH: "/v1/info",
  };
}

function jsonRequest(url: string, body: unknown) {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function fakeMessageBuilder(bytes = new Uint8Array([9, 8, 7])): FarcasterMessageBuilder {
  return {
    canBuildCastAdd(config: ArchPublishConfig): MessageBuildCapability {
      return {
        ok: true,
        signerPublicKey: config.signerPublicKey!,
        mode: "local-signed-protobuf",
      };
    },
    async buildCastAdd(config: ArchPublishConfig, _cast: CastPublishRequest) {
      return {
        bytes,
        fid: config.adminFid!,
        signerPublicKey: config.signerPublicKey!,
      };
    },
  };
}

function fakeHypersnapFetch(calls: Array<{ url: string; init: RequestInit }> = []): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    const target = String(url);
    calls.push({ url: target, init: init ?? {} });

    if (target.endsWith("/v1/info")) {
      return Response.json({ version: "test", numShards: 2, peer_id: "peer_123" });
    }

    if (target.endsWith("/v1/submitMessage")) {
      return Response.json({
        data: {
          type: "MESSAGE_TYPE_CAST_ADD",
          fid: 123,
          timestamp: 48994466,
          network: "FARCASTER_NETWORK_MAINNET",
          castAddBody: {
            text: "real Farcaster cast through this Arch",
            embedsDeprecated: [],
            mentions: [],
            mentionsPositions: [],
            embeds: [],
          },
        },
        hash: "0x2222222222222222222222222222222222222222",
        hashScheme: "HASH_SCHEME_BLAKE3",
        signature: "redacted-test-signature",
        signatureScheme: "SIGNATURE_SCHEME_ED25519",
        signer: TEST_ONLY_SIGNER_PUBLIC_KEY,
      });
    }

    return Response.json({ error: "unexpected request", method: init?.method, target }, { status: 404 });
  }) as typeof fetch;
}
