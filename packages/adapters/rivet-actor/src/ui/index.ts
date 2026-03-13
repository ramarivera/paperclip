import type { TranscriptEntry, StdoutLineParser } from "@paperclipai/adapter-utils";

interface RivetEvent {
  type: string;
  ts?: string;
  actorType?: string;
  actorKey?: string;
  output?: string;
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
    const event: RivetEvent = JSON.parse(line);
    const eventTs = getTimestamp(event.ts);

    switch (event.type) {
      case "actor_invoke":
        entries.push({
          kind: "init",
          ts: eventTs,
          model: event.actorType || "rivet-actor",
          sessionId: event.actorKey || "",
        });
        break;

      case "output":
        if (event.output) {
          entries.push({
            kind: "stdout",
            ts: eventTs,
            text: event.output,
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
          text: event.error || "Unknown error",
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
          errors: [event.error || "Unknown error"],
        });
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

export const type = "rivet_actor";
