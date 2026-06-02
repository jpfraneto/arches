import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import {
  createJsonFileSetupBrokerStore,
  createInMemorySetupBrokerStore,
  snapshotSetupBrokerStore,
} from "./setup-store";

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

  test("snapshots sessions and reservations without signer request tokens", () => {
    const store = createInMemorySetupBrokerStore<{
      state: { sessionId: string; deliveryField?: string };
    }>();

    store.sessions.set("setup_1", {
      state: { sessionId: "setup_1", deliveryField: "remove-me" },
    });
    store.slugReservations.set("anky", "setup_1");
    store.signerRequestTokens.set("setup_1", "signer_request_token");

    const snapshot = snapshotSetupBrokerStore(store, {
      now: () => new Date("2026-06-02T12:00:00.000Z"),
      sanitizeSession(record) {
        return {
          state: {
            sessionId: record.state.sessionId,
          },
        };
      },
    });

    expect(snapshot).toEqual({
      schemaVersion: 1,
      generatedAt: "2026-06-02T12:00:00.000Z",
      sessions: {
        setup_1: { state: { sessionId: "setup_1" } },
      },
      slugReservations: {
        anky: "setup_1",
      },
    });
    expect(JSON.stringify(snapshot)).not.toContain("signer_request_token");
    expect(JSON.stringify(snapshot)).not.toContain("remove-me");
  });

  test("persists sanitized sessions and reservations to a JSON file", () => {
    const filePath = `${tmpdir()}/arches-setup-store-${crypto.randomUUID()}.json`;
    type Record = {
      state: {
        sessionId: string;
        deliveryField?: string;
      };
    };
    const store = createJsonFileSetupBrokerStore<Record>({
      filePath,
      now: () => new Date("2026-06-02T12:00:00.000Z"),
      sanitizeSession(record) {
        return {
          state: {
            sessionId: record.state.sessionId,
          },
        };
      },
    });

    store.sessions.set("setup_1", {
      state: { sessionId: "setup_1", deliveryField: "remove-me" },
    });
    store.slugReservations.set("anky", "setup_1");
    store.signerRequestTokens.set("setup_1", "signer_request_token");

    const reloadedStore = createJsonFileSetupBrokerStore<Record>({
      filePath,
      sanitizeSession(record) {
        return record;
      },
    });
    const persisted = JSON.parse(readFileSync(filePath, "utf8"));

    expect(reloadedStore.sessions.get("setup_1")).toEqual({
      state: { sessionId: "setup_1" },
    });
    expect(reloadedStore.slugReservations.get("anky")).toBe("setup_1");
    expect(reloadedStore.signerRequestTokens.get("setup_1")).toBeUndefined();
    expect(persisted.generatedAt).toBe("2026-06-02T12:00:00.000Z");
    expect(JSON.stringify(persisted)).not.toContain("remove-me");
    expect(JSON.stringify(persisted)).not.toContain("signer_request_token");

    reloadedStore.clear();
    expect(JSON.parse(readFileSync(filePath, "utf8")).sessions).toEqual({});
  });
});
