import { describe, expect, test } from "bun:test";
import { createInMemorySetupBrokerStore } from "./setup-store";

describe("setup broker store", () => {
  test("stores sessions, reservations, and signer request tokens behind one boundary", () => {
    const store = createInMemorySetupBrokerStore<{ state: { sessionId: string } }>();

    store.sessions.set("setup_1", { state: { sessionId: "setup_1" } });
    store.slugReservations.set("anky", "setup_1");
    store.signerRequestTokens.set("setup_1", "signer_request_token");

    expect(store.sessions.size).toBe(1);
    expect(store.sessions.get("setup_1")?.state.sessionId).toBe("setup_1");
    expect(store.slugReservations.get("anky")).toBe("setup_1");
    expect(store.signerRequestTokens.get("setup_1")).toBe("signer_request_token");

    store.clear();

    expect(store.sessions.size).toBe(0);
    expect(store.slugReservations.size).toBe(0);
    expect(store.signerRequestTokens.size).toBe(0);
  });

  test("supports deleting individual records without clearing the store", () => {
    const store = createInMemorySetupBrokerStore<{ state: { sessionId: string } }>();

    store.sessions.set("setup_1", { state: { sessionId: "setup_1" } });
    store.sessions.set("setup_2", { state: { sessionId: "setup_2" } });

    store.sessions.delete("setup_1");

    expect(store.sessions.get("setup_1")).toBeUndefined();
    expect(store.sessions.get("setup_2")?.state.sessionId).toBe("setup_2");
    expect(store.sessions.size).toBe(1);
  });
});
