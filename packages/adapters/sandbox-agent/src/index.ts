export const type = "sandbox_agent";
export const label = "Sandbox Agent";

export const models = [
  { id: "claude", label: "Claude (via Sandbox Agent)" },
  { id: "codex", label: "Codex (via Sandbox Agent)" },
  { id: "opencode", label: "OpenCode (via Sandbox Agent)" },
  { id: "amp", label: "Amp (via Sandbox Agent)" },
  { id: "mock", label: "Mock (for testing)" },
];

export const agentConfigurationDoc = `# sandbox_agent agent configuration

Adapter: sandbox_agent

Sandbox Agent provides a universal API for orchestrating AI coding agents in sandboxed environments.

Core fields:
- baseUrl (string, required): Sandbox Agent server URL (e.g., "http://localhost:2468" or ComputeSDK-provided URL)
- token (string, optional): Authentication token for the sandbox-agent server
- agent (string, required): Agent to use ("claude", "codex", "opencode", "amp", "mock")
- promptTemplate (string, optional): run prompt template
- timeoutSec (number, optional): run timeout in seconds (default: 300)
- computeSdk (object, optional): ComputeSDK configuration for cloud sandbox providers
  - provider (string): "e2b" | "daytona" | "vercel" | "modal" | "blaxel" | "codesandbox"
  - apiKey (string): ComputeSDK API key
  - providerApiKey (string): Provider-specific API key

Session configuration:
- sessionId (string, optional): Resume an existing session
- sessionInit (object, optional): Session initialization options
  - cwd (string, optional): Working directory
  - mcpServers (array, optional): MCP server configurations

Environment variables:
- env (object, optional): Environment variables to pass to the sandbox

Notes:
- Uses Sandbox Agent SDK to connect to remote sandbox servers
- Supports ComputeSDK for provider-agnostic cloud sandbox deployment
- Sessions are managed remotely by the sandbox-agent server
- Paperclip injects PAPERCLIP_* environment variables for agent context
`;
