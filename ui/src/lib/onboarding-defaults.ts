export type OnboardingAdapterType =
  | "claude_local"
  | "codex_local"
  | "opencode_local"
  | "pi_local"
  | "cursor"
  | "process"
  | "http"
  | "openclaw_gateway";

export type OnboardingDefaults = {
  ceoClaudeCommand?: string | null;
};

export function getOnboardingDefaultCommand(
  adapterType: OnboardingAdapterType,
  defaults?: OnboardingDefaults | null,
): string {
  if (adapterType === "claude_local") {
    const configured = defaults?.ceoClaudeCommand?.trim();
    return configured || "claude";
  }

  if (adapterType === "codex_local") return "codex";
  if (adapterType === "cursor") return "agent";
  if (adapterType === "opencode_local") return "opencode";
  return "";
}
