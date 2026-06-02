import { describe, expect, test } from "bun:test";
import {
  createChannelEligibilityProvider,
  NeynarChannelEligibilityProvider,
  StaticChannelEligibilityProvider,
} from "./channel-eligibility";

describe("channel eligibility providers", () => {
  test("requires a Neynar API key when Neynar provider is selected", () => {
    expect(() => createChannelEligibilityProvider({ ARCHES_CHANNEL_PROVIDER: "neynar" })).toThrow(
      "NEYNAR_API_KEY is required",
    );
  });

  test("static provider returns configured eligible channels", async () => {
    const provider = new StaticChannelEligibilityProvider([{ slug: "anky", role: "lead" }]);

    expect(await provider.listEligibleChannels(18350)).toEqual([{ slug: "anky", role: "lead" }]);
  });

  test("Neynar provider maps lead and moderator channels for a FID", async () => {
    const requests: string[] = [];
    const provider = new NeynarChannelEligibilityProvider("test-key", async (url, init) => {
      requests.push(String(url));
      expect(init?.headers).toEqual({ "x-api-key": "test-key" });

      return Response.json({
        channels: [
          { id: "lead-channel", name: "Lead Channel", lead: { fid: 18350 } },
          { id: "moderated", name: "Moderated", lead: { fid: 1 }, moderator_fids: [18350] },
          { id: "other", name: "Other", lead: { fid: 2 }, moderator_fids: [3] },
        ],
        next: {},
      });
    });

    expect(await provider.listEligibleChannels(18350)).toEqual([
      { slug: "lead-channel", role: "lead", name: "Lead Channel" },
      { slug: "moderated", role: "moderator", name: "Moderated" },
    ]);
    expect(requests[0]).toContain("https://api.neynar.com/v2/farcaster/channel/list/");
    expect(requests[0]).toContain("limit=200");
  });

  test("Neynar provider follows pagination cursors", async () => {
    let calls = 0;
    const provider = new NeynarChannelEligibilityProvider("test-key", async () => {
      calls += 1;

      if (calls === 1) {
        return Response.json({
          channels: [{ id: "first", lead: { fid: 1 } }],
          next: { cursor: "next-page" },
        });
      }

      return Response.json({
        channels: [{ id: "second", lead: { fid: 1 } }],
        next: {},
      });
    });

    expect(await provider.listEligibleChannels(1)).toEqual([
      { slug: "first", role: "lead" },
      { slug: "second", role: "lead" },
    ]);
    expect(calls).toBe(2);
  });
});
