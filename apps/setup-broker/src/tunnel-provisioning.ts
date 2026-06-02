export type TunnelProvisioningRequest = {
  slug: string;
  domain: string;
  adminFid: number;
  supportEmail?: string;
};

export type TunnelProvisioningResult = {
  tunnelId: string;
  domain: string;
  installCommand: string;
};

export type TunnelProvisioningProvider = {
  provisionArchTunnel(request: TunnelProvisioningRequest): Promise<TunnelProvisioningResult>;
};

export type TunnelProvisioningEnv = {
  ARCHES_TUNNEL_PROVIDER?: string;
  CLOUDFLARE_ACCOUNT_ID?: string;
  CLOUDFLARE_ZONE_ID?: string;
  CLOUDFLARE_API_TOKEN?: string;
};

type FetchLike = typeof fetch;

type CloudflareApiResponse<T> = {
  success: boolean;
  result: T;
  errors?: unknown[];
};

type CloudflareTunnel = {
  id: string;
};

type CloudflareDnsRecord = {
  id: string;
};

export class TunnelProvisioningError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "TunnelProvisioningError";
  }
}

export class NoopTunnelProvisioningProvider implements TunnelProvisioningProvider {
  async provisionArchTunnel(): Promise<TunnelProvisioningResult> {
    throw new TunnelProvisioningError(
      "Tunnel provisioning is not configured. Set ARCHES_TUNNEL_PROVIDER=cloudflare for the setup broker.",
      501,
    );
  }
}

export class CloudflareTunnelProvisioningProvider implements TunnelProvisioningProvider {
  constructor(
    private readonly config: {
      accountId: string;
      zoneId: string;
      apiToken: string;
      apiBase?: string;
      fetchImpl?: FetchLike;
    },
  ) {}

  async provisionArchTunnel(
    request: TunnelProvisioningRequest,
  ): Promise<TunnelProvisioningResult> {
    validateTunnelProvisioningRequest(request);

    const tunnelName = `arches-${request.slug}`;
    const tunnel = await this.cloudflareApi<CloudflareTunnel>(
      "POST",
      `/accounts/${this.config.accountId}/cfd_tunnel`,
      { name: tunnelName, config_src: "cloudflare" },
    );

    await this.cloudflareApi(
      "PUT",
      `/accounts/${this.config.accountId}/cfd_tunnel/${tunnel.id}/configurations`,
      {
        config: {
          ingress: [
            {
              hostname: request.domain,
              path: "/api/*",
              service: "http://arches-api:3000",
            },
            {
              hostname: request.domain,
              path: "/health",
              service: "http://arches-api:3000",
            },
            {
              hostname: request.domain,
              service: "http://arches-web:3000",
            },
            {
              service: "http_status:404",
            },
          ],
        },
      },
    );

    const dnsRecords = await this.cloudflareApi<CloudflareDnsRecord[]>(
      "GET",
      `/zones/${this.config.zoneId}/dns_records?type=CNAME&name=${encodeURIComponent(
        request.domain,
      )}`,
    );
    const dnsBody = {
      type: "CNAME",
      name: request.domain,
      content: `${tunnel.id}.cfargotunnel.com`,
      proxied: true,
    };

    if (dnsRecords[0]?.id) {
      await this.cloudflareApi(
        "PATCH",
        `/zones/${this.config.zoneId}/dns_records/${dnsRecords[0].id}`,
        dnsBody,
      );
    } else {
      await this.cloudflareApi("POST", `/zones/${this.config.zoneId}/dns_records`, dnsBody);
    }

    const tunnelToken = await this.cloudflareApi<string>(
      "GET",
      `/accounts/${this.config.accountId}/cfd_tunnel/${tunnel.id}/token`,
    );

    return {
      tunnelId: tunnel.id,
      domain: request.domain,
      installCommand: buildTunnelLocalInstallCommand(request, tunnelToken),
    };
  }

  private async cloudflareApi<T>(method: string, path: string, body?: unknown): Promise<T> {
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(
      `${this.config.apiBase ?? "https://api.cloudflare.com/client/v4"}${path}`,
      {
        method,
        headers: {
          Authorization: `Bearer ${this.config.apiToken}`,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      },
    );

    const payload = (await response.json().catch(() => null)) as CloudflareApiResponse<T> | null;
    if (!response.ok || !payload?.success) {
      throw new TunnelProvisioningError("Cloudflare tunnel provisioning API call failed.", 502);
    }

    return payload.result;
  }
}

export function createTunnelProvisioningProvider(
  env: TunnelProvisioningEnv,
): TunnelProvisioningProvider {
  if (env.ARCHES_TUNNEL_PROVIDER !== "cloudflare") {
    return new NoopTunnelProvisioningProvider();
  }

  const missing = [
    ["CLOUDFLARE_ACCOUNT_ID", env.CLOUDFLARE_ACCOUNT_ID],
    ["CLOUDFLARE_ZONE_ID", env.CLOUDFLARE_ZONE_ID],
    ["CLOUDFLARE_API_TOKEN", env.CLOUDFLARE_API_TOKEN],
  ]
    .filter(([, value]) => !value)
    .map(([name]) => name);

  if (missing.length > 0) {
    throw new TunnelProvisioningError(
      `Missing Cloudflare tunnel provisioning env: ${missing.join(", ")}`,
      500,
    );
  }

  return new CloudflareTunnelProvisioningProvider({
    accountId: env.CLOUDFLARE_ACCOUNT_ID!,
    zoneId: env.CLOUDFLARE_ZONE_ID!,
    apiToken: env.CLOUDFLARE_API_TOKEN!,
  });
}

export function buildTunnelLocalInstallCommand(
  request: TunnelProvisioningRequest,
  tunnelToken: string,
): string {
  const supportEmail = request.supportEmail ?? "support@arches.lat";

  return [
    "curl -fsSL https://install.arches.lat | bash -s -- \\",
    `  --arch ${request.slug} \\`,
    "  --mode tunnel-local \\",
    `  --domain ${request.domain} \\`,
    `  --admin-fid ${request.adminFid} \\`,
    `  --email ${supportEmail} \\`,
    `  --tunnel-token '${tunnelToken}'`,
  ].join("\n");
}

function validateTunnelProvisioningRequest(request: TunnelProvisioningRequest) {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(request.slug)) {
    throw new TunnelProvisioningError("Arch slug must be lowercase URL-safe text.", 400);
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.arches\.lat$/.test(request.domain)) {
    throw new TunnelProvisioningError("Arch domain must be a default *.arches.lat hostname.", 400);
  }

  if (request.domain !== `${request.slug}.arches.lat`) {
    throw new TunnelProvisioningError("Arch domain must match the reserved Arch slug.", 400);
  }

  if (!Number.isInteger(request.adminFid) || request.adminFid <= 0) {
    throw new TunnelProvisioningError("Admin FID must be a positive integer.", 400);
  }

  if (request.supportEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(request.supportEmail)) {
    throw new TunnelProvisioningError("Support email must look like an email address.", 400);
  }
}
