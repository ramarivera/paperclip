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
  asBoolean,
  parseObject,
  buildPaperclipEnv,
  redactEnvForLogs,
  renderTemplate,
} from "@paperclipai/adapter-utils/server-utils";

interface SessionInitWithEnv {
  cwd?: string;
  mcpServers?: Array<{ name: string; transport: string; config?: Record<string, unknown> }>;
  env?: Record<string, string>;
}

interface SandboxAgentConfig {
  baseUrl?: string;
  token?: string;
  agent?: string;
  timeoutSec?: number;
  sessionId?: string;
  sessionInit?: SessionInitWithEnv;
  env?: Record<string, string>;
  computeSdk?: {
    provider?: string;
    apiKey?: string;
    providerApiKey?: string;
  };
}

interface SessionInfo {
  id: string;
  agent: string;
}

interface PromptResult {
  sessionId?: string;
  errorMessage?: string;
  summary?: string;
  usage?: {
    inputTokens: number;
    outputTokens: number;
  };
  costUsd?: number;
}

function parseSandboxAgentConfig(config: Record<string, unknown>): SandboxAgentConfig {
  return {
    baseUrl: asString(config.baseUrl, "http://localhost:2468"),
    token: asString(config.token, ""),
    agent: asString(config.agent, "claude"),
    timeoutSec: asNumber(config.timeoutSec, 300),
    sessionId: asString(config.sessionId, ""),
    sessionInit: parseObject(config.sessionInit) as SandboxAgentConfig["sessionInit"],
    env: parseObject(config.env) as Record<string, string>,
    computeSdk: parseObject(config.computeSdk) as SandboxAgentConfig["computeSdk"],
  };
}

async function createSandboxAgentSession(
  baseUrl: string,
  token: string,
  agent: string,
  sessionInit?: SandboxAgentConfig["sessionInit"],
): Promise<SessionInfo> {
  const response = await fetch(`${baseUrl}/v1/sessions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      agent,
      sessionInit: sessionInit || { cwd: "/", mcpServers: [] },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create session: ${response.status} ${error}`);
  }

  const data = await response.json() as { id: string; agent: string };
  return { id: data.id, agent: data.agent };
}

async function sendPromptToSession(
  baseUrl: string,
  token: string,
  sessionIdParam: string,
  prompt: string,
  timeoutSec: number,
  onLog: (stream: "stdout" | "stderr", chunk: string) => Promise<void>,
): Promise<PromptResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutSec * 1000);

  try {
    const response = await fetch(`${baseUrl}/v1/sessions/${sessionIdParam}/prompt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        messages: [{ type: "text", text: prompt }],
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Failed to send prompt: ${response.status} ${error}`);
    }

    if (!response.body) {
      throw new Error("No response body");
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let sessionId: string | undefined;
    let summary = "";
    let inputTokens = 0;
    let outputTokens = 0;
    let costUsd: number | undefined;
    let errorMessage: string | undefined;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split("\n").filter(Boolean);

      for (const line of lines) {
        try {
          const event = JSON.parse(line);
          
          switch (event.type) {
            case "session_start":
              sessionId = event.sessionId;
              await onLog("stderr", `[sandbox-agent] Session started: ${sessionId}\n`);
              break;
            
            case "stdout":
            case "stderr":
              await onLog(event.type, event.text || "");
              break;
            
            case "result":
              summary = event.summary || "";
              inputTokens = event.inputTokens || 0;
              outputTokens = event.outputTokens || 0;
              costUsd = event.costUsd;
              break;
            
            case "error":
              errorMessage = event.message || "Unknown error";
              await onLog("stderr", `[sandbox-agent] Error: ${errorMessage}\n`);
              break;
            
            case "done":
              break;
          }
        } catch {
          // Skip invalid JSON lines
        }
      }
    }

    return {
      sessionId,
      errorMessage,
      summary,
      usage: { inputTokens, outputTokens },
      costUsd,
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function execute(ctx: AdapterExecutionContext): Promise<AdapterExecutionResult> {
  const { runId, agent, runtime, config, context, onLog, onMeta, authToken } = ctx;

  const adapterConfig = parseSandboxAgentConfig(config);
  
  const promptTemplate = asString(
    config.promptTemplate,
    "You are agent {{agent.id}} ({{agent.name}}). Continue your Paperclip work.",
  );

  const baseUrl = adapterConfig.baseUrl || "http://localhost:2468";
  const token = adapterConfig.token || authToken || "";
  const agentType = adapterConfig.agent || "claude";
  const timeoutSec = adapterConfig.timeoutSec || 300;

  await onLog("stderr", `[sandbox-agent] Connecting to ${baseUrl}\n`);

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

  // Build session init with environment
  const sessionInit = {
    ...adapterConfig.sessionInit,
    env: {
      ...(adapterConfig.sessionInit?.env || {}),
      ...env,
    },
  };

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
      adapterType: "sandbox_agent",
      command: "sandbox-agent",
      cwd: sessionInit.cwd || "/",
      commandNotes: [
        `Connected to sandbox-agent at ${baseUrl}`,
        `Using agent: ${agentType}`,
      ],
      commandArgs: [baseUrl, agentType, `<prompt ${renderedPrompt.length} chars>`],
      env: redactEnvForLogs(env),
      prompt: renderedPrompt,
      context,
    });
  }

  try {
    // Determine session to use
    let sessionId: string | undefined;
    const runtimeSessionParams = parseObject(runtime.sessionParams);
    const existingSessionId = asString(runtimeSessionParams.sessionId, runtime.sessionId || "");

    if (existingSessionId) {
      sessionId = existingSessionId;
      await onLog("stderr", `[sandbox-agent] Resuming session: ${sessionId}\n`);
    } else {
      // Create new session
      const session = await createSandboxAgentSession(baseUrl, token, agentType, sessionInit);
      sessionId = session.id;
      await onLog("stderr", `[sandbox-agent] Created new session: ${sessionId}\n`);
    }

    // Send prompt and get result
    const result = await sendPromptToSession(
      baseUrl,
      token,
      sessionId,
      renderedPrompt,
      timeoutSec,
      onLog,
    );

    const resolvedSessionParams = sessionId
      ? ({ sessionId, baseUrl, agent: agentType } as Record<string, unknown>)
      : null;

    return {
      exitCode: result.errorMessage ? 1 : 0,
      signal: null,
      timedOut: false,
      errorMessage: result.errorMessage || null,
      usage: result.usage,
      sessionId: result.sessionId || sessionId,
      sessionParams: resolvedSessionParams,
      sessionDisplayId: result.sessionId || sessionId,
      provider: "sandbox-agent",
      model: agentType,
      billingType: "api",
      costUsd: result.costUsd || null,
      resultJson: {
        summary: result.summary,
      },
      summary: result.summary || null,
      clearSession: false,
    };
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    await onLog("stderr", `[sandbox-agent] Error: ${errorMessage}\n`);
    
    return {
      exitCode: 1,
      signal: null,
      timedOut: false,
      errorMessage,
      sessionId: null,
      sessionParams: null,
      sessionDisplayId: null,
      provider: "sandbox-agent",
      model: agentType,
      billingType: "api",
      costUsd: null,
      clearSession: true,
    };
  }
}

