import { describe, expect, test } from "bun:test";
import api from "./index";

describe("arches api", () => {
  test("rejects local-only casts while publishing is not wired", async () => {
    const response = await api.fetch(new Request("http://localhost/api/casts", { method: "POST" }));
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body.message).toContain("Local-only casts are rejected");
  });

  test("publishing probe fails closed until Hypersnap Lite is wired", async () => {
    const response = await api.fetch(
      new Request("http://localhost/api/publishing/probe", { method: "POST" }),
    );
    const body = await response.json();

    expect(response.status).toBe(501);
    expect(body).toEqual({
      ok: false,
      protocol: "farcaster",
      status: "not_implemented",
      error: "Hypersnap Lite publishing probe is not implemented yet",
      message:
        "The setup broker must not unlock posting until this endpoint returns confirmed Farcaster proof from Hypersnap Lite.",
    });
  });
});
