import type { TranscriptEntry, StdoutLineParser } from "@paperclipai/adapter-utils";

interface SandboxAgentEvent {
  type: string;
  ts?: string;
  sessionId?: string;
  text?: string;
  message?: string;
  summary?: string;
  inputTokens?: number;
  outputTokens?: number;
  cachedTokens?: number;
  costUsd?: number;
  error?: string;
  subtype?: string;
  isError?: boolean;
  errors?: string[];
}

function getTimestamp(ts?: string): string {
  return ts || new Date().toISOString();
}

export const parseStdoutLine: StdoutLineParser = (line: string, ts: string): TranscriptEntry[] => {
  const entries: TranscriptEntry[] = [];
  
  try {
    const event: SandboxAgentEvent = JSON.parse(line);
    const eventTs = getTimestamp(event.ts);

    switch (event.type) {
      case "session_start":
        entries.push({
          kind: "init",
          ts: eventTs,
          model: event.sessionId || "sandbox-agent",
          sessionId: event.sessionId || "",
        });
        break;

      case "stdout":
        if (event.text) {
          entries.push({
            kind: "stdout",
            ts: eventTs,
            text: event.text,
          });
        }
        break;

      case "stderr":
        if (event.text) {
          entries.push({
            kind: "stderr",
            ts: eventTs,
            text: event.text,
          });
        }
        break;

      case "result":
        entries.push({
          kind: "result",
          ts: eventTs,
          text: event.summary || "",
          inputTokens: event.inputTokens || 0,
          outputTokens: event.outputTokens || 0,
          cachedTokens: event.cachedTokens || 0,
          costUsd: event.costUsd || 0,
          subtype: event.subtype || "done",
          isError: event.isError || false,
          errors: event.errors || [],
        });
        break;

      case "error":
        entries.push({
          kind: "stderr",
          ts: eventTs,
          text: event.message || event.error || "Unknown error",
        });
        entries.push({
          kind: "result",
          ts: eventTs,
          text: "",
          inputTokens: 0,
          outputTokens: 0,
          cachedTokens: 0,
          costUsd: 0,
          subtype: "error",
          isError: true,
          errors: [event.message || event.error || "Unknown error"],
        });
        break;

      case "done":
        // Session completed, no additional entry needed
        break;
    }
  } catch {
    // Not valid JSON, treat as stdout
    if (line.trim()) {
      entries.push({
        kind: "stdout",
        ts,
        text: line,
      });
    }
  }

  return entries;
};

export const type = "sandbox_agent";