export async function testEnvironment(
  ctx: AdapterEnvironmentTestContext,
): Promise<AdapterEnvironmentTestResult> {
  const config = parseSandboxAgentConfig(ctx.adapterType as unknown as Record<string, unknown>);
  const checks: AdapterEnvironmentTestResult["checks"] = [];
  let status: AdapterEnvironmentTestStatus = "pass";

  // Check if we can reach the sandbox-agent server
  const baseUrl = config.baseUrl || "http://localhost:2468";
  
  try {
    const response = await fetch(`${baseUrl}/v1/health`, {
      method: "GET",
      ...(config.token ? { headers: { Authorization: `Bearer ${config.token}` } } : {}),
    });

    if (response.ok) {
      checks.push({
        code: "SANDBOX_AGENT_REACHABLE",
        level: "info",
        message: `Sandbox Agent server reachable at ${baseUrl}`,
      });
    } else {
      checks.push({
        code: "SANDBOX_AGENT_UNREACHABLE",
        level: "error",
        message: `Sandbox Agent server returned ${response.status}`,
        detail: await response.text(),
      });
      status = "fail";
    }
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    checks.push({
      code: "SANDBOX_AGENT_CONNECTION_FAILED",
      level: "error",
      message: `Cannot connect to Sandbox Agent at ${baseUrl}`,
      detail: errorMessage,
      hint: "Make sure sandbox-agent server is running (e.g., `sandbox-agent server --no-token`)",
    });
    status = "fail";
  }

  return {
    adapterType: "sandbox_agent",
    status,
    checks,
    testedAt: new Date().toISOString(),
  };
}

export const sessionCodec = {
  deserialize(raw: unknown): Record<string, unknown> | null {
    if (typeof raw !== "object" || raw === null) return null;
    const params = raw as Record<string, unknown>;
    if (!params.sessionId) return null;
    return {
      sessionId: String(params.sessionId),
      baseUrl: params.baseUrl ? String(params.baseUrl) : "http://localhost:2468",
      agent: params.agent ? String(params.agent) : "claude",
    };
  },
  serialize(params: Record<string, unknown> | null): Record<string, unknown> | null {
    if (!params) return null;
    return {
      sessionId: params.sessionId,
      baseUrl: params.baseUrl,
      agent: params.agent,
    };
  },
  getDisplayId(params: Record<string, unknown> | null): string | null {
    if (!params || !params.sessionId) return null;
    return String(params.sessionId);
  },
};
