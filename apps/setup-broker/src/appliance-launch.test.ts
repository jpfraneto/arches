import { describe, expect, test } from "bun:test";
import {
  ApplianceLaunchError,
  HttpHealthApplianceLaunchProvider,
  NoopApplianceLaunchProvider,
  createApplianceLaunchProvider,
} from "./appliance-launch";

describe("appliance launch providers", () => {
  test("uses a no-op provider unless http health verification is selected", async () => {
    const provider = createApplianceLaunchProvider({});

    expect(provider).toBeInstanceOf(NoopApplianceLaunchProvider);
    await expect(
      provider.verifyApplianceLaunch({
        sessionId: "setup_123",
        slug: "anky",
        domain: "anky.arches.lat",
        hostingMode: "tunnel-local",
      }),
    ).rejects.toThrow("Appliance launch verification is not configured");
  });

  test("http health provider verifies an ok appliance response", async () => {
    const checkedUrls: string[] = [];
    const provider = new HttpHealthApplianceLaunchProvider({
      fetchImpl: async (url) => {
        checkedUrls.push(String(url));
        return Response.json({ ok: true });
      },
    });

    const result = await provider.verifyApplianceLaunch({
      sessionId: "setup_123",
      slug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
    });

    expect(result).toEqual({
      launched: true,
      checkedUrl: "https://anky.arches.lat/health",
    });
    expect(checkedUrls).toEqual(["https://anky.arches.lat/health"]);
  });

  test("http health provider fails closed on unhealthy responses", async () => {
    const provider = new HttpHealthApplianceLaunchProvider({
      fetchImpl: async () => Response.json({ ok: false }),
    });

    await expect(
      provider.verifyApplianceLaunch({
        sessionId: "setup_123",
        slug: "anky",
        domain: "anky.arches.lat",
        hostingMode: "tunnel-local",
      }),
    ).rejects.toThrow("Appliance health check did not return an ok response");
  });

  test("rejects non-public launch checks", async () => {
    const provider = new HttpHealthApplianceLaunchProvider({
      fetchImpl: async () => Response.json({ ok: true }),
    });

    await expect(
      provider.verifyApplianceLaunch({
        sessionId: "setup_123",
        slug: "anky",
        domain: "anky.arches.lat",
        hostingMode: "local",
      }),
    ).rejects.toEqual(
      new ApplianceLaunchError(
        "Appliance launch verification requires a public hosting mode.",
        409,
      ),
    );
  });
});
