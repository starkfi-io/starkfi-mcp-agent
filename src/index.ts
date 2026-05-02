#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { loadStarkFiConfig } from "./config.js";
import { loadStarkFiEnvFiles } from "./load-env.js";
import { StarkFiHttpClient } from "./lib/http-client.js";
import { registerAllTools } from "./tools/register.js";

loadStarkFiEnvFiles(import.meta.url);

async function main(): Promise<void> {
  const config = loadStarkFiConfig();
  const client = new StarkFiHttpClient(config.apiKey, config.baseUrl);

  const server = new McpServer({
    name: "starkfi-mcp",
    version: "1.0.0",
  });

  registerAllTools(server, client);

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((err: unknown) => {
  const message = err instanceof Error ? err.message : String(err);
  console.error(message);
  process.exit(1);
});
