import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

const providerSchema = z.enum(["jupiter_lend", "kamino"]);

export function registerYieldTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "yield_list_strategies",
    {
      title: "List yield strategies",
      description:
        "**When to use:** The user wants to see available yield / lending opportunities (APYs, protocols like Jupiter Lend and Kamino) across supported assets. Use before suggesting deposits or comparing yields. Read-only.",
    },
    async () => {
      const data = await client.requestJson<unknown>("GET", "/yield/strategies");
      return jsonResult(data);
    },
  );

  server.registerTool(
    "yield_get_strategies_by_symbol",
    {
      title: "Get yield strategies by token symbol",
      description:
        "**When to use:** The user asks for yield options for one token (e.g. USDC, SOL). Case-insensitive symbol filter. Read-only.",
      inputSchema: {
        symbol: z
          .string()
          .min(1)
          .describe("Token symbol, e.g. USDC or SOL"),
      },
    },
    async ({ symbol }) => {
      const path = `/yield/strategies/${encodeURIComponent(symbol)}`;
      const data = await client.requestJson<unknown>("GET", path);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "yield_list_rebalance_opportunities",
    {
      title: "List rebalance opportunities",
      description:
        "**When to use:** Compare APYs across protocols to find better yield destinations or to power rebalance suggestions. Optionally filter by asset symbol. Read-only.",
      inputSchema: {
        asset_symbol: z
          .string()
          .optional()
          .describe(
            "If set, returns opportunities for this symbol only (e.g. USDC). Omit for all tokens.",
          ),
      },
    },
    async ({ asset_symbol }) => {
      const path = asset_symbol
        ? `/yield/rebalance-opportunities/${encodeURIComponent(asset_symbol)}`
        : "/yield/rebalance-opportunities";
      const data = await client.requestJson<unknown>("GET", path);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "yield_get_earnings",
    {
      title: "Yield earnings and positions",
      description:
        "**When to use:** Show the user's tracked yield positions, balances, profit estimates, or reconciliation state. Requires wallet (and typically chain). Read-only.",
      inputSchema: {
        wallet: z
          .string()
          .min(1)
          .describe("User wallet public key (Solana-style in docs)"),
        chain_name: z
          .string()
          .optional()
          .describe("Chain filter, e.g. solana"),
        wallet_manager: z
          .string()
          .optional()
          .describe("Alternative wallet filter (recommended in some flows)"),
        snapshot_id: z.string().optional(),
        strategy_symbol: z.string().optional(),
        strategy_name: z.string().optional(),
        include_withdraw_profit_estimate: z.number().int().optional(),
      },
    },
    async (args) => {
      const data = await client.requestJson<unknown>("GET", "/yield/earnings", {
        query: {
          wallet: args.wallet,
          chain_name: args.chain_name,
          wallet_manager: args.wallet_manager,
          snapshot_id: args.snapshot_id,
          strategy_symbol: args.strategy_symbol,
          strategy_name: args.strategy_name,
          include_withdraw_profit_estimate: args.include_withdraw_profit_estimate,
        },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "yield_build_deposit",
    {
      title: "Build yield deposit (unsigned tx)",
      description:
        "**When to use:** User wants to deposit into a yield strategy. Returns an unsigned Solana transaction (base64) and position_id for broadcast — the user must sign; then call yield_broadcast. Do not broadcast from the user's wallet outside StarkFi.",
      inputSchema: {
        provider: providerSchema,
        chain_name: z.string().min(1).describe("Enabled chain, e.g. solana"),
        asset: z.string().min(1).describe("Token symbol or mint accepted by the provider"),
        wallet: z.string().min(1).describe("User Solana public key"),
        amount: z.string().min(1).describe('Decimal amount as string, e.g. "10.0"'),
      },
    },
    async (args) => {
      const data = await client.requestJson<unknown>("POST", "/yield/deposit", {
        body: {
          provider: args.provider,
          chain_name: args.chain_name,
          asset: args.asset,
          wallet: args.wallet,
          amount: args.amount,
        },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "yield_build_withdraw",
    {
      title: "Build yield withdraw (unsigned tx)",
      description:
        "**When to use:** User wants to withdraw from a yield position. Returns unsigned transaction and fee_policy metadata. Sign then call yield_broadcast with operation withdraw.",
      inputSchema: {
        provider: providerSchema,
        chain_name: z.string().min(1),
        asset: z.string().min(1),
        wallet: z.string().min(1),
        amount: z.string().min(1).describe("Amount to withdraw as decimal string"),
      },
    },
    async (args) => {
      const data = await client.requestJson<unknown>("POST", "/yield/withdraw", {
        body: {
          provider: args.provider,
          chain_name: args.chain_name,
          asset: args.asset,
          wallet: args.wallet,
          amount: args.amount,
        },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "yield_build_rebalance",
    {
      title: "Build yield rebalance (unsigned tx)",
      description:
        "**When to use:** Move principal between yield protocols (or refresh same protocol). Uses PATCH. Returns position_out_id, position_in_id, and transaction(s). Sign and broadcast via yield_broadcast.",
      inputSchema: {
        chain_name: z.string().min(1),
        wallet: z.string().min(1).describe("User pubkey (alias signer may exist server-side)"),
        asset: z.string().min(1),
        amount: z.string().min(1).describe("Amount as string, must be > 0"),
        provider_out: providerSchema.optional(),
        provider_in: providerSchema.optional(),
        provider: providerSchema.optional().describe(
          "When both legs use the same protocol, send only this instead of provider_in/out",
        ),
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        chain_name: args.chain_name,
        wallet: args.wallet,
        asset: args.asset,
        amount: args.amount,
      };
      if (args.provider) body.provider = args.provider;
      if (args.provider_out) body.provider_out = args.provider_out;
      if (args.provider_in) body.provider_in = args.provider_in;

      const data = await client.requestJson<unknown>("PATCH", "/yield/rebalance", {
        body,
      });
      return jsonResult(data);
    },
  );

  const opSignedSchema = z.union([
    z.string().min(1),
    z.array(z.string().min(1)).min(1),
  ]);

  server.registerTool(
    "yield_broadcast",
    {
      title: "Broadcast yield operation",
      description:
        "**When to use:** After the user signed the unsigned transaction from yield_build_deposit, yield_build_withdraw, or yield_build_rebalance. operation: deposit | withdraw | rebalance. For rebalance, op_signed may be one base64 string or two [withdraw, deposit].",
      inputSchema: {
        operation: z.enum(["deposit", "withdraw", "rebalance"]),
        op_signed: opSignedSchema.describe(
          "Base64 signed Solana wire, or for rebalance two-step an array of two strings",
        ),
        position_id: z
          .string()
          .optional()
          .describe("Required for deposit and withdraw (from build response)"),
        position_out_id: z.string().optional().describe("Required for rebalance (source)"),
        position_in_id: z.string().optional().describe("Required for rebalance (destination)"),
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        operation: args.operation,
        op_signed: args.op_signed,
      };
      if (args.position_id) body.position_id = args.position_id;
      if (args.position_out_id) body.position_out_id = args.position_out_id;
      if (args.position_in_id) body.position_in_id = args.position_in_id;

      const data = await client.requestJson<unknown>("POST", "/yield/broadcast", {
        body,
      });
      return jsonResult(data);
    },
  );
}
