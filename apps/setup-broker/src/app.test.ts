import { beforeEach, describe, expect, test } from "bun:test";
import { createSetupBrokerApp, resetSetupBrokerSessionsForTests } from "./app";

describe("setup broker", () => {
  beforeEach(() => {
    resetSetupBrokerSessionsForTests();
  });

  test("creates a setup session with schema and terminal output", async () => {
    const app = createSetupBrokerApp({ publicOrigin: "https://setup.arches.test" });
    const response = await app.request("/api/setup/sessions", { method: "POST" });
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.session.sessionId).toStartWith("setup_");
    expect(body.session.currentStepId).toBe("verify-farcaster");
    expect(body.session.completed).toBe(false);
    expect(body.terminal).toContain("Arches setup: setup_");
    expect(body.terminal).toContain("[>] Verify Farcaster");
    expect(body.next.verification).toBe("not_implemented");
  });

  test("serves an existing setup session and terminal text", async () => {
    const app = createSetupBrokerApp();
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    const sessionId = created.session.sessionId;

    const sessionResponse = await app.request(`/api/setup/sessions/${sessionId}`);
    const terminalResponse = await app.request(`/api/setup/sessions/${sessionId}/terminal`);

    expect(sessionResponse.status).toBe(200);
    expect((await sessionResponse.json()).session.sessionId).toBe(sessionId);
    expect(terminalResponse.status).toBe(200);
    expect(await terminalResponse.text()).toContain("Current step: Verify Farcaster");
  });

  test("does not fake Farcaster verification", async () => {
    const app = createSetupBrokerApp();
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    const response = await app.request(
      `/api/setup/sessions/${created.session.sessionId}/farcaster/verify`,
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.message).toContain("Manual admin FID input is rejected.");
  });

  test("keeps dev state mutation disabled by default", async () => {
    const app = createSetupBrokerApp();
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    const response = await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
      method: "PUT",
      body: JSON.stringify({ hostFid: 18350 }),
      headers: { "content-type": "application/json" },
    });

    expect(response.status).toBe(404);
  });

  test("can render later setup steps through explicit dev state", async () => {
    const app = createSetupBrokerApp({ allowDevStateUpdates: true });
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    const response = await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
      method: "PUT",
      body: JSON.stringify({
        hostFid: 18350,
        signerApproved: true,
        eligibleChannels: [{ slug: "anky", role: "lead" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.currentStepId).toBe("choose-community");
    expect(body.terminal).toContain("[>] Choose Community");
    expect(body.terminal).toContain("1. [ ] /anky - lead");
  });
});
