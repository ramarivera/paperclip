// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  getOnboardingDefaultCommand,
  resolveOnboardingAdapterCommand,
} from "./onboarding-defaults";

describe("getOnboardingDefaultCommand", () => {
  it("defaults Claude onboarding to the raw claude command", () => {
    expect(getOnboardingDefaultCommand("claude_local", null)).toBe("claude");
  });

  it("uses the configured Claude onboarding override when provided", () => {
    expect(
      getOnboardingDefaultCommand("claude_local", {
        ceoClaudeCommand: "paperclip-claude",
      })
    ).toBe("paperclip-claude");
  });

  it("keeps non-Claude adapters on their builtin defaults", () => {
    expect(
      getOnboardingDefaultCommand("codex_local", {
        ceoClaudeCommand: "paperclip-claude",
      })
    ).toBe("codex");
  });

  it("prefers the computed onboarding command when the raw command is empty", () => {
    expect(
      resolveOnboardingAdapterCommand("claude_local", "", {
        ceoClaudeCommand: "paperclip-claude",
      })
    ).toBe("paperclip-claude");
  });

  it("preserves an explicit user-entered command", () => {
    expect(
      resolveOnboardingAdapterCommand("claude_local", "claude-custom", {
        ceoClaudeCommand: "paperclip-claude",
      })
    ).toBe("claude-custom");
  });
});
