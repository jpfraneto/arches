import {
  createSetupBrokerApp,
  sanitizeSetupSessionRecordForPersistence,
  type SetupSessionRecord,
} from "./app";
import { createApplianceLaunchProvider } from "./appliance-launch";
import { createChannelEligibilityProvider } from "./channel-eligibility";
import { createFarcasterVerificationProvider } from "./farcaster-verification";
import { createPublishingVerificationProvider } from "./publishing-verification";
import { createJsonFileSetupBrokerStore } from "./setup-store";
import { createTunnelProvisioningProvider } from "./tunnel-provisioning";

const port = Number(Bun.env.PORT ?? 3020);
const publicOrigin = Bun.env.ARCHES_SETUP_PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const allowDevStateUpdates = Bun.env.ARCHES_SETUP_BROKER_DEV === "1";
const channelEligibilityProvider = createChannelEligibilityProvider({
  ARCHES_CHANNEL_PROVIDER: Bun.env.ARCHES_CHANNEL_PROVIDER,
  NEYNAR_API_KEY: Bun.env.NEYNAR_API_KEY,
});
const tunnelProvisioningProvider = createTunnelProvisioningProvider({
  ARCHES_TUNNEL_PROVIDER: Bun.env.ARCHES_TUNNEL_PROVIDER,
  CLOUDFLARE_ACCOUNT_ID: Bun.env.CLOUDFLARE_ACCOUNT_ID,
  CLOUDFLARE_ZONE_ID: Bun.env.CLOUDFLARE_ZONE_ID,
  CLOUDFLARE_API_TOKEN: Bun.env.CLOUDFLARE_API_TOKEN,
});
const farcasterVerificationProvider = createFarcasterVerificationProvider({
  ARCHES_FARCASTER_VERIFIER: Bun.env.ARCHES_FARCASTER_VERIFIER,
  FARCASTER_AUTH_RELAY_URL: Bun.env.FARCASTER_AUTH_RELAY_URL,
  FARCASTER_ETH_RPC_URL: Bun.env.FARCASTER_ETH_RPC_URL,
  FARCASTER_ACCEPT_AUTH_ADDRESS: Bun.env.FARCASTER_ACCEPT_AUTH_ADDRESS,
});
const applianceLaunchProvider = createApplianceLaunchProvider({
  ARCHES_APPLIANCE_LAUNCH_PROVIDER: Bun.env.ARCHES_APPLIANCE_LAUNCH_PROVIDER,
});
const publishingVerificationProvider = createPublishingVerificationProvider({
  ARCHES_PUBLISHING_VERIFICATION_PROVIDER: Bun.env.ARCHES_PUBLISHING_VERIFICATION_PROVIDER,
});
const setupStore = Bun.env.ARCHES_SETUP_STORE_FILE
  ? createJsonFileSetupBrokerStore<SetupSessionRecord>({
      filePath: Bun.env.ARCHES_SETUP_STORE_FILE,
      sanitizeSession: sanitizeSetupSessionRecordForPersistence,
    })
  : undefined;

Bun.serve({
  port,
  fetch: createSetupBrokerApp({
    publicOrigin,
    allowDevStateUpdates,
    channelEligibilityProvider,
    tunnelProvisioningProvider,
    farcasterVerificationProvider,
    applianceLaunchProvider,
    publishingVerificationProvider,
    setupStore,
  }).fetch,
});

console.log(`arches-setup-broker listening on http://localhost:${port}`);
