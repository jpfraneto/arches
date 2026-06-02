export type SetupStepId =
  | "verify-farcaster"
  | "prepare-signer"
  | "choose-community"
  | "name-surface"
  | "choose-hosting"
  | "configure-surface"
  | "launch-appliance"
  | "verify-publishing"
  | "unlock-arch";

export type SetupFieldType = "text" | "radio" | "dropdown" | "qr" | "status" | "copy";
export type ChannelRole = "lead" | "moderator";
export type HostingMode = "tunnel-local" | "local" | "vps";
export type StepStatus = "pending" | "active" | "completed" | "blocked";

export type SetupChoice = {
  id: string;
  label: string;
  description?: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
};

export type SetupField = {
  id: string;
  type: SetupFieldType;
  label: string;
  required?: boolean;
  value?: string;
  placeholder?: string;
  description?: string;
  choices?: SetupChoice[];
};

export type SetupStep = {
  id: SetupStepId;
  title: string;
  description: string;
  status: StepStatus;
  fields: SetupField[];
};

export type EligibleChannel = {
  slug: string;
  role: ChannelRole;
  name?: string;
};

export type SetupState = {
  sessionId: string;
  requestedSlug?: string;
  farcasterQrUrl?: string;
  hostFid?: number;
  signerApproved?: boolean;
  eligibleChannels?: EligibleChannel[];
  selectedChannelSlug?: string;
  reservedSlug?: string;
  domain?: string;
  hostingMode?: HostingMode;
  surfaceTitle?: string;
  provenanceLabel?: string;
  surfaceConfigured?: boolean;
  applianceLaunched?: boolean;
  installCommand?: string;
  publishingVerified?: boolean;
  composerUnlocked?: boolean;
};

export type SetupSession = {
  sessionId: string;
  requestedSlug?: string;
  start: SetupStepId;
  currentStepId: SetupStepId;
  completed: boolean;
  steps: SetupStep[];
};

export type FieldValues = Record<string, string | undefined>;

export type ValidationError = {
  fieldId: string;
  message: string;
};

export type TerminalRenderOptions = {
  includePendingSteps?: boolean;
};

const HOSTING_CHOICES: SetupChoice[] = [
  {
    id: "tunnel-local",
    label: "Cloudflare Tunnel",
    description: "Recommended default for a non-technical host running an appliance locally.",
  },
  {
    id: "local",
    label: "Local only",
    description: "For development and private testing. It does not create a public Arch.",
  },
  {
    id: "vps",
    label: "VPS",
    description: "For an always-on server with direct domain routing.",
  },
];

export function buildSetupSession(state: SetupState): SetupSession {
  const start: SetupStepId = "verify-farcaster";
  const steps: SetupStep[] = [
    verifyFarcasterStep(state),
    prepareSignerStep(state),
    chooseCommunityStep(state),
    nameSurfaceStep(state),
    chooseHostingStep(state),
    configureSurfaceStep(state),
    launchApplianceStep(state),
    verifyPublishingStep(state),
    unlockArchStep(state),
  ];

  const currentStepId = steps.find((step) => step.status !== "completed")?.id ?? "unlock-arch";

  return {
    sessionId: state.sessionId,
    requestedSlug: state.requestedSlug,
    start,
    currentStepId,
    completed: steps.every((step) => step.status === "completed"),
    steps,
  };
}

export function findStep(session: SetupSession, stepId: SetupStepId): SetupStep | undefined {
  return session.steps.find((step) => step.id === stepId);
}

export function validateStepSubmission(step: SetupStep, values: FieldValues): ValidationError[] {
  const errors: ValidationError[] = [];

  for (const field of step.fields) {
    const value = values[field.id]?.trim();

    if (field.required && !value) {
      errors.push({ fieldId: field.id, message: "required" });
      continue;
    }

    if (!value) continue;

    if ((field.type === "radio" || field.type === "dropdown") && field.choices) {
      const choice = field.choices.find((candidate) => candidate.id === value);
      if (!choice) {
        errors.push({ fieldId: field.id, message: "invalid choice" });
      } else if (choice.disabled) {
        errors.push({ fieldId: field.id, message: "choice is disabled" });
      }
    }
  }

  return errors;
}

