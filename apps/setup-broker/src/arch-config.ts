import {
  DEFAULT_GRAMMAR_PRESET,
  DEFAULT_SURFACE_PRESET,
  DEFAULT_THEME_PRESET,
  type GrammarPreset,
  type HostingMode,
  type SetupState,
  type SurfacePreset,
  type ThemePreset,
} from "../../../packages/setup-schema/src/index";

export type ArchConfigSnapshot = {
  version: 1;
  sessionId: string;
  arch: {
    slug: string;
    domain: string;
    title: string;
    provenanceLabel: string;
    surfacePreset: SurfacePreset;
    grammarPreset: GrammarPreset;
    themePreset: ThemePreset;
    hostFid: number;
    signerPublicKey?: string;
    supportEmail: string;
  };
  hosting: {
    mode: HostingMode;
    tunnelId?: string;
    tunnelProvisioned: boolean;
  };
  publishing: {
    farcasterEnabled: false;
    status: "not_implemented";
  };
  env: Record<string, string>;
};

export type ArchConfigResult =
  | {
      ok: true;
      config: ArchConfigSnapshot;
    }
  | {
      ok: false;
      status: 409;
      error: string;
      message: string;
    };

const DEFAULT_SUPPORT_EMAIL = "support@arches.lat";

export function buildArchConfigSnapshot(state: SetupState): ArchConfigResult {
  if (!state.hostFid) {
    return notReady(
      "farcaster verification required",
      "Arch config can only be exported after the setup broker derives a host FID from Farcaster verification.",
    );
  }

  if (!state.signerApproved) {
    return notReady(
      "signer approval required",
      "Arch config can only be exported after the host approves an Arch signer.",
    );
  }

  if (!state.selectedChannelSlug || !state.reservedSlug || !state.domain) {
    return notReady(
      "arch hostname required",
      "Arch config can only be exported after an eligible channel slug and default hostname are reserved.",
    );
  }

  if (state.selectedChannelSlug !== state.reservedSlug) {
    return notReady(
      "selected channel mismatch",
      "The reserved hostname must match the selected eligible Farcaster channel.",
    );
  }

  if (!state.hostingMode) {
    return notReady(
      "hosting mode required",
      "Arch config can only be exported after a hosting mode is selected.",
    );
  }

  if (state.hostingMode === "tunnel-local" && !state.tunnelProvisioned) {
    return notReady(
      "tunnel provisioning required",
      "Tunnel-local config can only be exported after the broker provisions the Cloudflare Tunnel route.",
    );
  }

  if (!state.surfaceConfigured || !state.surfaceTitle || !state.provenanceLabel) {
    return notReady(
      "surface configuration required",
      "Arch config can only be exported after the first visible surface defaults are configured.",
    );
  }

  const supportEmail = DEFAULT_SUPPORT_EMAIL;
  const surfacePreset = state.surfacePreset ?? DEFAULT_SURFACE_PRESET;
  const grammarPreset = state.grammarPreset ?? DEFAULT_GRAMMAR_PRESET;
  const themePreset = state.themePreset ?? DEFAULT_THEME_PRESET;
  const env: Record<string, string> = {
    ARCH_SLUG: state.reservedSlug,
    ARCH_DOMAIN: state.domain,
    ARCHES_MODE: state.hostingMode,
    ARCH_ADMIN_FID: String(state.hostFid),
    ARCH_SUPPORT_EMAIL: supportEmail,
    ARCH_SURFACE_PRESET: surfacePreset,
    ARCH_GRAMMAR_PRESET: grammarPreset,
    ARCH_THEME_PRESET: themePreset,
    ARCH_SURFACE_TITLE: state.surfaceTitle,
    ARCH_PROVENANCE_LABEL: state.provenanceLabel,
    ARCHES_PUBLISHING_ENABLED: "false",
    ARCHES_FARCASTER_PUBLISHING_STATUS: "not_implemented",
  };

  if (state.signerPublicKey) env.ARCH_SIGNER_PUBLIC_KEY = state.signerPublicKey;
  if (state.tunnelId) env.CLOUDFLARE_TUNNEL_ID = state.tunnelId;

  return {
    ok: true,
    config: {
      version: 1,
      sessionId: state.sessionId,
      arch: {
        slug: state.reservedSlug,
        domain: state.domain,
        title: state.surfaceTitle,
        provenanceLabel: state.provenanceLabel,
        surfacePreset,
        grammarPreset,
        themePreset,
        hostFid: state.hostFid,
        signerPublicKey: state.signerPublicKey,
        supportEmail,
      },
      hosting: {
        mode: state.hostingMode,
        tunnelId: state.tunnelId,
        tunnelProvisioned: Boolean(state.tunnelProvisioned),
      },
      publishing: {
        farcasterEnabled: false,
        status: "not_implemented",
      },
      env,
    },
  };
}

export function renderEnvSnapshot(env: Record<string, string>): string {
  return Object.entries(env)
    .map(([key, value]) => `${key}=${renderEnvValue(value)}`)
    .join("\n");
}

function notReady(error: string, message: string): ArchConfigResult {
  return {
    ok: false,
    status: 409,
    error,
    message,
  };
}

function renderEnvValue(value: string): string {
  return value.replaceAll("\r", " ").replaceAll("\n", " ").trim();
}
