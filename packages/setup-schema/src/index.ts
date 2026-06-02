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
export type SurfacePreset = "village" | "bulletin" | "library";
export type GrammarPreset = "open-casts" | "curated-updates" | "knowledge-base";
export type ThemePreset = "daylight" | "high-contrast" | "night";
export type StepStatus = "pending" | "active" | "completed" | "blocked";
export type SetupReadiness = "in-progress" | "blocked" | "complete";

export type SetupChoice = {
  id: string;
  label: string;
  extraLabel?: string;
  description?: string;
  disabled?: boolean;
  data?: Record<string, unknown>;
};

export type SetupStepActionId =
  | "request-signer-approval"
  | "check-signer-approval"
  | "refresh-eligible-channels"
  | "provision-tunnel"
  | "export-arch-config"
  | "check-appliance-launch"
  | "verify-publishing"
  | "unlock-composer";

export type SetupStepAction = {
  id: SetupStepActionId;
  label: string;
  method: "post";
  path: string;
  description?: string;
  disabled?: boolean;
};

export type SetupStepSubmit = {
  label: string;
  method: "post";
  path: string;
  description?: string;
  disabled?: boolean;
};

export type SetupField = {
  id: string;
  type: SetupFieldType;
  label: string;
  required?: boolean;
  value?: string;
  placeholder?: string;
  description?: string;
  errorDescription?: string;
  choices?: SetupChoice[];
};

export type SetupStep = {
  id: SetupStepId;
  title: string;
  description: string;
  status: StepStatus;
  statusReason?: string;
  index: number;
  displayIndex: number;
  previousStepId?: SetupStepId;
  nextStepId?: SetupStepId;
  icon?: string;
  completedAt?: string;
  completedByFid?: number;
  completionEventId?: string;
  completionEventType?: string;
  actions?: SetupStepAction[];
  submit?: SetupStepSubmit;
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
  farcasterNonce?: string;
  farcasterDomain?: string;
  farcasterChannelToken?: string;
  farcasterChannelState?: "pending" | "completed";
  hostFid?: number;
  signerApproved?: boolean;
  signerRequestUrl?: string;
  signerPublicKey?: string;
  signerStatus?: "waiting" | "approved";
  eligibleChannels?: EligibleChannel[];
  selectedChannelSlug?: string;
  reservedSlug?: string;
  domain?: string;
  hostingMode?: HostingMode;
  surfacePreset?: SurfacePreset;
  grammarPreset?: GrammarPreset;
  themePreset?: ThemePreset;
  surfaceTitle?: string;
  provenanceLabel?: string;
  surfaceConfigured?: boolean;
  tunnelId?: string;
  tunnelProvisioned?: boolean;
  applianceLaunched?: boolean;
  installCommand?: string;
  archConfigExported?: boolean;
  archConfigEnv?: string;
  publishingVerified?: boolean;
  publishingProbeHash?: string;
  publishingProbeCheckedUrl?: string;
  composerUnlocked?: boolean;
};

export type SetupSession = {
  schemaVersion: 1;
  sessionId: string;
  requestedSlug?: string;
  createdAt?: string;
  updatedAt?: string;
  start: SetupStepId;
  currentStepId: SetupStepId;
  completed: boolean;
  summary: SetupSummary;
  steps: SetupStep[];
};

export type SetupSummary = {
  readiness: SetupReadiness;
  completedStepCount: number;
  totalStepCount: number;
  blockedStepCount: number;
  currentStepTitle: string;
  nextAction: string;
};

export type FieldValues = Record<string, string | undefined>;

export type ValidationError = {
  fieldId: string;
  message: string;
};

export type TerminalRenderOptions = {
  includePendingSteps?: boolean;
  actionBaseUrl?: string;
  stepSubmissionBaseUrl?: string;
  refreshUrl?: string;
  setupUrl?: string;
};

type SetupStepDraft = Omit<SetupStep, "index" | "displayIndex" | "previousStepId" | "nextStepId">;

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

