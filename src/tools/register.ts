import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { registerKycTools } from "./kyc.js";
import { registerOrderTools } from "./orders.js";
import { registerStarkPayTools } from "./starkpay.js";
import { registerYieldTools } from "./yield.js";

export function registerAllTools(server: McpServer, client: StarkFiHttpClient): void {
  registerYieldTools(server, client);
  registerOrderTools(server, client);
  registerStarkPayTools(server, client);
  registerKycTools(server, client);
}
