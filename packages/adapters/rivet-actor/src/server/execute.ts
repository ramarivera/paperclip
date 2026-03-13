import type {
  AdapterExecutionContext,
  AdapterExecutionResult,
  AdapterEnvironmentTestContext,
  AdapterEnvironmentTestResult,
  AdapterEnvironmentTestStatus,
} from "@paperclipai/adapter-utils";
import {
  asString,
  asNumber,
  parseObject,
  buildPaperclipEnv,
  redactEnvForLogs,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";

interface RivetActorConfig {
  actorType?: string;
  actorKey?: string;
  rivetApiUrl?: string;
  rivetApiKey?: string;
  timeoutSec?: number;
  action?: string;
  state?: Record<string, unknown>;
  env?: Record<string, string>;
}

function parseRivetActorConfig(config: Record<string, unknown>): RivetActorConfig {
  return {
    actorType: asString(config.actorType, "agent"),
    actorKey: asString(config.actorKey, ""),
    rivetApiUrl: asString(config.rivetApiUrl, "https://api.rivet.cloud"),
    rivetApiKey: asString(config.rivetApiKey, ""),
    timeoutSec: asNumber(config.timeoutSec, 300),
    action: asString(config.action, "run"),
    state: parseObject(config.state),
    env: parseObject(config.env) as Record<string, string>,
  };
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const adapterConfig = parseRivetActorConfig(config);
  
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );

  const actorType = adapterConfig.actorType || "agent";
  const actorKey = adapterConfig.actorKey || `paperclip-${agent.id}`;
  const rivetApiUrl = adapterConfig.rivetApiUrl || "https://api.rivet.cloud";
  const rivetApiKey = adapterConfig.rivetApiKey || authToken || "";
  const timeoutSec = adapterConfig.timeoutSec || 300;

  await onLog("stderr", `[rivet-actor] Connecting to Rivet at ${rivetApiUrl}\n`);

  const env: Record<string, string> = { ...buildPaperclipEnv(agent) };
  env.PAPERCLIP_RUN_ID = runId;

  const wakeTaskId =
    (typeof context.taskId === "string" && context.taskId.trim().length > 0 && context.taskId.trim()) ||
    (typeof context.issueId === "string" && context.issueId.trim().length > 0 && context.issueId.trim()) ||
    null;
  const wakeReason =
    typeof context.wakeReason === "string" && context.wakeReason.trim().length > 0
      ? context.wakeReason.trim()
      : null;

  if (wakeTaskId) env.PAPERCLIP_TASK_ID = wakeTaskId;
  if (wakeReason) env.PAPERCLIP_WAKE_REASON = wakeReason;

  // Merge environment variables from config
  if (adapterConfig.env) {
    for (const [key, value] of Object.entries(adapterConfig.env)) {
      env[key] = value;
    }
  }

  const renderedPrompt = renderTemplate(promptTemplate, {
    agentId: agent.id,
    companyId: agent.companyId,
    runId,
    company: { id: agent.companyId },
    agent,
    run: { id: runId, source: "on_demand" },
    context,
  });

  if (onMeta) {
    await onMeta({
      adapterType: "rivet_actor",
      command: "rivet-actor",
      commandNotes: [
        `Connected to Rivet at ${rivetApiUrl}`,
        `Actor type: ${actorType}`,
        `Actor key: ${actorKey}`,
      ],
      commandArgs: [rivetApiUrl, actorType, actorKey, `<prompt ${renderedPrompt.length} chars>`],
      env: redactEnvForLogs(env),
      prompt: renderedPrompt,
      context,
    });
  }

  try {
    // Build the input for the Rivet actor
    const actorInput = {
      prompt: renderedPrompt,
      context: {
        ...context,
        env,
      },
      action: adapterConfig.action || "run",
    };

    // For now, we'll use HTTP API to invoke the actor
    // In a full implementation, this would use the Rivet client SDK
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

    try {
      const response = await fetch(`${rivetApiUrl}/v1/actors/${actorType}/${actorKey}/invoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(rivetApiKey ? { Authorization: `Bearer ${rivetApiKey}` } : {}),
        },
        body: JSON.stringify(actorInput),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        const error = await response.text();
        throw new Error(`Rivet actor invocation failed: ${response.status} ${error}`);
      }

      const result = await response.json() as {
        output?: string;
        summary?: string;
        usage?: { inputTokens: number; outputTokens: number };
        costUsd?: number;
        error?: string;
      };

      if (result.error) {
        await onLog("stderr", `[rivet-actor] Error: ${result.error}\n`);
        return {
          exitCode: 1,
          signal: null,
          timedOut: false,
          errorMessage: result.error,
          sessionId: actorKey,
          sessionParams: { actorType, actorKey, rivetApiUrl },
          sessionDisplayId: actorKey,
          provider: "rivet",
          model: actorType,
          billingType: "api",
          costUsd: result.costUsd || null,
          clearSession: false,
        };
      }

      await onLog("stdout", result.output || "");
      
      if (result.summary) {
        await onLog("stderr", `[rivet-actor] Summary: ${result.summary}\n`);
      }

      return {
        exitCode: 0,
        signal: null,
        timedOut: false,
        errorMessage: null,
        usage: result.usage,
        sessionId: actorKey,
        sessionParams: { actorType, actorKey, rivetApiUrl },
        sessionDisplayId: actorKey,
        provider: "rivet",
        model: actorType,
        billingType: "api",
        costUsd: result.costUsd || null,
        resultJson: {
          output: result.output,
          summary: result.summary,
        },
        summary: result.summary || null,
        clearSession: false,
      };
    } catch (err) {
      clearTimeout(timeout);
      throw err;
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    
    if (errorMessage.includes("abort")) {
      await onLog("stderr", `[rivet-actor] Timed out after ${timeoutSec}s\n`);
      return {
        exitCode: 1,
        signal: null,
        timedOut: true,
        errorMessage: `Timed out after ${timeoutSec}s`,
        sessionId: actorKey,
        sessionParams: { actorType, actorKey, rivetApiUrl },
        sessionDisplayId: actorKey,
        provider: "rivet",
        model: actorType,
        billingType: "api",
        costUsd: null,
        clearSession: false,
      };
    }
    
    await onLog("stderr", `[rivet-actor] Error: ${errorMessage}\n`);
    
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
      sessionId: actorKey,
      sessionParams: { actorType, actorKey, rivetApiUrl },
      sessionDisplayId: actorKey,
      provider: "rivet",
      model: actorType,
      billingType: "api",
      costUsd: null,
      clearSession: false,
    };
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = parseRivetActorConfig(ctx.adapterType as unknown as Record<string, unknown>);
  const checks: AdapterEnvironmentTestResult["checks"] = [];
  let status: AdapterEnvironmentTestStatus = "pass";

  const rivetApiUrl = config.rivetApiUrl || "https://api.rivet.cloud";
  
  try {
    const response = await fetch(`${rivetApiUrl}/v1/health`, {
      method: "GET",
      ...(config.rivetApiKey ? { headers: { Authorization: `Bearer ${config.rivetApiKey}` } } : {}),
    });

    if (response.ok) {
      checks.push({
        code: "RIVET_API_REACHABLE",
        level: "info",
        message: `Rivet API reachable at ${rivetApiUrl}`,
      });
    } else {
      checks.push({
        code: "RIVET_API_ERROR",
        level: "error",
        message: `Rivet API returned ${response.status}`,
        detail: await response.text(),
      });
      status = "fail";
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "RIVET_API_CONNECTION_FAILED",
      level: "error",
      message: `Cannot connect to Rivet API at ${rivetApiUrl}`,
      detail: errorMessage,
      hint: "Check your Rivet API URL and ensure you have proper network access",
    });
    status = "fail";
  }

  return {
    adapterType: "rivet_actor",
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}

export const sessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (typeof raw !== "object" || raw === null) return null;
    const params = raw as Record<string, unknown>;
    if (!params.actorKey) return null;
    return {
      actorKey: String(params.actorKey),
      actorType: params.actorType ? String(params.actorType) : "agent",
      rivetApiUrl: params.rivetApiUrl ? String(params.rivetApiUrl) : "https://api.rivet.cloud",
    };
  },
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!params) return null;
    return {
      actorKey: params.actorKey,
      actorType: params.actorType,
      rivetApiUrl: params.rivetApiUrl,
    };
  },
  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params || !params.actorKey) return null;
    return String(params.actorKey);
  },
};
