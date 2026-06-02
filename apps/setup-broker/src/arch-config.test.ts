import { describe, expect, test } from "bun:test";
import { buildArchConfigSnapshot, renderEnvSnapshot } from "./arch-config";
import type { SetupState } from "../../../packages/setup-schema/src/index";

describe("arch config snapshot", () => {
  test("rejects export before verified setup state exists", () => {
    const result = buildArchConfigSnapshot({ sessionId: "setup_1" });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("farcaster verification required");
    }
  });

  test("requires tunnel provisioning for tunnel-local config", () => {
    const result = buildArchConfigSnapshot({
      ...readyState(),
      tunnelProvisioned: false,
      tunnelId: undefined,
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe("tunnel provisioning required");
    }
  });

  test("builds a non-secret config snapshot and env block", () => {
    const result = buildArchConfigSnapshot(readyState());

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error(result.message);

    expect(result.config).toEqual({
      version: 1,
      sessionId: "setup_ready",
      arch: {
        slug: "anky",
        domain: "anky.arches.lat",
        title: "/anky",
        provenanceLabel: "posted via anky",
        surfacePreset: "bulletin",
        grammarPreset: "curated-updates",
        themePreset: "high-contrast",
        hostFid: 18350,
        supportEmail: "support@arches.lat",
      },
      hosting: {
        mode: "tunnel-local",
        tunnelId: "tunnel_123",
        tunnelProvisioned: true,
      },
      publishing: {
        farcasterEnabled: false,
        status: "not_implemented",
      },
      env: {
        ARCH_SLUG: "anky",
        ARCH_DOMAIN: "anky.arches.lat",
        ARCHES_MODE: "tunnel-local",
        ARCH_ADMIN_FID: "18350",
        ARCH_SUPPORT_EMAIL: "support@arches.lat",
        ARCH_SURFACE_PRESET: "bulletin",
        ARCH_GRAMMAR_PRESET: "curated-updates",
        ARCH_THEME_PRESET: "high-contrast",
        ARCH_SURFACE_TITLE: "/anky",
        ARCH_PROVENANCE_LABEL: "posted via anky",
        ARCHES_PUBLISHING_ENABLED: "false",
        ARCHES_FARCASTER_PUBLISHING_STATUS: "not_implemented",
        CLOUDFLARE_TUNNEL_ID: "tunnel_123",
      },
    });
    expect(JSON.stringify(result.config)).not.toContain("tunnel-token");
    expect(JSON.stringify(result.config)).not.toContain("mnemonic");
  });

  test("renders env values as installer env lines", () => {
    expect(
      renderEnvSnapshot({
        ARCH_SLUG: "anky",
        ARCH_PROVENANCE_LABEL: "posted via anky",
      }),
    ).toBe("ARCH_SLUG=anky\nARCH_PROVENANCE_LABEL=posted via anky");
  });
});

function readyState(): SetupState {
  return {
    sessionId: "setup_ready",
    hostFid: 18350,
    signerApproved: true,
    eligibleChannels: [{ slug: "anky", role: "lead" }],
    selectedChannelSlug: "anky",
    reservedSlug: "anky",
    domain: "anky.arches.lat",
    hostingMode: "tunnel-local",
    surfacePreset: "bulletin",
    grammarPreset: "curated-updates",
    themePreset: "high-contrast",
    surfaceTitle: "/anky",
    provenanceLabel: "posted via anky",
    surfaceConfigured: true,
    tunnelId: "tunnel_123",
    tunnelProvisioned: true,
  };
}
