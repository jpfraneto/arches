import type { EligibleChannel } from "../../../packages/setup-schema/src/index";

export type ChannelEligibilityProvider = {
  listEligibleChannels(fid: number): Promise<EligibleChannel[]>;
};

export type ChannelProviderEnv = {
  ARCHES_CHANNEL_PROVIDER?: string;
  NEYNAR_API_KEY?: string;
};

type NeynarChannel = {
  id?: unknown;
  name?: unknown;
  lead?: {
    fid?: unknown;
  };
  moderator_fids?: unknown;
};

type NeynarChannelsResponse = {
  channels?: NeynarChannel[];
  next?: {
    cursor?: string;
  };
};

const NEYNAR_CHANNEL_LIST_URL = "https://api.neynar.com/v2/farcaster/channel/list/";
const NEYNAR_PAGE_LIMIT = 200;
const NEYNAR_MAX_PAGES = 25;

export class NoopChannelEligibilityProvider implements ChannelEligibilityProvider {
  async listEligibleChannels(): Promise<EligibleChannel[]> {
    return [];
  }
}

export class StaticChannelEligibilityProvider implements ChannelEligibilityProvider {
  constructor(private channels: EligibleChannel[]) {}

  async listEligibleChannels(): Promise<EligibleChannel[]> {
    return this.channels;
  }
}

export class NeynarChannelEligibilityProvider implements ChannelEligibilityProvider {
  constructor(
    private apiKey: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  async listEligibleChannels(fid: number): Promise<EligibleChannel[]> {
    const eligible = new Map<string, EligibleChannel>();
    let cursor: string | undefined;

    for (let page = 0; page < NEYNAR_MAX_PAGES; page += 1) {
      const url = new URL(NEYNAR_CHANNEL_LIST_URL);
      url.searchParams.set("limit", String(NEYNAR_PAGE_LIMIT));
      if (cursor) url.searchParams.set("cursor", cursor);

      const response = await this.fetchImpl(url, {
        headers: {
          "x-api-key": this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Neynar channel lookup failed with HTTP ${response.status}`);
      }

      const body = (await response.json()) as NeynarChannelsResponse;
      for (const channel of body.channels ?? []) {
        const eligibleChannel = channelEligibilityForFid(channel, fid);
        if (eligibleChannel) eligible.set(eligibleChannel.slug, eligibleChannel);
      }

      cursor = body.next?.cursor;
      if (!cursor) break;
    }

    return [...eligible.values()].sort((a, b) => a.slug.localeCompare(b.slug));
  }
}

export function createChannelEligibilityProvider(
  env: ChannelProviderEnv,
): ChannelEligibilityProvider {
  if (env.ARCHES_CHANNEL_PROVIDER === "neynar") {
    if (!env.NEYNAR_API_KEY) {
      throw new Error("NEYNAR_API_KEY is required when ARCHES_CHANNEL_PROVIDER=neynar");
    }

    return new NeynarChannelEligibilityProvider(env.NEYNAR_API_KEY);
  }

  return new NoopChannelEligibilityProvider();
}

function channelEligibilityForFid(channel: NeynarChannel, fid: number): EligibleChannel | null {
  const slug = parseSlug(channel.id);
  if (!slug) return null;

  if (channel.lead?.fid === fid) {
    return {
      slug,
      role: "lead",
      name: parseName(channel.name),
    };
  }

  if (Array.isArray(channel.moderator_fids) && channel.moderator_fids.includes(fid)) {
    return {
      slug,
      role: "moderator",
      name: parseName(channel.name),
    };
  }

  return null;
}

function parseSlug(value: unknown): string | null {
  if (typeof value !== "string") return null;

  const slug = value.trim().toLowerCase();
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(slug) ? slug : null;
}

function parseName(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}