export const DEFAULT_SURFACE_PRESET: SurfacePreset = "village";
export const DEFAULT_GRAMMAR_PRESET: GrammarPreset = "open-casts";
export const DEFAULT_THEME_PRESET: ThemePreset = "daylight";

const SURFACE_PRESET_CHOICES: SetupChoice[] = [
  {
    id: "village",
    label: "Village",
    description: "A general community home with feed, context, and local provenance.",
  },
  {
    id: "bulletin",
    label: "Bulletin",
    description: "A quieter surface for announcements, updates, and signal-heavy posting.",
  },
  {
    id: "library",
    label: "Library",
    description: "A durable knowledge surface for reference-heavy communities.",
  },
];

const GRAMMAR_PRESET_CHOICES: SetupChoice[] = [
  {
    id: "open-casts",
    label: "Open Casts",
    description: "Default Farcaster posting with Arch provenance.",
  },
  {
    id: "curated-updates",
    label: "Curated Updates",
    description: "A posting grammar biased toward announcements and host-led updates.",
  },
  {
    id: "knowledge-base",
    label: "Knowledge Base",
    description: "A posting grammar for reference notes and durable community memory.",
  },
];

const THEME_PRESET_CHOICES: SetupChoice[] = [
  {
    id: "daylight",
    label: "Daylight",
    description: "Clear, bright, and readable.",
  },
  {
    id: "high-contrast",
    label: "High Contrast",
    description: "Sharper separation for dense reading and accessibility.",
  },
  {
    id: "night",
    label: "Night",
    description: "A darker interface for late reading and high-focus spaces.",
  },
];

export function buildSetupSession(state: SetupState): SetupSession {
  const start: SetupStepId = "verify-farcaster";
  const steps = withWizardStepMetadata([
    verifyFarcasterStep(state),
    prepareSignerStep(state),
    chooseCommunityStep(state),
    nameSurfaceStep(state),
    chooseHostingStep(state),
    configureSurfaceStep(state),
    launchApplianceStep(state),
    verifyPublishingStep(state),
    unlockArchStep(state),
  ]);

  const currentStepId = steps.find((step) => step.status !== "completed")?.id ?? "unlock-arch";
  const completed = steps.every((step) => step.status === "completed");

  return {
    schemaVersion: 1,
    sessionId: state.sessionId,
    requestedSlug: state.requestedSlug,
    start,
    currentStepId,
    completed,
    summary: buildSetupSummary(steps, currentStepId, completed),
    steps,
  };
}

function buildSetupSummary(
  steps: SetupStep[],
  currentStepId: SetupStepId,
  completed: boolean,
): SetupSummary {
  const currentStep = steps.find((step) => step.id === currentStepId) ?? steps[0];
  const blockedStepCount = steps.filter((step) => step.status === "blocked").length;
  const readiness: SetupReadiness = completed
    ? "complete"
    : currentStep?.status === "blocked"
      ? "blocked"
      : "in-progress";

  return {
    readiness,
    completedStepCount: steps.filter((step) => step.status === "completed").length,
    totalStepCount: steps.length,
    blockedStepCount,
    currentStepTitle: currentStep?.title ?? currentStepId,
    nextAction: buildNextAction(currentStep, completed),
  };
}

function buildNextAction(currentStep: SetupStep | undefined, completed: boolean): string {
  if (completed) return "Setup is complete.";
  if (!currentStep) return "Continue setup.";
  if (currentStep.status === "blocked") return `${currentStep.title} is blocked.`;

  if (currentStep.submit && !currentStep.submit.disabled) {
    return `Submit ${currentStep.title}.`;
  }

  const action = currentStep.actions?.find((candidate) => !candidate.disabled);
  if (action) return `${action.label}.`;

  const qrField = currentStep.fields.find((field) => field.type === "qr");
  if (qrField) {
    return `Scan ${qrField.label}.`;
  }

  return `Continue with ${currentStep.title}.`;
}

