import { createSetupBrokerApp } from "./app";
import { createChannelEligibilityProvider } from "./channel-eligibility";

const port = Number(Bun.env.PORT ?? 3020);
const publicOrigin = Bun.env.ARCHES_SETUP_PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const allowDevStateUpdates = Bun.env.ARCHES_SETUP_BROKER_DEV === "1";
const channelEligibilityProvider = createChannelEligibilityProvider({
  ARCHES_CHANNEL_PROVIDER: Bun.env.ARCHES_CHANNEL_PROVIDER,
  NEYNAR_API_KEY: Bun.env.NEYNAR_API_KEY,
});

Bun.serve({
  port,
  fetch: createSetupBrokerApp({ publicOrigin, allowDevStateUpdates, channelEligibilityProvider })
    .fetch,
});

console.log(`arches-setup-broker listening on http://localhost:${port}`);
