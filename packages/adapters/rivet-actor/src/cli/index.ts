import type { CLIAdapterModule } from "@paperclipai/adapter-utils";

interface RivetEvent {
  type: string;
  actorType?: string;
  actorKey?: string;
  output?: string;
  summary?: string;
  inputTokens?: number;
  outputTokens?: number;
  costUsd?: number;
  error?: string;
}

export const formatStdoutEvent: CLIAdapterModule["formatStdoutEvent"] = (line: string, _debug: boolean) => {
  try {
    const event: RivetEvent = JSON.parse(line);
    
    switch (event.type) {
      case "actor_invoke":
        process.stderr.write(`[rivet-actor] Invoking ${event.actorType}/${event.actorKey}\n`);
        break;
      
      case "output":
        if (event.output) {
          process.stdout.write(event.output);
        }
        break;
      
      case "result":
        process.stderr.write(`[rivet-actor] Completed\n`);
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
        process.stderr.write(`[rivet-actor] Error: ${event.error || "Unknown error"}\n`);
        break;
    }
  } catch {
    // Not JSON, write as-is to stdout
    if (line.trim()) {
      process.stdout.write(line);
    }
  }
};

export const type = "rivet_actor";
