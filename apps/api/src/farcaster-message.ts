import {
  CastType,
  FarcasterNetwork,
  Message,
  NobleEd25519Signer,
  getFarcasterTime,
  makeCastAdd,
} from "@farcaster/core";
import { ed25519 } from "@noble/curves/ed25519";
import type {
  ArchPublishConfig,
  CastPublishRequest,
  FarcasterMessageBuilder,
  MessageBuildCapability,
  SignedFarcasterMessage,
} from "./hypersnap-lite";

export type FarcasterMessageBuilderEnv = Record<string, string | undefined>;

export type BuildSignedCastAddMessageInput = {
  fid: number | null;
  text: string;
  channelUrl?: string;
  signerPrivateKey?: string;
  signerPublicKey?: string;
  network?: string;
  timestamp?: number;
};

export class EnvFarcasterMessageBuilder implements FarcasterMessageBuilder {
  constructor(private readonly env: FarcasterMessageBuilderEnv) {}

  canBuildCastAdd(config: ArchPublishConfig): MessageBuildCapability {
    const validation = validateBuildInput({
      fid: config.adminFid,
      text: "probe",
      channelUrl: config.channelUrl,
      signerPrivateKey: this.env.ARCH_SIGNER_PRIVATE_KEY,
      network: this.env.FARCASTER_NETWORK,
    });
    if (!validation.ok) return validation.capability;

    const signerPublicKey = publicKeyForPrivateKey(this.env.ARCH_SIGNER_PRIVATE_KEY!);
    const expectedSignerPublicKey = normalizeHex(config.signerPublicKey);
    if (expectedSignerPublicKey && expectedSignerPublicKey !== signerPublicKey) {
      return {
        ok: false,
        reason: "invalid_signer_public_key",
        nextAction: "ARCH_SIGNER_PUBLIC_KEY does not match ARCH_SIGNER_PRIVATE_KEY.",
      };
    }

    return {
      ok: true,
      signerPublicKey,
      mode: "local-signed-protobuf",
    };
  }

  async buildCastAdd(
    config: ArchPublishConfig,
    cast: CastPublishRequest,
  ): Promise<SignedFarcasterMessage> {
    return buildSignedCastAddMessage({
      fid: config.adminFid,
      text: cast.text,
      channelUrl: config.channelUrl,
      signerPrivateKey: this.env.ARCH_SIGNER_PRIVATE_KEY,
      signerPublicKey: config.signerPublicKey,
      network: this.env.FARCASTER_NETWORK,
    });
  }
}

export async function buildSignedCastAddMessage(
  input: BuildSignedCastAddMessageInput,
): Promise<SignedFarcasterMessage> {
  const validation = validateBuildInput(input);
  if (!validation.ok) throw new Error(validation.capability.nextAction);

  const signerPrivateKey = hexToBytes(input.signerPrivateKey!);
  const signer = new NobleEd25519Signer(signerPrivateKey);
  const signerPublicKey = bytesToHex(unwrapHubResult(await signer.getSignerKey()));
  const expectedSignerPublicKey = normalizeHex(input.signerPublicKey);

  if (expectedSignerPublicKey && expectedSignerPublicKey !== signerPublicKey) {
    throw new Error("ARCH_SIGNER_PUBLIC_KEY does not match ARCH_SIGNER_PRIVATE_KEY.");
  }

  const timestamp = input.timestamp ?? unwrapHubResult(getFarcasterTime());
  const result = await makeCastAdd(
    {
      text: input.text.trim(),
      mentions: [],
      mentionsPositions: [],
      embeds: [],
      embedsDeprecated: [],
      parentUrl: input.channelUrl,
      parentCastId: undefined,
      type: CastType.CAST,
    },
    {
      fid: input.fid!,
      network: parseFarcasterNetwork(input.network),
      timestamp,
    },
    signer,
  );
  const message = unwrapHubResult(result);

  return {
    bytes: Message.encode(message).finish(),
    fid: input.fid!,
    signerPublicKey,
  };
}

function validateBuildInput(
  input: BuildSignedCastAddMessageInput,
):
  | { ok: true }
  | {
      ok: false;
      capability: Extract<MessageBuildCapability, { ok: false }>;
    } {
  if (!Number.isInteger(input.fid) || !input.fid || input.fid <= 0) {
    return missing("missing_admin_fid", "Complete Farcaster QR setup so Arches can derive the admin FID.");
  }

  if (!input.channelUrl?.trim()) {
    return missing("missing_channel", "Choose a Farcaster channel before publishing.");
  }

  if (!input.text.trim()) {
    return missing("invalid_cast", "Cast text is required.");
  }

  if (!input.signerPrivateKey?.trim()) {
    return missing(
      "missing_signer_private_key",
      "Provide ARCH_SIGNER_PRIVATE_KEY in the server-only API runtime env after signer approval.",
    );
  }

  if (!isPrivateKeyHex(input.signerPrivateKey)) {
    return missing(
      "invalid_signer_private_key",
      "ARCH_SIGNER_PRIVATE_KEY must be a 32-byte Ed25519 private key encoded as hex.",
    );
  }

  if (!canParseFarcasterNetwork(input.network)) {
    return missing("invalid_network", "FARCASTER_NETWORK must be mainnet, testnet, or devnet.");
  }

  return { ok: true };
}

function missing(
  reason: Extract<MessageBuildCapability, { ok: false }>["reason"],
  nextAction: string,
) {
  return {
    ok: false as const,
    capability: {
      ok: false as const,
      reason,
      nextAction,
    },
  };
}

function parseFarcasterNetwork(value: string | undefined): FarcasterNetwork {
  const normalized = value?.trim().toLowerCase() || "mainnet";
  if (normalized === "mainnet") return FarcasterNetwork.MAINNET;
  if (normalized === "testnet") return FarcasterNetwork.TESTNET;
  if (normalized === "devnet") return FarcasterNetwork.DEVNET;
  throw new Error("FARCASTER_NETWORK must be mainnet, testnet, or devnet.");
}

function canParseFarcasterNetwork(value: string | undefined) {
  return ["", "mainnet", "testnet", "devnet"].includes(value?.trim().toLowerCase() ?? "");
}

function isPrivateKeyHex(value: string) {
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value.trim());
}

function publicKeyForPrivateKey(value: string) {
  return bytesToHex(ed25519.getPublicKey(hexToBytes(value)));
}

function normalizeHex(value: string | undefined) {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  return trimmed.startsWith("0x") ? trimmed.toLowerCase() : `0x${trimmed.toLowerCase()}`;
}

function hexToBytes(value: string) {
  return new Uint8Array(Buffer.from(value.replace(/^0x/i, ""), "hex"));
}

function bytesToHex(bytes: Uint8Array) {
  return `0x${Buffer.from(bytes).toString("hex")}`;
}

function unwrapHubResult<T>(result: { isOk(): boolean; _unsafeUnwrap(): T; error?: unknown }): T {
  if (result.isOk()) return result._unsafeUnwrap();
  throw new Error(String(result.error ?? "Farcaster message construction failed."));
}
