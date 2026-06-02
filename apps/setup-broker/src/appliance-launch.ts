import type { HostingMode } from "../../../packages/setup-schema/src/index";

export type ApplianceLaunchRequest = {
  sessionId: string;
  slug: string;
  domain: string;
  hostingMode: HostingMode;
};

export type ApplianceLaunchResult = {
  launched: true;
  checkedUrl: string;
};

export type ApplianceLaunchProvider = {
  verifyApplianceLaunch(request: ApplianceLaunchRequest): Promise<ApplianceLaunchResult>;
};

export type ApplianceLaunchEnv = {
  ARCHES_APPLIANCE_LAUNCH_PROVIDER?: string;
};

type FetchLike = typeof fetch;

export class ApplianceLaunchError extends Error {
  constructor(
    message: string,
    readonly status = 500,
  ) {
    super(message);
    this.name = "ApplianceLaunchError";
  }
}

export class NoopApplianceLaunchProvider implements ApplianceLaunchProvider {
  async verifyApplianceLaunch(): Promise<ApplianceLaunchResult> {
    throw new ApplianceLaunchError(
      "Appliance launch verification is not configured. Set ARCHES_APPLIANCE_LAUNCH_PROVIDER=http-health for the setup broker.",
      501,
    );
  }
}

export class HttpHealthApplianceLaunchProvider implements ApplianceLaunchProvider {
  constructor(
    private readonly config: {
      fetchImpl?: FetchLike;
    } = {},
  ) {}

  async verifyApplianceLaunch(
    request: ApplianceLaunchRequest,
  ): Promise<ApplianceLaunchResult> {
    validateApplianceLaunchRequest(request);

    const checkedUrl = `https://${request.domain}/health`;
    const fetchImpl = this.config.fetchImpl ?? fetch;
    const response = await fetchImpl(checkedUrl);

    if (!response.ok) {
      throw new ApplianceLaunchError("Appliance health check failed.", 502);
    }

    const payload = await response.json().catch(() => null);
    if (!isObject(payload) || payload.ok !== true) {
      throw new ApplianceLaunchError(
        "Appliance health check did not return an ok response.",
        502,
      );
    }

    return { launched: true, checkedUrl };
  }
}

export function createApplianceLaunchProvider(
  env: ApplianceLaunchEnv,
): ApplianceLaunchProvider {
  if (env.ARCHES_APPLIANCE_LAUNCH_PROVIDER !== "http-health") {
    return new NoopApplianceLaunchProvider();
  }

  return new HttpHealthApplianceLaunchProvider();
}

function validateApplianceLaunchRequest(request: ApplianceLaunchRequest) {
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(request.slug)) {
    throw new ApplianceLaunchError("Arch slug must be lowercase URL-safe text.", 400);
  }

  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?\.arches\.lat$/.test(request.domain)) {
    throw new ApplianceLaunchError("Arch domain must be a valid arches.lat hostname.", 400);
  }

  if (request.domain !== `${request.slug}.arches.lat`) {
    throw new ApplianceLaunchError("Arch slug and domain must match.", 400);
  }

  if (request.hostingMode !== "tunnel-local" && request.hostingMode !== "vps") {
    throw new ApplianceLaunchError(
      "Appliance launch verification requires a public hosting mode.",
      409,
    );
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
