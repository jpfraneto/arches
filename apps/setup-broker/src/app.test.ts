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
    expect(body.setupUrl).toStartWith("https://setup.arches.test/setup/setup_");
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

  test("creates a setup session as terminal text for the installer", async () => {
    const app = createSetupBrokerApp({ publicOrigin: "https://setup.arches.test" });
    const response = await app.request("/api/setup/sessions/terminal", { method: "POST" });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).toContain("Arches setup: setup_");
    expect(text).toContain("Current step: Verify Farcaster");
    expect(text).toContain("Browser setup: https://setup.arches.test/setup/setup_");
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

  test("requires host FID before refreshing eligible channels", async () => {
    const app = createSetupBrokerApp();
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    const response = await app.request(
      `/api/setup/sessions/${created.session.sessionId}/channels/refresh`,
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain("derives a host FID from Farcaster verification");
  });

  test("refreshes eligible channels after host FID exists", async () => {
    const app = createSetupBrokerApp({
      allowDevStateUpdates: true,
      channelEligibilityProvider: {
        async listEligibleChannels(fid) {
          expect(fid).toBe(18350);
          return [{ slug: "anky", role: "lead", name: "Anky" }];
        },
      },
    });
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
      method: "PUT",
      body: JSON.stringify({ hostFid: 18350, signerApproved: true }),
      headers: { "content-type": "application/json" },
    });
    const response = await app.request(
      `/api/setup/sessions/${created.session.sessionId}/channels/refresh`,
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.currentStepId).toBe("choose-community");
    expect(body.session.steps[2].fields[0].choices).toEqual([
      { id: "anky", label: "/anky", description: "Anky (lead)", data: { role: "lead" } },
    ]);
  });

  test("requires host FID before reserving slug", async () => {
    const app = createSetupBrokerApp();
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    const response = await app.request(
      `/api/setup/sessions/${created.session.sessionId}/slug/reserve`,
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain("derives a host FID from Farcaster verification");
  });

  test("requires selected eligible channel before reserving slug", async () => {
    const app = createSetupBrokerApp({ allowDevStateUpdates: true });
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
      method: "PUT",
      body: JSON.stringify({ hostFid: 18350, signerApproved: true }),
      headers: { "content-type": "application/json" },
    });
    const response = await app.request(
      `/api/setup/sessions/${created.session.sessionId}/slug/reserve`,
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain("Choose an eligible Farcaster channel");
  });

  test("rejects custom slug reservation before ownership rules exist", async () => {
    const app = createSetupBrokerApp({ allowDevStateUpdates: true });
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
      method: "PUT",
      body: JSON.stringify({
        hostFid: 18350,
        signerApproved: true,
        eligibleChannels: [{ slug: "anky", role: "lead" }],
        selectedChannelSlug: "anky",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await app.request(
      `/api/setup/sessions/${created.session.sessionId}/slug/reserve`,
      {
        method: "POST",
        body: JSON.stringify({ slug: "custom" }),
        headers: { "content-type": "application/json" },
      },
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.message).toContain("only reserves the selected eligible channel slug");
  });

  test("reserves selected eligible channel slug and advances to hosting", async () => {
    const app = createSetupBrokerApp({ allowDevStateUpdates: true });
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
      method: "PUT",
      body: JSON.stringify({
        hostFid: 18350,
        signerApproved: true,
        eligibleChannels: [{ slug: "anky", role: "lead" }],
        selectedChannelSlug: "anky",
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await app.request(
      `/api/setup/sessions/${created.session.sessionId}/slug/reserve`,
      { method: "POST" },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.session.currentStepId).toBe("choose-hosting");
    expect(body.session.steps[3].fields[0].value).toBe("anky");
    expect(body.session.steps[3].fields[1].value).toBe("anky.arches.lat");
  });

  test("prevents a second session from reserving the same slug", async () => {
    const app = createSetupBrokerApp({ allowDevStateUpdates: true });
    const reserve = async () => {
      const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
      const created = await createResponse.json();
      await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
        method: "PUT",
        body: JSON.stringify({
          hostFid: 18350,
          signerApproved: true,
          eligibleChannels: [{ slug: "anky", role: "lead" }],
          selectedChannelSlug: "anky",
        }),
        headers: { "content-type": "application/json" },
      });

      return app.request(`/api/setup/sessions/${created.session.sessionId}/slug/reserve`, {
        method: "POST",
      });
    };

    expect((await reserve()).status).toBe(200);

    const conflict = await reserve();
    const body = await conflict.json();

    expect(conflict.status).toBe(409);
    expect(body.message).toContain("already reserved by another setup session");
  });

  test("redirects browser setup entry to a new session page", async () => {
    const app = createSetupBrokerApp();
    const response = await app.request("/setup", { redirect: "manual" });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toStartWith("/setup/setup_");
  });

  test("renders an unclaimed Arch page from wildcard host", async () => {
    const app = createSetupBrokerApp();
    const response = await app.request("/", {
      headers: { host: "anky.arches.lat" },
    });
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>anky.arches.lat is unclaimed</title>");
    expect(html).toContain("curl -fsSL https://install.arches.lat | bash");
    expect(html).toContain("/setup?requested=anky");
    expect(html).toContain("Arches will not accept a manual admin claim.");
  });

  test("does not treat reserved Arches subdomains as unclaimed communities", async () => {
    const app = createSetupBrokerApp();
    const response = await app.request("/", {
      headers: { host: "install.arches.lat" },
      redirect: "manual",
    });

    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/setup");
  });

  test("passes requested unclaimed slug into browser setup session", async () => {
    const app = createSetupBrokerApp();
    const redirect = await app.request("/setup?requested=anky", { redirect: "manual" });
    const location = redirect.headers.get("location");

    expect(redirect.status).toBe(302);
    expect(location).toStartWith("/setup/setup_");

    const response = await app.request(location!);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Requested Arch: anky.arches.lat");
    expect(html).toContain("host FID for anky.arches.lat");
  });

  test("renders browser setup page without admin FID input", async () => {
    const app = createSetupBrokerApp();
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    const response = await app.request(`/setup/${created.session.sessionId}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("<title>Arches Setup</title>");
    expect(html).toContain("Current step");
    expect(html).toContain("Verify Farcaster");
    expect(html).toContain("Manual admin FID input is not accepted");
    expect(html).not.toContain('name="adminFid"');
  });

  test("renders eligible channel choices in browser setup page", async () => {
    const app = createSetupBrokerApp({ allowDevStateUpdates: true });
    const createResponse = await app.request("/api/setup/sessions", { method: "POST" });
    const created = await createResponse.json();
    await app.request(`/api/setup/sessions/${created.session.sessionId}/dev-state`, {
      method: "PUT",
      body: JSON.stringify({
        hostFid: 18350,
        signerApproved: true,
        eligibleChannels: [{ slug: "anky", role: "lead" }],
      }),
      headers: { "content-type": "application/json" },
    });
    const response = await app.request(`/setup/${created.session.sessionId}`);
    const html = await response.text();

    expect(response.status).toBe(200);
    expect(html).toContain("Choose Community");
    expect(html).toContain("/anky");
    expect(html).toContain("lead");
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