function hasReadySubmitFields(step: SetupStep): boolean {
  return step.fields.some((field) => {
    if (field.type === "text") return true;
    if (field.type !== "radio" && field.type !== "dropdown") return false;
    return (field.choices ?? []).some((choice) => !choice.disabled);
  });
}

function withWizardStepMetadata(steps: SetupStepDraft[]): SetupStep[] {
  return steps.map((step, index) => {
    const stepWithMetadata = {
      ...step,
      index,
      displayIndex: index + 1,
      previousStepId: steps[index - 1]?.id,
      nextStepId: steps[index + 1]?.id,
    };

    return {
      ...stepWithMetadata,
      submit: buildStepSubmit(stepWithMetadata),
      statusReason: stepWithMetadata.statusReason ?? buildStepStatusReason(stepWithMetadata),
    };
  });
}

function buildStepStatusReason(step: SetupStep): string | undefined {
  if (step.status === "completed" || step.status === "active") return undefined;

  switch (step.id) {
    case "verify-farcaster":
      return undefined;
    case "prepare-signer":
      return "Verify Farcaster before preparing an Arch signer.";
    case "choose-community":
      return "Approve an Arch signer before choosing a community.";
    case "name-surface":
      return "Choose an eligible Farcaster channel before reserving a hostname.";
    case "choose-hosting":
      return "Reserve the Arch hostname before choosing hosting.";
    case "configure-surface":
      return "Choose hosting before configuring the surface.";
    case "launch-appliance":
      return "Configure the surface before launching the appliance.";
    case "verify-publishing":
      return "Launch the appliance before verifying Farcaster publishing.";
    case "unlock-arch":
      return "Verify Farcaster publishing before unlocking the composer.";
  }
}

function buildStepSubmit(step: SetupStep): SetupStepSubmit | undefined {
  if (step.status !== "active" || !hasReadySubmitFields(step)) return undefined;

  return {
    label: "Continue",
    method: "post",
    path: `steps/${step.id}`,
    description: `Submit ${step.title} through the current-step updater.`,
  };
}

export function findStep(session: SetupSession, stepId: SetupStepId): SetupStep | undefined {
  return session.steps.find((step) => step.id === stepId);
}

export function withFieldErrors(
  session: SetupSession,
  errors: ValidationError[],
): SetupSession {
  const errorByFieldId = new Map(
    errors.map((error) => [error.fieldId, validationErrorDescription(error.message)]),
  );

  return {
    ...session,
    steps: session.steps.map((step) => ({
      ...step,
      fields: step.fields.map((field) => ({
        ...field,
        errorDescription: errorByFieldId.get(field.id),
      })),
    })),
  };
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

function validationErrorDescription(message: string): string {
  switch (message) {
    case "required":
      return "This field is required.";
    case "invalid choice":
      return "Choose one of the available options.";
    case "choice is disabled":
      return "This option is not available.";
    default:
      return message;
  }
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
    `Progress: ${session.summary.completedStepCount}/${session.summary.totalStepCount} steps complete`,
    `Readiness: ${session.summary.readiness}`,
    `Next: ${session.summary.nextAction}`,
    `Step context: ${renderTerminalStepContext(session, currentStep)}`,
    ...(options.refreshUrl ? [`Refresh: curl -fsSL ${options.refreshUrl}`] : []),
    ...(options.setupUrl ? [`Browser setup: ${options.setupUrl}`] : []),
    "",
    ...session.steps
      .filter((step) => includePendingSteps || step.status !== "pending")
      .map(renderTerminalStepLine),
  ];

  if (currentStep) {
    lines.push("", renderTerminalStep(currentStep, options));
  }

  return lines.join("\n");
}

function renderTerminalStepContext(
  session: SetupSession,
  currentStep: SetupStep | undefined,
): string {
  if (!currentStep) return "Unknown";

  const previousStep = currentStep.previousStepId
    ? findStep(session, currentStep.previousStepId)
    : undefined;
  const nextStep = currentStep.nextStepId
    ? findStep(session, currentStep.nextStepId)
    : undefined;

  return `${previousStep?.title ?? "None"} -> ${currentStep.title} -> ${nextStep?.title ?? "None"}`;
}

