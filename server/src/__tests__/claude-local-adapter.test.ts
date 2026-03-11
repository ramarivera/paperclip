import { describe, expect, it } from "vitest";
import {
  isClaudeMaxTurnsResult,
  shouldUseDangerouslySkipPermissions,
} from "@paperclipai/adapter-claude-local/server";

describe("claude_local max-turn detection", () => {
  it("detects max-turn exhaustion by subtype", () => {
    expect(
      isClaudeMaxTurnsResult({
        subtype: "error_max_turns",
        result: "Reached max turns",
      }),
    ).toBe(true);
  });

  it("detects max-turn exhaustion by stop_reason", () => {
    expect(
      isClaudeMaxTurnsResult({
        stop_reason: "max_turns",
      }),
    ).toBe(true);
  });

  it("returns false for non-max-turn results", () => {
    expect(
      isClaudeMaxTurnsResult({
        subtype: "success",
        stop_reason: "end_turn",
      }),
    ).toBe(false);
  });
});

describe("shouldUseDangerouslySkipPermissions", () => {
  it("disables skip-permissions when running as root", () => {
    expect(shouldUseDangerouslySkipPermissions(true, {}, 0)).toBe(false);
  });

  it("disables skip-permissions when running via sudo", () => {
    expect(shouldUseDangerouslySkipPermissions(true, { SUDO_UID: "1000" }, 1000)).toBe(false);
  });

  it("preserves skip-permissions for non-privileged processes", () => {
    expect(shouldUseDangerouslySkipPermissions(true, {}, 1000)).toBe(true);
  });
});