export function serializeStepValues(step: SetupStep): FieldValues {
  return step.fields.reduce<FieldValues>((values, field) => {
    if (field.value !== undefined) values[field.id] = field.value;
    return values;
  }, {});
}

export function renderTerminalSession(
  session: SetupSession,
  options: TerminalRenderOptions = {},
): string {
  const includePendingSteps = options.includePendingSteps ?? true;
  const currentStep = findStep(session, session.currentStepId);
  const lines = [
    `Arches setup: ${session.sessionId}`,
    `Current step: ${currentStep?.title ?? session.currentStepId}`,
    "",
    ...session.steps
      .filter((step) => includePendingSteps || step.status !== "pending")
      .map((step) => `${terminalStatusMarker(step.status)} ${step.title}`),
  ];

  if (currentStep) {
    lines.push("", renderTerminalStep(currentStep));
  }

  return lines.join("\n");
}

export function renderTerminalStep(step: SetupStep): string {
  const lines = [`${step.title}`, step.description];

  for (const field of step.fields) {
    lines.push("", ...renderTerminalField(field));
  }

  return lines.join("\n");
}

function verifyFarcasterStep(state: SetupState): SetupStep {
  const requestedArch = state.requestedSlug ? `${state.requestedSlug}.arches.lat` : null;

  return {
    id: "verify-farcaster",
    title: "Verify Farcaster",
    description: requestedArch
      ? `Scan with a Farcaster client so Arches can derive the host FID for ${requestedArch}.`
      : "Scan with a Farcaster client so Arches can derive the host FID.",
    status: state.hostFid ? "completed" : "active",
    fields: [
      {
        id: "qr",
        type: "qr",
        label: "Farcaster QR",
        required: true,
        value: state.farcasterQrUrl,
        description: state.hostFid
          ? `Verified FID ${state.hostFid}.`
          : "Manual admin FID input is not accepted in the zero-info flow.",
      },
    ],
  };
}

function prepareSignerStep(state: SetupState): SetupStep {
  return {
    id: "prepare-signer",
    title: "Prepare Signer",
    description: "Approve a signer that belongs to this Arch and stays with the appliance.",
    status: statusAfter(Boolean(state.hostFid), Boolean(state.signerApproved)),
    fields: [
      {
        id: "signer",
        type: "status",
        label: "Arch signer",
        value: state.signerApproved ? "approved" : "waiting",
        description: "The Arches factory FID must not become the posting identity for every Arch.",
      },
    ],
  };
}

function chooseCommunityStep(state: SetupState): SetupStep {
  const channels = state.eligibleChannels ?? [];

  return {
    id: "choose-community",
    title: "Choose Community",
    description: "Select a Farcaster channel the verified host FID can lead or moderate.",
    status: statusAfter(Boolean(state.signerApproved), Boolean(state.selectedChannelSlug)),
    fields: [
      {
        id: "channel",
        type: "radio",
        label: "Eligible channels",
        required: true,
        value: state.selectedChannelSlug,
        choices: channels.map((channel) => ({
          id: channel.slug,
          label: `/${channel.slug}`,
          description: channel.name ? `${channel.name} (${channel.role})` : channel.role,
          data: { role: channel.role },
        })),
        description:
          channels.length > 0
            ? "Eligibility comes from Farcaster channel state."
            : "No eligible channels have been returned yet.",
      },
    ],
  };
}

function nameSurfaceStep(state: SetupState): SetupStep {
  const defaultSlug = state.selectedChannelSlug ?? "";
  const slug = state.reservedSlug ?? defaultSlug;

  return {
    id: "name-surface",
    title: "Name Surface",
    description: "Reserve the Arch slug and programmable hostname.",
    status: statusAfter(Boolean(state.selectedChannelSlug), Boolean(state.reservedSlug && state.domain)),
    fields: [
      {
        id: "slug",
        type: "text",
        label: "Arch slug",
        required: true,
        value: slug,
        placeholder: "anky",
      },
      {
        id: "domain",
        type: "text",
        label: "Hostname",
        required: true,
        value: state.domain ?? (slug ? `${slug}.arches.lat` : undefined),
        placeholder: "anky.arches.lat",
      },
    ],
  };
}