function renderTerminalStepLine(step: SetupStep): string {
  const provenance =
    step.completedAt && step.completionEventType
      ? ` (${step.completionEventType} at ${step.completedAt})`
      : "";
  const reason =
    step.statusReason && (step.status === "pending" || step.status === "blocked")
      ? ` - ${step.statusReason}`
      : "";
  return `${terminalStatusMarker(step.status)} ${step.title}${provenance}${reason}`;
}

export function renderTerminalStep(
  step: SetupStep,
  options: Pick<TerminalRenderOptions, "actionBaseUrl" | "stepSubmissionBaseUrl"> = {},
): string {
  const lines = [`${step.title}`, step.description];

  for (const field of step.fields) {
    lines.push("", ...renderTerminalField(field));
  }

  if (step.actions?.length) {
    lines.push("", "Actions:");
    for (const action of step.actions) {
      const disabled = action.disabled ? " (disabled)" : "";
      lines.push(`  - ${action.label}${disabled}`);
      if (action.description) lines.push(`    ${action.description}`);
      if (!action.disabled && options.actionBaseUrl) {
        lines.push(`    Command: curl -fsSL -X POST ${terminalActionUrl(options.actionBaseUrl, action)}`);
      }
    }
  }

  const submitCommand = terminalStepSubmitCommand(step, options.stepSubmissionBaseUrl);
  if (submitCommand) {
    lines.push("", "Submit:");
    if (step.submit?.description) lines.push(`  ${step.submit.description}`);
    lines.push(...submitCommand.map((line) => `  ${line}`));
  }

  return lines.join("\n");
}

function terminalActionUrl(actionBaseUrl: string, action: SetupStepAction): string {
  const base = actionBaseUrl.replace(/\/+$/, "");
  const path = action.path.replace(/^\/+/, "");
  return `${base}/${path}`;
}

function terminalStepSubmitCommand(
  step: SetupStep,
  stepSubmissionBaseUrl: string | undefined,
): string[] | undefined {
  if (!stepSubmissionBaseUrl || !step.submit || step.submit.disabled) return undefined;

  const fields = step.fields.filter((field) =>
    field.type === "text" || field.type === "radio" || field.type === "dropdown",
  );
  if (fields.length === 0) return undefined;

  const body = fields.reduce<Record<string, string>>((values, field) => {
    values[field.id] = terminalFieldSubmitValue(field);
    return values;
  }, {});
  const base = stepSubmissionBaseUrl.replace(/\/+$/, "");
  const path = step.submit.path.replace(/^\/+/, "");

  return [
    `curl -fsSL -X POST ${base}/${path} \\`,
    `  -H 'content-type: application/json' \\`,
    `  --data '${terminalJsonBody(body)}'`,
  ];
}

function terminalFieldSubmitValue(field: SetupField): string {
  if (field.value) return field.value;

  if (field.type === "radio" || field.type === "dropdown") {
    return `<${field.id}>`;
  }

  return field.placeholder ? `<${field.placeholder}>` : `<${field.id}>`;
}

