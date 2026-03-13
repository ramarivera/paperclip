import type { CLIAdapterModule, TranscriptEntry } from "@paperclipai/adapter-utils";

interface SandboxAgentEvent {
  type: string;
  sessionId?: string;
  text?: string;
  message?: string;
  summary?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  error?: string;
}

export const formatStdoutEvent: CLIAdapterModule["formatStdoutEvent"] = (line: string, _debug: boolean) => {
  try {
    const event: SandboxAgentEvent = JSON.parse(line);
    
    switch (event.type) {
      case "session_start":
        process.stderr.write(`[sandbox-agent] Session started: ${event.sessionId}\n`);
        break;
      
      case "stdout":
        if (event.text) {
          process.stdout.write(event.text);
        }
        break;
      
      case "stderr":
        if (event.text) {
          process.stderr.write(event.text);
        }
        break;
      
      case "result":
        process.stderr.write(`[sandbox-agent] Completed\n`);
        if (event.summary) {
          process.stderr.write(`Summary: ${event.summary}\n`);
        }
        if (event.inputTokens || event.outputTokens) {
          process.stderr.write(
            `Tokens: in=${event.inputTokens ?? 0}, out=${event.outputTokens ?? 0}\n`,
          );
        }
        if (event.costUsd !== undefined) {
          process.stderr.write(`Cost: $${event.costUsd.toFixed(4)}\n`);
        }
        break;
      
      case "error":
        process.stderr.write(`[sandbox-agent] Error: ${event.message || event.error || "Unknown error"}\n`);
        break;
      
      case "done":
        process.stderr.write(`[sandbox-agent] Done\n`);
        break;
      
      default:
        // Unknown event type, ignore
        break;
    }
  } catch {
    // Not JSON, write as-is to stdout
    if (line.trim()) {
      process.stdout.write(line);
    }
  }
};

export const type = "sandbox_agent";