function chooseHostingStep(state: SetupState): SetupStep {
  return {
    id: "choose-hosting",
    title: "Choose Hosting",
    description: "Select where this community-held appliance will run.",
    status: statusAfter(Boolean(state.reservedSlug && state.domain), Boolean(state.hostingMode)),
    fields: [
      {
        id: "mode",
        type: "radio",
        label: "Hosting mode",
        required: true,
        value: state.hostingMode ?? "tunnel-local",
        choices: HOSTING_CHOICES,
      },
    ],
  };
}

function configureSurfaceStep(state: SetupState): SetupStep {
  const slug = state.reservedSlug ?? state.selectedChannelSlug;

  return {
    id: "configure-surface",
    title: "Configure Surface",
    description: "Set the first visible community defaults.",
    status: statusAfter(Boolean(state.hostingMode), Boolean(state.surfaceConfigured)),
    fields: [
      {
        id: "title",
        type: "text",
        label: "Surface title",
        required: true,
        value: state.surfaceTitle ?? (slug ? `/${slug}` : undefined),
      },
      {
        id: "provenance",
        type: "text",
        label: "Provenance label",
        required: true,
        value: state.provenanceLabel ?? (slug ? `posted via ${slug}` : undefined),
      },
    ],
  };
}

function launchApplianceStep(state: SetupState): SetupStep {
  return {
    id: "launch-appliance",
    title: "Launch Appliance",
    description: "Render the appliance config, tunnel token, and Docker services.",
    status: statusAfter(Boolean(state.surfaceConfigured), Boolean(state.applianceLaunched)),
    fields: [
      {
        id: "installCommand",
        type: "copy",
        label: "Install command",
        value: state.installCommand,
        description: "The explicit fallback command is available if automatic setup cannot continue.",
      },
    ],
  };
}

function verifyPublishingStep(state: SetupState): SetupStep {
  return {
    id: "verify-publishing",
    title: "Verify Publishing",
    description: "Confirm Hypersnap Lite can publish Farcaster data for this Arch.",
    status: statusAfter(Boolean(state.applianceLaunched), Boolean(state.publishingVerified)),
    fields: [
      {
        id: "publishing",
        type: "status",
        label: "Farcaster publishing",
        value: state.publishingVerified ? "verified" : "waiting",
        description: "Posting stays disabled until this check passes.",
      },
    ],
  };
}

function unlockArchStep(state: SetupState): SetupStep {
  const canUnlock = Boolean(state.publishingVerified);
  const unlocked = Boolean(state.composerUnlocked && state.publishingVerified);

  return {
    id: "unlock-arch",
    title: "Unlock Arch",
    description: "Enable the composer and show the live community surface.",
    status: canUnlock ? (unlocked ? "completed" : "active") : "blocked",
    fields: [
      {
        id: "composer",
        type: "status",
        label: "Composer",
        value: unlocked ? "enabled" : "disabled",
        description: "Local-only casts are never accepted as valid Arch feed data.",
      },
    ],
  };
}

function statusAfter(prerequisiteMet: boolean, completed: boolean): StepStatus {
  if (completed) return "completed";
  return prerequisiteMet ? "active" : "pending";
}

function renderTerminalField(field: SetupField): string[] {
  const label = field.required ? `${field.label} *` : field.label;
  const lines = [`${label}: ${field.value ?? ""}`.trimEnd()];

  if (field.description) lines.push(`  ${field.description}`);

  if (field.type === "radio" || field.type === "dropdown") {
    const choices = field.choices ?? [];

    if (choices.length === 0) {
      lines.push("  No choices available yet.");
    }

    choices.forEach((choice, index) => {
      const selected = choice.id === field.value ? "*" : " ";
      const disabled = choice.disabled ? " (disabled)" : "";
      const description = choice.description ? ` - ${choice.description}` : "";
      lines.push(`  ${index + 1}. [${selected}] ${choice.label}${description}${disabled}`);
    });
  }

  if (field.type === "copy" && field.value) {
    lines.push("  Copy:");
    for (const line of field.value.split("\n")) {
      lines.push(`  ${line}`);
    }
  }

  return lines;
}

function terminalStatusMarker(status: StepStatus): string {
  switch (status) {
    case "completed":
      return "[x]";
    case "active":
      return "[>]";
    case "blocked":
      return "[!]";
    case "pending":
      return "[ ]";
  }
}