function terminalJsonBody(values: Record<string, string>): string {
  return JSON.stringify(values).replace(/'/g, "'\\''");
}

function verifyFarcasterStep(state: SetupState): SetupStepDraft {
  const requestedArch = state.requestedSlug ? `${state.requestedSlug}.arches.lat` : null;

  return {
    id: "verify-farcaster",
    title: "Verify Farcaster",
    description: requestedArch
      ? `Scan with a Farcaster client so Arches can derive the host FID for ${requestedArch}.`
      : "Scan with a Farcaster client so Arches can derive the host FID.",
    status: state.hostFid ? "completed" : "active",
    icon: "key",
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

function prepareSignerStep(state: SetupState): SetupStepDraft {
  const approved = Boolean(state.signerApproved);
  const status = statusAfter(Boolean(state.hostFid), approved);

  return {
    id: "prepare-signer",
    title: "Prepare Signer",
    description: "Approve a signer that belongs to this Arch and stays with the appliance.",
    status,
    icon: "signature",
    actions:
      status === "active"
        ? [
            state.signerRequestUrl && !approved
              ? {
                  id: "check-signer-approval",
                  label: "Check signer approval",
                  method: "post",
                  path: "actions/check-signer-approval",
                  description: "Poll the provider until the host-approved signer is verified.",
                }
              : {
                  id: "request-signer-approval",
                  label: "Request signer approval",
                  method: "post",
                  path: "actions/request-signer-approval",
                  description: "Create a provider-backed signer approval request for this host FID.",
                },
          ]
        : undefined,
    fields: [
      {
        id: "signer",
        type: "status",
        label: "Arch signer",
        value: approved ? "approved" : state.signerStatus ?? "waiting",
        description: state.signerPublicKey
          ? `Approved signer public key: ${state.signerPublicKey}.`
          : "The Arches factory FID must not become the posting identity for every Arch.",
      },
      ...(state.signerRequestUrl && !approved
        ? [
            {
              id: "signerRequest",
              type: "qr" as const,
              label: "Signer approval",
              value: state.signerRequestUrl,
              description:
                "Approve this signer from a Farcaster client. Arches must not store signer private keys.",
            },
          ]
        : []),
    ],
  };
}

function chooseCommunityStep(state: SetupState): SetupStepDraft {
  const channels = state.eligibleChannels ?? [];
  const status = statusAfter(Boolean(state.signerApproved), Boolean(state.selectedChannelSlug));

  return {
    id: "choose-community",
    title: "Choose Community",
    description: "Select a Farcaster channel the verified host FID can lead or moderate.",
    status,
    icon: "channels",
    actions:
      status === "active"
        ? [
            {
              id: "refresh-eligible-channels",
              label: "Refresh eligible channels",
              method: "post",
              path: "actions/refresh-eligible-channels",
              description: "Reload channels the verified host FID can lead or moderate.",
            },
          ]
        : undefined,
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
          extraLabel: channel.role,
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

function nameSurfaceStep(state: SetupState): SetupStepDraft {
  const defaultSlug = state.selectedChannelSlug ?? "";
  const slug = state.reservedSlug ?? defaultSlug;

  return {
    id: "name-surface",
    title: "Name Surface",
    description: "Reserve the Arch slug and programmable hostname.",
    status: statusAfter(Boolean(state.selectedChannelSlug), Boolean(state.reservedSlug && state.domain)),
    icon: "link",
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

function chooseHostingStep(state: SetupState): SetupStepDraft {
  return {
    id: "choose-hosting",
    title: "Choose Hosting",
    description: "Select where this community-held appliance will run.",
    status: statusAfter(Boolean(state.reservedSlug && state.domain), Boolean(state.hostingMode)),
    icon: "server",
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

function configureSurfaceStep(state: SetupState): SetupStepDraft {
  const slug = state.reservedSlug ?? state.selectedChannelSlug;

  return {
    id: "configure-surface",
    title: "Configure Surface",
    description: "Set the first visible community defaults.",
    status: statusAfter(Boolean(state.hostingMode), Boolean(state.surfaceConfigured)),
    icon: "layout",
    fields: [
      {
        id: "surfacePreset",
        type: "radio",
        label: "Surface type",
        required: true,
        value: state.surfacePreset ?? DEFAULT_SURFACE_PRESET,
        choices: SURFACE_PRESET_CHOICES,
      },
      {
        id: "grammarPreset",
        type: "dropdown",
        label: "Posting grammar",
        required: true,
        value: state.grammarPreset ?? DEFAULT_GRAMMAR_PRESET,
        choices: GRAMMAR_PRESET_CHOICES,
      },
      {
        id: "themePreset",
        type: "dropdown",
        label: "Theme",
        required: true,
        value: state.themePreset ?? DEFAULT_THEME_PRESET,
        choices: THEME_PRESET_CHOICES,
      },
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

function launchApplianceStep(state: SetupState): SetupStepDraft {
  const status = statusAfter(Boolean(state.surfaceConfigured), Boolean(state.applianceLaunched));
  const needsTunnel = state.hostingMode === "tunnel-local" && !state.tunnelProvisioned;
  const needsConfigExport = !state.archConfigExported;

  return {
    id: "launch-appliance",
    title: "Launch Appliance",
    description: "Render the appliance config, tunnel token, and Docker services.",
    status,
    icon: "rocket",
    actions:
      status === "active"
        ? [
            needsTunnel
              ? {
                  id: "provision-tunnel",
                  label: "Provision tunnel",
                  method: "post",
                  path: "actions/provision-tunnel",
                  description: "Create the Cloudflare Tunnel route for this Arch hostname.",
                }
              : needsConfigExport
                ? {
                    id: "export-arch-config",
                    label: "Export Arch config",
                    method: "post",
                    path: "actions/export-arch-config",
                    description: "Render the non-secret appliance config from verified setup state.",
                  }
                : {
                    id: "check-appliance-launch",
                    label: "Check appliance launch",
                    method: "post",
                    path: "actions/check-appliance-launch",
                    description:
                      "Confirm the public Arch appliance health endpoint is reachable before publishing verification.",
                  },
          ]
        : undefined,
    fields: [
      {
        id: "tunnel",
        type: "status",
        label: "Tunnel route",
        value: state.tunnelProvisioned ? "provisioned" : "waiting",
        description: state.tunnelId
          ? `Cloudflare Tunnel ${state.tunnelId} is ready for this Arch hostname.`
          : "The setup broker will provision the route before the installer starts Docker.",
      },
      {
        id: "installCommand",
        type: "copy",
        label: "Install command",
        value: state.installCommand,
        description: "The explicit fallback command is available if automatic setup cannot continue.",
      },
      {
        id: "archConfig",
        type: "copy",
        label: "Arch config env",
        value: state.archConfigEnv,
        description:
          state.archConfigExported && state.archConfigEnv
            ? "Non-secret setup settings exported from the verified wizard state."
            : "Export the non-secret Arch config before the installer writes appliance settings.",
      },
    ],
  };
}

function verifyPublishingStep(state: SetupState): SetupStepDraft {
  const status = statusAfter(Boolean(state.applianceLaunched), Boolean(state.publishingVerified));

  return {
    id: "verify-publishing",
    title: "Verify Publishing",
    description: "Confirm Hypersnap Lite can publish Farcaster data for this Arch.",
    status,
    icon: "protocol",
    actions:
      status === "active"
        ? [
            {
              id: "verify-publishing",
              label: "Verify publishing",
              method: "post",
              path: "actions/verify-publishing",
              description:
                "Run the appliance publishing probe and require Farcaster proof before composer unlock.",
            },
          ]
        : undefined,
    fields: [
      {
        id: "publishing",
        type: "status",
        label: "Farcaster publishing",
        value: state.publishingVerified ? "verified" : "waiting",
        description: state.publishingProbeHash
          ? `Verified Farcaster probe ${state.publishingProbeHash}.`
          : "Posting stays disabled until this check passes.",
      },
    ],
  };
}

function unlockArchStep(state: SetupState): SetupStepDraft {
  const canUnlock = Boolean(state.publishingVerified);
  const unlocked = Boolean(state.composerUnlocked && state.publishingVerified);

  return {
    id: "unlock-arch",
    title: "Unlock Arch",
    description: "Enable the composer and show the live community surface.",
    status: canUnlock ? (unlocked ? "completed" : "active") : "blocked",
    icon: "composer",
    actions:
      canUnlock && !unlocked
        ? [
            {
              id: "unlock-composer",
              label: "Unlock composer",
              method: "post",
              path: "actions/unlock-composer",
              description:
                "Enable the Arch composer after Farcaster publishing proof has been recorded.",
            },
          ]
        : undefined,
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

  if (field.errorDescription) lines.push(`  Error: ${field.errorDescription}`);
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
