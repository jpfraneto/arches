import { describe, expect, test } from "bun:test";
import {
  HttpPublishingVerificationProvider,
  NoopPublishingVerificationProvider,
  PublishingVerificationError,
  createPublishingVerificationProvider,
} from "./publishing-verification";

describe("publishing verification providers", () => {
  test("uses a no-op provider unless http probe verification is selected", async () => {
    const provider = createPublishingVerificationProvider({});

    expect(provider).toBeInstanceOf(NoopPublishingVerificationProvider);
    await expect(
      provider.verifyPublishing({
        sessionId: "setup_123",
        slug: "anky",
        domain: "anky.arches.lat",
        hostFid: 18350,
      }),
    ).rejects.toThrow("Publishing verification is not configured");
  });

  test("http probe provider requires confirmed Farcaster proof", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const provider = new HttpPublishingVerificationProvider({
      fetchImpl: async (url, init) => {
        requests.push({
          url: String(url),
          body: JSON.parse(String(init?.body)),
        });
        return Response.json({
          ok: true,
          protocol: "farcaster",
          status: "confirmed",
          farcasterHash: "0x1234abcd",
        });
      },
    });

    const result = await provider.verifyPublishing({
      sessionId: "setup_123",
      slug: "anky",
      domain: "anky.arches.lat",
      hostFid: 18350,
      signerPublicKey: "0xsignerpublickey",
    });

    expect(result).toEqual({
      verified: true,
      checkedUrl: "https://anky.arches.lat/api/publishing/probe",
      farcasterHash: "0x1234abcd",
    });
    expect(requests).toEqual([
      {
        url: "https://anky.arches.lat/api/publishing/probe",
        body: {
          sessionId: "setup_123",
          slug: "anky",
          hostFid: 18350,
          signerPublicKey: "0xsignerpublickey",
        },
      },
    ]);
  });

  test("http probe provider rejects local-only or unconfirmed responses", async () => {
    const provider = new HttpPublishingVerificationProvider({
      fetchImpl: async () =>
        Response.json({
          ok: true,
          protocol: "local",
          status: "confirmed",
          farcasterHash: "0x1234abcd",
        }),
    });

    await expect(
      provider.verifyPublishing({
        sessionId: "setup_123",
        slug: "anky",
        domain: "anky.arches.lat",
        hostFid: 18350,
      }),
    ).rejects.toThrow("Publishing probe did not return confirmed Farcaster proof");
  });

  test("rejects invalid host FIDs before calling the appliance", async () => {
    const provider = new HttpPublishingVerificationProvider({
      fetchImpl: async () => Response.json({ ok: true }),
    });

    await expect(
      provider.verifyPublishing({
        sessionId: "setup_123",
        slug: "anky",
        domain: "anky.arches.lat",
        hostFid: 0,
      }),
    ).rejects.toEqual(
      new PublishingVerificationError("Host FID must be a positive integer.", 400),
    );
  });
});
