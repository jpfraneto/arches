import { describe, expect, test } from "bun:test";
import {
  CloudflareTunnelProvisioningProvider,
  NoopTunnelProvisioningProvider,
  TunnelProvisioningError,
  buildTunnelLocalInstallCommand,
  createTunnelProvisioningProvider,
} from "./tunnel-provisioning";

describe("tunnel provisioning providers", () => {
  test("uses a no-op provider unless Cloudflare is selected", async () => {
    const provider = createTunnelProvisioningProvider({});

    expect(provider).toBeInstanceOf(NoopTunnelProvisioningProvider);
    await expect(
      provider.provisionArchTunnel({
        slug: "anky",
        domain: "anky.arches.lat",
        adminFid: 18350,
      }),
    ).rejects.toThrow("Tunnel provisioning is not configured");
  });

  test("requires Cloudflare env when Cloudflare provider is selected", () => {
    expect(() => createTunnelProvisioningProvider({ ARCHES_TUNNEL_PROVIDER: "cloudflare" })).toThrow(
      "Missing Cloudflare tunnel provisioning env",
    );
  });

  test("builds the tunnel-local installer command with the tunnel token", () => {
    expect(
      buildTunnelLocalInstallCommand(
        {
          slug: "anky",
          domain: "anky.arches.lat",
          adminFid: 18350,
          supportEmail: "support@example.com",
        },
        "fake-token",
      ),
    ).toBe(`curl -fsSL https://install.arches.lat | bash -s -- \\
  --arch anky \\
  --mode tunnel-local \\
  --domain anky.arches.lat \\
  --admin-fid 18350 \\
  --email support@example.com \\
  --tunnel-token 'fake-token'`);
  });

  test("creates tunnel, configures ingress, creates DNS, and fetches token", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new CloudflareTunnelProvisioningProvider({
      accountId: "account_123",
      zoneId: "zone_123",
      apiToken: "test-token",
      apiBase: "https://cloudflare.test/client/v4",
      fetchImpl: fakeCloudflareFetch(calls, [
        { id: "tunnel_123" },
        {},
        [],
        { id: "dns_123" },
        "fake-tunnel-token",
      ]),
    });

    const result = await provider.provisionArchTunnel({
      slug: "anky",
      domain: "anky.arches.lat",
      adminFid: 18350,
      supportEmail: "support@example.com",
    });

    expect(result.tunnelId).toBe("tunnel_123");
    expect(result.domain).toBe("anky.arches.lat");
    expect(result.installCommand).toContain("--mode tunnel-local");
    expect(result.installCommand).toContain("--tunnel-token 'fake-tunnel-token'");

    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toEqual([
      "POST https://cloudflare.test/client/v4/accounts/account_123/cfd_tunnel",
      "PUT https://cloudflare.test/client/v4/accounts/account_123/cfd_tunnel/tunnel_123/configurations",
      "GET https://cloudflare.test/client/v4/zones/zone_123/dns_records?type=CNAME&name=anky.arches.lat",
      "POST https://cloudflare.test/client/v4/zones/zone_123/dns_records",
      "GET https://cloudflare.test/client/v4/accounts/account_123/cfd_tunnel/tunnel_123/token",
    ]);

    expect(JSON.parse(String(calls[0].init.body))).toEqual({
      name: "arches-anky",
      config_src: "cloudflare",
    });
    expect(JSON.parse(String(calls[1].init.body))).toEqual({
      config: {
        ingress: [
          {
            hostname: "anky.arches.lat",
            path: "/api/*",
            service: "http://arches-api:3000",
          },
          {
            hostname: "anky.arches.lat",
            path: "/health",
            service: "http://arches-api:3000",
          },
          {
            hostname: "anky.arches.lat",
            service: "http://arches-web:3000",
          },
          {
            service: "http_status:404",
          },
        ],
      },
    });
    expect(JSON.parse(String(calls[3].init.body))).toEqual({
      type: "CNAME",
      name: "anky.arches.lat",
      content: "tunnel_123.cfargotunnel.com",
      proxied: true,
    });
  });

  test("updates an existing DNS record when one already exists", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new CloudflareTunnelProvisioningProvider({
      accountId: "account_123",
      zoneId: "zone_123",
      apiToken: "test-token",
      apiBase: "https://cloudflare.test/client/v4",
      fetchImpl: fakeCloudflareFetch(calls, [
        { id: "tunnel_123" },
        {},
        [{ id: "dns_existing" }],
        { id: "dns_existing" },
        "fake-tunnel-token",
      ]),
    });

    await provider.provisionArchTunnel({
      slug: "anky",
      domain: "anky.arches.lat",
      adminFid: 18350,
    });

    expect(calls.map((call) => `${call.init.method} ${call.url}`)).toContain(
      "PATCH https://cloudflare.test/client/v4/zones/zone_123/dns_records/dns_existing",
    );
  });

  test("rejects invalid requests before calling Cloudflare", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new CloudflareTunnelProvisioningProvider({
      accountId: "account_123",
      zoneId: "zone_123",
      apiToken: "test-token",
      apiBase: "https://cloudflare.test/client/v4",
      fetchImpl: fakeCloudflareFetch(calls, []),
    });

    await expect(
      provider.provisionArchTunnel({
        slug: "Anky",
        domain: "anky.arches.lat",
        adminFid: 18350,
      }),
    ).rejects.toThrow(TunnelProvisioningError);
    expect(calls).toEqual([]);
  });

  test("rejects slug and domain mismatches before calling Cloudflare", async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const provider = new CloudflareTunnelProvisioningProvider({
      accountId: "account_123",
      zoneId: "zone_123",
      apiToken: "test-token",
      apiBase: "https://cloudflare.test/client/v4",
      fetchImpl: fakeCloudflareFetch(calls, []),
    });

    await expect(
      provider.provisionArchTunnel({
        slug: "anky",
        domain: "builders.arches.lat",
        adminFid: 18350,
      }),
    ).rejects.toThrow("Arch domain must match the reserved Arch slug");
    expect(calls).toEqual([]);
  });
});

function fakeCloudflareFetch(
  calls: Array<{ url: string; init: RequestInit }>,
  results: unknown[],
): typeof fetch {
  return (async (url: URL | RequestInfo, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const result = results.shift();

    return new Response(
      JSON.stringify({
        success: true,
        result,
      }),
      {
        status: 200,
        headers: { "content-type": "application/json" },
      },
    );
  }) as typeof fetch;
}
