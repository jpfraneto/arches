import { describe, expect, test } from "bun:test";
import {
  buildSetupSession,
  findStep,
  renderTerminalSession,
  renderTerminalStep,
  serializeStepValues,
  validateStepSubmission,
  withFieldErrors,
  type SetupState,
} from "./index";

describe("buildSetupSession", () => {
  test("starts with Farcaster verification and blocks composer unlock", () => {
    const session = buildSetupSession({
      sessionId: "setup_1",
      farcasterQrUrl: "https://example.com/qr",
    });

    expect(session.start).toBe("verify-farcaster");
    expect(session.currentStepId).toBe("verify-farcaster");
    expect(session.completed).toBe(false);
    expect(session.summary).toEqual({
      readiness: "in-progress",
      completedStepCount: 0,
      totalStepCount: 9,
      blockedStepCount: 1,
      currentStepTitle: "Verify Farcaster",
      nextAction: "Continue with Verify Farcaster.",
    });
    expect(findStep(session, "verify-farcaster")?.status).toBe("active");
    expect(findStep(session, "unlock-arch")?.status).toBe("blocked");
    expect(session.steps.map((step) => step.displayIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(findStep(session, "verify-farcaster")?.nextStepId).toBe("prepare-signer");
    expect(findStep(session, "prepare-signer")?.previousStepId).toBe("verify-farcaster");
    expect(findStep(session, "launch-appliance")?.icon).toBe("rocket");
  });

  test("carries requested unclaimed slug into Farcaster verification copy", () => {
    const session = buildSetupSession({
      sessionId: "setup_requested",
      requestedSlug: "anky",
    });

    expect(session.requestedSlug).toBe("anky");
    expect(findStep(session, "verify-farcaster")?.description).toContain(
      "host FID for anky.arches.lat",
    );
  });

  test("renders signer approval URL without signer secrets", () => {
    const session = buildSetupSession({
      sessionId: "setup_signer",
      hostFid: 18350,
      signerRequestUrl: "farcaster://signer-request?token=signer_123",
      signerStatus: "waiting",
    });
    const step = findStep(session, "prepare-signer");

    expect(session.currentStepId).toBe("prepare-signer");
    expect(step?.actions).toEqual([
      {
        id: "check-signer-approval",
        label: "Check signer approval",
        method: "post",
        path: "actions/check-signer-approval",
        description: "Poll the provider until the host-approved signer is verified.",
      },
    ]);
    expect(step?.fields.map((field) => field.id)).toEqual(["signer", "signerRequest"]);
    expect(step?.fields[1].value).toBe("farcaster://signer-request?token=signer_123");
    expect(JSON.stringify(step)).not.toContain("privateKey");
    expect(JSON.stringify(step)).not.toContain("mnemonic");
  });

  test("renders approved signer public key metadata", () => {
    const session = buildSetupSession({
      sessionId: "setup_signer_approved",
      hostFid: 18350,
      signerApproved: true,
      signerPublicKey: "0xsignerpublickey",
    });
    const step = findStep(session, "prepare-signer");

    expect(session.currentStepId).toBe("choose-community");
    expect(step?.status).toBe("completed");
    expect(step?.actions).toBeUndefined();
    expect(step?.fields[0].value).toBe("approved");
    expect(step?.fields[0].description).toContain("0xsignerpublickey");
  });

  test("renders eligible channels as radio choices after signer approval", () => {
    const session = buildSetupSession({
      sessionId: "setup_2",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [
        { slug: "anky", role: "lead" },
        { slug: "builders", role: "moderator", name: "Builders" },
      ],
    });

    const step = findStep(session, "choose-community");

    expect(session.currentStepId).toBe("choose-community");
    expect(step?.status).toBe("active");
    expect(step?.actions).toEqual([
      {
        id: "refresh-eligible-channels",
        label: "Refresh eligible channels",
        method: "post",
        path: "actions/refresh-eligible-channels",
        description: "Reload channels the verified host FID can lead or moderate.",
      },
    ]);
    expect(step?.fields[0].choices).toEqual([
      {
        id: "anky",
        label: "/anky",
        extraLabel: "lead",
        description: "lead",
        data: { role: "lead" },
      },
      {
        id: "builders",
        label: "/builders",
        extraLabel: "moderator",
        description: "Builders (moderator)",
        data: { role: "moderator" },
      },
    ]);
  });

  test("does not complete unlock when publishing is not verified", () => {
    const state: SetupState = {
      sessionId: "setup_3",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
      reservedSlug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
      surfaceConfigured: true,
      applianceLaunched: true,
      composerUnlocked: true,
    };

    const session = buildSetupSession(state);

    expect(session.currentStepId).toBe("verify-publishing");
    expect(findStep(session, "unlock-arch")?.status).toBe("blocked");
    expect(session.completed).toBe(false);
  });

  test("renders configurable surface presets before launch", () => {
    const session = buildSetupSession({
      sessionId: "setup_surface",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
      reservedSlug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
    });
    const step = findStep(session, "configure-surface");

    expect(session.currentStepId).toBe("configure-surface");
    expect(step?.fields.map((field) => field.id)).toEqual([
      "surfacePreset",
      "grammarPreset",
      "themePreset",
      "title",
      "provenance",
    ]);
    expect(step?.fields[0].value).toBe("village");
    expect(step?.fields[0].choices?.map((choice) => choice.id)).toEqual([
      "village",
      "bulletin",
      "library",
    ]);
    expect(step?.fields[1].value).toBe("open-casts");
    expect(step?.fields[2].value).toBe("daylight");
  });

  test("renders launch actions from setup state", () => {
    const beforeTunnel = buildSetupSession({
      sessionId: "setup_launch_action",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
      reservedSlug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
      surfaceConfigured: true,
    });
    const afterTunnel = buildSetupSession({
      sessionId: "setup_launch_action",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
      reservedSlug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
      surfaceConfigured: true,
      tunnelProvisioned: true,
      tunnelId: "tunnel_123",
    });

    expect(findStep(beforeTunnel, "launch-appliance")?.actions).toEqual([
      {
        id: "provision-tunnel",
        label: "Provision tunnel",
        method: "post",
        path: "actions/provision-tunnel",
        description: "Create the Cloudflare Tunnel route for this Arch hostname.",
      },
    ]);
    expect(findStep(afterTunnel, "launch-appliance")?.actions).toEqual([
      {
        id: "export-arch-config",
        label: "Export Arch config",
        method: "post",
        path: "actions/export-arch-config",
        description: "Render the non-secret appliance config from verified setup state.",
      },
    ]);
  });

  test("completes only after publishing is verified and composer is unlocked", () => {
    const session = buildSetupSession({
      sessionId: "setup_4",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
      reservedSlug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
      surfaceConfigured: true,
      applianceLaunched: true,
      publishingVerified: true,
      composerUnlocked: true,
    });

    expect(session.completed).toBe(true);
    expect(session.currentStepId).toBe("unlock-arch");
    expect(session.summary).toEqual({
      readiness: "complete",
      completedStepCount: 9,
      totalStepCount: 9,
      blockedStepCount: 0,
      currentStepTitle: "Unlock Arch",
      nextAction: "Setup is complete.",
    });
  });
});

describe("validateStepSubmission", () => {
  test("requires required fields", () => {
    const session = buildSetupSession({ sessionId: "setup_5" });
    const step = findStep(session, "verify-farcaster");

    expect(step).toBeDefined();
    expect(validateStepSubmission(step!, {})).toEqual([{ fieldId: "qr", message: "required" }]);
  });

  test("rejects radio values that are not valid choices", () => {
    const session = buildSetupSession({
      sessionId: "setup_6",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
    });
    const step = findStep(session, "choose-community");

    expect(step).toBeDefined();
    expect(validateStepSubmission(step!, { channel: "not-anky" })).toEqual([
      { fieldId: "channel", message: "invalid choice" },
    ]);
  });

  test("rejects invalid surface preset choices", () => {
    const session = buildSetupSession({
      sessionId: "setup_surface_validation",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
      reservedSlug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
    });
    const step = findStep(session, "configure-surface");

    expect(step).toBeDefined();
    expect(
      validateStepSubmission(step!, {
        surfacePreset: "not-a-preset",
        grammarPreset: "open-casts",
        themePreset: "daylight",
        title: "/anky",
        provenance: "posted via anky",
      }),
    ).toEqual([{ fieldId: "surfacePreset", message: "invalid choice" }]);
  });
});

describe("withFieldErrors", () => {
  test("adds Discourse-style field error descriptions to a setup session", () => {
    const session = buildSetupSession({
      sessionId: "setup_field_errors",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
    });
    const step = findStep(session, "choose-community");

    expect(step).toBeDefined();

    const invalidSession = withFieldErrors(session, validateStepSubmission(step!, {}));
    const invalidStep = findStep(invalidSession, "choose-community");

    expect(invalidStep?.fields[0].errorDescription).toBe("This field is required.");
    expect(findStep(invalidSession, "verify-farcaster")?.fields[0].errorDescription).toBeUndefined();
  });
});

describe("serializeStepValues", () => {
  test("serializes existing field values", () => {
    const session = buildSetupSession({
      sessionId: "setup_7",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
    });
    const step = findStep(session, "name-surface");

    expect(step).toBeDefined();
    expect(serializeStepValues(step!)).toEqual({
      slug: "anky",
      domain: "anky.arches.lat",
    });
  });
});

describe("terminal rendering", () => {
  test("renders setup progress and active step choices", () => {
    const session = buildSetupSession({
      sessionId: "setup_8",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [
        { slug: "anky", role: "lead" },
        { slug: "builders", role: "moderator", name: "Builders" },
      ],
    });

    expect(renderTerminalSession(session)).toContain(`Arches setup: setup_8
Current step: Choose Community
Progress: 2/9 steps complete
Readiness: in-progress
Next: Continue with Choose Community.

[x] Verify Farcaster
[x] Prepare Signer
[>] Choose Community
[ ] Name Surface`);
    expect(renderTerminalSession(session)).toContain(`Eligible channels *:
  Eligibility comes from Farcaster channel state.
  1. [ ] /anky - lead
  2. [ ] /builders - Builders (moderator)`);
  });

  test("renders completed step provenance when present", () => {
    const session = buildSetupSession({
      sessionId: "setup_provenance",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
    });
    const annotatedSession = {
      ...session,
      steps: session.steps.map((step) =>
        step.id === "verify-farcaster"
          ? {
              ...step,
              completedAt: "2026-06-02T13:00:00.000Z",
              completedByFid: 18350,
              completionEventId: "event_123",
              completionEventType: "farcaster_verified",
            }
          : step,
      ),
    };

    expect(renderTerminalSession(annotatedSession)).toContain(
      "[x] Verify Farcaster (farcaster_verified at 2026-06-02T13:00:00.000Z)",
    );
  });

  test("can hide pending steps for compact terminal output", () => {
    const session = buildSetupSession({ sessionId: "setup_9" });

    expect(renderTerminalSession(session, { includePendingSteps: false })).not.toContain(
      "[ ] Prepare Signer",
    );
  });

  test("renders server-defined step actions in terminal output", () => {
    const session = buildSetupSession({
      sessionId: "setup_actions",
      hostFid: 18350,
    });
    const step = findStep(session, "prepare-signer");

    expect(step).toBeDefined();
    expect(renderTerminalStep(step!)).toContain(`Actions:
  - Request signer approval
    Create a provider-backed signer approval request for this host FID.`);
  });

  test("renders copy fields as multiline copy blocks", () => {
    const session = buildSetupSession({
      sessionId: "setup_10",
      hostFid: 18350,
      signerApproved: true,
      eligibleChannels: [{ slug: "anky", role: "lead" }],
      selectedChannelSlug: "anky",
      reservedSlug: "anky",
      domain: "anky.arches.lat",
      hostingMode: "tunnel-local",
      surfaceConfigured: true,
      installCommand: "curl -fsSL https://install.arches.lat | bash",
      archConfigExported: true,
      archConfigEnv: "ARCH_SLUG=anky\nARCH_DOMAIN=anky.arches.lat",
    });
    const step = findStep(session, "launch-appliance");

    expect(step).toBeDefined();
    expect(step?.fields.map((field) => field.id)).toEqual([
      "tunnel",
      "installCommand",
      "archConfig",
    ]);
    expect(renderTerminalStep(step!)).toContain(`Install command: curl -fsSL https://install.arches.lat | bash
  The explicit fallback command is available if automatic setup cannot continue.
  Copy:
  curl -fsSL https://install.arches.lat | bash`);
    expect(renderTerminalStep(step!)).toContain(`Arch config env: ARCH_SLUG=anky
ARCH_DOMAIN=anky.arches.lat
  Non-secret setup settings exported from the verified wizard state.
  Copy:
  ARCH_SLUG=anky
  ARCH_DOMAIN=anky.arches.lat`);
  });
});
