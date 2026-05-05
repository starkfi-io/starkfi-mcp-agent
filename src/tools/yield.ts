import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

const providerSchema = z.enum(["jupiter_lend", "kamino"]);
const CHAIN_NAME_PATTERN = /^[a-z0-9_-]{2,32}$/i;
const SYMBOL_PATTERN = /^[A-Z0-9]{2,20}$/;
const SOLANA_WALLET_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const POSITIVE_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const POSITION_ID_PATTERN = /^c[a-z0-9]{20,}$/;
const BASE64_WIRE_PATTERN = /^[A-Za-z0-9+/=]+$/;

const YIELD_FLOW_NOTE =
  "Flow dependencies: yield_list_strategies/yield_get_earnings -> yield_build_deposit|withdraw|rebalance -> user signs -> yield_broadcast.";
const RATE_LIMIT_NOTE =
  "Rate limits: 600 req/min and 10 req/s per API key. On 429, use exponential backoff with jitter.";

const positiveDecimalStringSchema = z
  .string()
  .regex(POSITIVE_DECIMAL_PATTERN, "Amount must be a decimal string.")
  .refine((v) => Number(v) > 0, "Amount must be greater than zero.");

export function registerYieldTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "yield_list_strategies",
    {
      title: "List yield strategies",
      description:
        "**When to use:** Discover all available yield/lending strategies before suggesting deposits/rebalances.\n\n**Success shape:** `{ status: \"get_yield_strategies_ok\", data: { strategies: [...], sources: {...} } }`.\n\n**Common errors + recovery:** `get_yield_strategies_failed` (502) -> transient provider failure, retry with backoff.\n\n" +
        RATE_LIMIT_NOTE,
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
        "**When to use:** Retrieve strategy options for one asset symbol (`USDC`, `SOL`, etc).\n\n**Success shape:** `{ status: \"get_yield_strategies_ok\", data: { strategies, sources } }`.\n\n**Common errors + recovery:** `yield_strategy_not_found` -> call yield_list_strategies and choose supported symbols.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        symbol: z
          .string()
          .regex(SYMBOL_PATTERN, "Use asset symbol format like USDC/SOL.")
          .describe("Token symbol, e.g. `USDC` or `SOL`. Case-insensitive server-side."),
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
        "**When to use:** Compare APYs across providers to suggest better destinations before building rebalance.\n\n**Success shape:** `{ status: \"get_rebalance_opportunities_ok\", data: { opportunities: [...], sources } }`.\n\n**Common errors + recovery:** `get_rebalance_opportunities_failed` -> retry after short delay.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        asset_symbol: z
          .string()
          .regex(SYMBOL_PATTERN, "Use asset symbol format like USDC/SOL.")
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
        "**When to use:** Inspect tracked positions and profit estimates before withdraw/rebalance decisions.\n\n**Success shape:** `{ status: \"get_earnings_position\", data: { profits: [...] } }`.\n\n**Common errors + recovery:** `params_mismatch` -> verify wallet + optional filters.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        wallet: z
          .string()
          .regex(SOLANA_WALLET_PATTERN, "Expected Solana wallet address (base58).")
          .describe("User Solana public key."),
        chain_name: z
          .string()
          .regex(CHAIN_NAME_PATTERN)
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
        "**When to use:** Build a deposit operation and obtain unsigned Solana wire for user signature.\n\n**Success shape:** `{ status: \"deposit_yield_strategy_ok\", data: { position_id, transaction } }`.\n\n**Common errors + recovery:** `invalid_parameters` -> validate chain/provider/asset; `deposit_yield_strategy_failed` -> transient infra/provider failure.\n\n" +
        YIELD_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        provider: providerSchema,
        chain_name: z
          .string()
          .regex(CHAIN_NAME_PATTERN)
          .describe("Enabled chain slug, e.g. `solana`."),
        asset: z
          .string()
          .regex(/^[A-Za-z0-9._-]{2,64}$/)
          .describe("Token symbol or mint accepted by provider."),
        wallet: z
          .string()
          .regex(SOLANA_WALLET_PATTERN, "Expected Solana wallet address (base58).")
          .describe("User Solana public key."),
        amount: positiveDecimalStringSchema.describe('Decimal amount as string, e.g. "10.0".'),
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
        "**When to use:** Build withdraw operation and receive unsigned Solana wire + fee policy metadata.\n\n**Success shape:** `{ status: \"withdraw_yield_strategy_ok\", data: { position_id, fee_policy, transaction } }`.\n\n**Common errors + recovery:** `invalid_withdraw_position` -> reduce amount/check principal; `withdraw_position_not_found` -> refresh positions first.\n\n" +
        YIELD_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        provider: providerSchema,
        chain_name: z.string().regex(CHAIN_NAME_PATTERN),
        asset: z.string().regex(/^[A-Za-z0-9._-]{2,64}$/),
        wallet: z.string().regex(SOLANA_WALLET_PATTERN, "Expected Solana wallet address (base58)."),
        amount: positiveDecimalStringSchema.describe("Amount to withdraw as decimal string."),
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
        "**When to use:** Move principal between providers (or refresh same provider) and get unsigned transaction(s) for signature.\n\n**Success shape:** `{ status: \"rebalance_yield_strategy_ok\", data: { position_out_id, position_in_id, rebalance: { details: { mode, transaction|withdraw_transaction+deposit_transaction }}}}`.\n\n**Common errors + recovery:** `rebalance_position_out_not_found` -> refresh earnings; `invalid_parameters` -> send `provider` OR `provider_in + provider_out`.\n\n" +
        YIELD_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        chain_name: z.string().regex(CHAIN_NAME_PATTERN),
        wallet: z
          .string()
          .regex(SOLANA_WALLET_PATTERN, "Expected Solana wallet address (base58).")
          .describe("User pubkey (alias signer may exist server-side)."),
        asset: z.string().regex(/^[A-Za-z0-9._-]{2,64}$/),
        amount: positiveDecimalStringSchema.describe("Amount as string, must be > 0."),
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
    z
      .string()
      .regex(BASE64_WIRE_PATTERN, "Expected base64 signed transaction wire.")
      .min(1),
    z
      .array(
        z
          .string()
          .regex(BASE64_WIRE_PATTERN, "Expected base64 signed transaction wire.")
          .min(1),
      )
      .length(2),
  ]);

  server.registerTool(
    "yield_broadcast",
    {
      title: "Broadcast yield operation",
      description:
        "**When to use:** Submit signed Solana wire(s) created by yield build endpoints. Never bypass StarkFi broadcast.\n\n**Success shape:** `{ status: \"broadcast_*_yield_strategy_ok\", data: { status, transactionHash, position_in?, position_out? } }`.\n\n**Common errors + recovery:** `invalid_parameters` -> required position ids missing; `solana_blockhash_expired` -> rebuild, re-sign, and rebroadcast quickly.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        operation: z.enum(["deposit", "withdraw", "rebalance"]),
        op_signed: opSignedSchema.describe(
          "Base64 signed Solana wire, or for rebalance two-step an array of two strings",
        ),
        position_id: z
          .string()
          .regex(POSITION_ID_PATTERN, "Expected StarkFi position CUID-like id.")
          .optional()
          .describe("Required for deposit and withdraw (from build response)"),
        position_out_id: z
          .string()
          .regex(POSITION_ID_PATTERN, "Expected StarkFi position CUID-like id.")
          .optional()
          .describe("Required for rebalance (source)"),
        position_in_id: z
          .string()
          .regex(POSITION_ID_PATTERN, "Expected StarkFi position CUID-like id.")
          .optional()
          .describe("Required for rebalance (destination)"),
      },
    },
    async (args) => {
      if ((args.operation === "deposit" || args.operation === "withdraw") && !args.position_id) {
        throw new Error("position_id is required for deposit and withdraw operations.");
      }
      if (args.operation === "rebalance" && (!args.position_out_id || !args.position_in_id)) {
        throw new Error("position_out_id and position_in_id are required for rebalance operations.");
      }

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
