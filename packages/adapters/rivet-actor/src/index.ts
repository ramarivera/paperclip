export const type = "rivet_actor";
export const label = "Rivet Actor";

export const models = [
  { id: "default", label: "Default Actor" },
];

export const agentConfigurationDoc = `# rivet_actor agent configuration

Adapter: rivet_actor

Rivet Actors provide long-lived, in-memory compute with built-in state persistence and realtime events.

Core fields:
- actorType (string, required): The type of Rivet actor to use (e.g., "agent", "worker")
- actorKey (string, required): Unique key for the actor instance
- rivetApiUrl (string, optional): Rivet API URL (defaults to Rivet Cloud)
- rivetApiKey (string, optional): Rivet API key for authentication
- promptTemplate (string, optional): run prompt template
- timeoutSec (number, optional): run timeout in seconds (default: 300)
- action (string, optional): The action to invoke on the actor (default: "run")
- state (object, optional): Initial state for new actors

Environment variables:
- env (object, optional): Environment variables to pass to the actor

Notes:
- Uses Rivet client to connect to actors
- Actors maintain state between invocations
- Supports realtime events via WebSocket connections
- Paperclip context is passed as input to the actor action
`;
