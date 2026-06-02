import { createSetupBrokerApp } from "./app";

const port = Number(Bun.env.PORT ?? 3020);
const publicOrigin = Bun.env.ARCHES_SETUP_PUBLIC_ORIGIN ?? `http://localhost:${port}`;
const allowDevStateUpdates = Bun.env.ARCHES_SETUP_BROKER_DEV === "1";

Bun.serve({
  port,
  fetch: createSetupBrokerApp({ publicOrigin, allowDevStateUpdates }).fetch,
});

console.log(`arches-setup-broker listening on http://localhost:${port}`);
