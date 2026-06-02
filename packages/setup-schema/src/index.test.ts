import { describe, expect, test } from "bun:test";
import {
  buildSetupSession,
  findStep,
  renderTerminalSession,
  renderTerminalStep,
  serializeStepValues,
  validateStepSubmission,
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
    expect(findStep(session, "verify-farcaster")?.status).toBe("active");
    expect(findStep(session, "unlock-arch")?.status).toBe("blocked");
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
    expect(step?.fields[0].choices).toEqual([
      { id: "anky", label: "/anky", description: "lead", data: { role: "lead" } },
      {
        id: "builders",
        label: "/builders",
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

[x] Verify Farcaster
[x] Prepare Signer
[>] Choose Community
[ ] Name Surface`);
    expect(renderTerminalSession(session)).toContain(`Eligible channels *:
  Eligibility comes from Farcaster channel state.
  1. [ ] /anky - lead
  2. [ ] /builders - Builders (moderator)`);
  });

  test("can hide pending steps for compact terminal output", () => {
    const session = buildSetupSession({ sessionId: "setup_9" });

    expect(renderTerminalSession(session, { includePendingSteps: false })).not.toContain(
      "[ ] Prepare Signer",
    );
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
    });
    const step = findStep(session, "launch-appliance");

    expect(step).toBeDefined();
    expect(renderTerminalStep(step!)).toContain(`Install command: curl -fsSL https://install.arches.lat | bash
  The explicit fallback command is available if automatic setup cannot continue.
  Copy:
  curl -fsSL https://install.arches.lat | bash`);
  });
});
