import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;
const MONEY_DECIMAL_PATTERN = /^(?:0|[1-9]\d*)(?:\.\d+)?$/;
const CURRENCY_SYMBOL_PATTERN = /^[A-Z0-9]{2,12}$/;
const CHAIN_NAME_PATTERN = /^[a-z0-9_-]{2,32}$/i;
const SOLANA_WALLET_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const URL_HTTP_PATTERN = /^https?:\/\/.+/i;

const chainAgnosticWalletSchema = z
  .string()
  .refine(
    (value) => SOLANA_WALLET_PATTERN.test(value) || EVM_WALLET_PATTERN.test(value),
    "Expected Solana base58 (32-44 chars) or EVM 0x address (42 chars).",
  );

const ORDER_FLOW_NOTE =
  "Flow dependencies: order_create -> starkpay_register_intents_create_order -> starkpay_create_transaction -> starkpay_broadcast_on_chain -> starkpay_payment_status.";
const RATE_LIMIT_NOTE =
  "Rate limits: 600 req/min and 10 req/s per API key. On 429, backoff and retry with jitter.";

const paymentMethodAllowedSchema = z
  .object({
    pixcrypto: z.boolean().optional(),
    cardcrypto: z.boolean().optional(),
    cardfiat: z.boolean().optional(),
    cryptopix: z.boolean().optional(),
    cryptofiat: z.boolean().optional(),
    crypto: z.boolean().optional(),
  })
  .passthrough()
  .refine((value) => Object.values(value).some(Boolean), {
    message: "At least one payment method must be true.",
  });

const splitReceiverSchema = z.object({
  receiver_wallet: chainAgnosticWalletSchema.describe(
    "Wallet that receives this split leg (Solana base58 or EVM 0x, per destination chain).",
  ),
  receiver_percent: z
    .number()
    .min(0)
    .max(100)
    .describe("Percentage allocated to this receiver. Must be between 0 and 100."),
});

const orderItemSchema = z
  .object({
    name: z.string().min(1).max(120).optional(),
    description: z.string().max(600).optional(),
    quantity: z.number().int().min(1).optional(),
    image_url: z
      .string()
      .regex(URL_HTTP_PATTERN, "image_url must start with http:// or https://")
      .optional(),
  })
  .passthrough();

const tenantDataSchema = z
  .object({
    public_client_id: z.string().optional(),
    webhook_url: z
      .string()
      .regex(URL_HTTP_PATTERN, "webhook_url must start with http:// or https://")
      .optional(),
  })
  .passthrough();

export function registerOrderTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "order_list",
    {
      title: "List payment orders",
      description:
        "**When to use:** Paginated list of reusable payment order templates for the tenant (newest first). Useful to select an `order_id` before register intents.\n\n**Success shape:** `{ status: \"orders_listed\", data: { orders: [...], pagination: { total, page, limit, total_pages }}}`.\n\n**Common errors + recovery:** `invalid_parameters` -> keep `page >= 1` and `1 <= limit <= 100`; `customer_not_logged`/403 -> verify API key.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        page: z.number().int().min(1).optional().describe("Page number, default 1"),
        limit: z.number().int().min(1).max(100).optional().describe("Page size, default 20, max 100"),
        gateway_method: z
          .enum(["direct", "subs"])
          .optional()
          .describe("Filter by gateway method"),
        on_ramp: z.boolean().optional().describe("Filter by on-ramp flag"),
      },
    },
    async (args) => {
      const data = await client.requestJson<unknown>("GET", "/order/list", {
        query: {
          page: args.page,
          limit: args.limit,
          gateway_method: args.gateway_method,
          on_ramp: args.on_ramp,
        },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "order_get_by_id",
    {
      title: "Get order by ID",
      description:
        "**When to use:** Fetch one payment order template by CUID (`payment_orders.id`) before updates or transaction registration.\n\n**Success shape:** `{ status: \"order_found\", data: { ...order } }` (shape can evolve).\n\n**Common errors + recovery:** `order_not_found` -> list orders and use a tenant-owned id.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        order_id: z
          .string()
          .regex(CUID_PATTERN, "Expected StarkFi CUID-like id starting with 'c'.")
          .describe("Order CUID from order_create or order_list."),
      },
    },
    async ({ order_id }) => {
      const path = `/order/list/${encodeURIComponent(order_id)}`;
      const data = await client.requestJson<unknown>("GET", path);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "order_create",
    {
      title: "Create payment order template",
      description:
        "**When to use:** Create a fixed reusable order (max 20 per tenant). Always create/choose an order before `starkpay_register_intents_create_order`.\n\n**Success shape:** `{ status: \"order_created\", data: { order_id } }`.\n\n**Common errors + recovery:** `invalid_parameters` -> enable at least one payment method; `order_limit_reached` -> reuse/disable old templates.\n\n" +
        ORDER_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        executor_id: z
          .enum(["api_transaction"])
          .describe("Caller identifier. Use `api_transaction` for API automation."),
        from_currency_symbol: z
          .string()
          .regex(CURRENCY_SYMBOL_PATTERN)
          .describe("Source fiat/currency symbol enabled for tenant, e.g. `BRL`, `USD`."),
        amount_from: z
          .string()
          .regex(MONEY_DECIMAL_PATTERN)
          .describe('Source amount as decimal string, e.g. "100.00".'),
        to_currency_symbol: z
          .string()
          .regex(CURRENCY_SYMBOL_PATTERN)
          .describe("Destination symbol, e.g. `USDT`, `USDC`."),
        to_chain: z
          .string()
          .regex(CHAIN_NAME_PATTERN)
          .describe("Destination chain slug enabled on tenant, e.g. `solana`, `arbitrum`."),
        on_ramp: z.boolean(),
        gateway_method: z.enum(["direct", "subs"]),
        payment_method_allowed: paymentMethodAllowedSchema,
        split_payment_config: z.array(splitReceiverSchema).min(1),
        order_items: z.array(orderItemSchema).optional(),
        tenant_data: tenantDataSchema.optional(),
      },
    },
    async (args) => {
      const body: Record<string, unknown> = {
        executor_id: args.executor_id,
        from_currency_symbol: args.from_currency_symbol,
        amount_from: args.amount_from,
        to_currency_symbol: args.to_currency_symbol,
        to_chain: args.to_chain,
        on_ramp: args.on_ramp,
        gateway_method: args.gateway_method,
        payment_method_allowed: args.payment_method_allowed,
        split_payment_config: args.split_payment_config,
      };
      if (args.order_items !== undefined) body.order_items = args.order_items;
      if (args.tenant_data !== undefined) body.tenant_data = args.tenant_data;

      const data = await client.requestJson<unknown>("POST", "/order/create", { body });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "order_update",
    {
      title: "Partially update payment order",
      description:
        "**When to use:** Patch an existing order template (`amount_from`, payment methods, etc). Arrays merge by index and subscription config shallow-merges.\n\n**Success shape:** `{ status: \"order_updated\", data: { ...updatedOrder } }`.\n\n**Common errors + recovery:** `no_fields_to_update` -> provide at least one field; `order_not_found` -> ensure id belongs to this tenant.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        order_id: z
          .string()
          .regex(CUID_PATTERN, "Expected StarkFi CUID-like id starting with 'c'.")
          .describe("Order CUID from order_create or order_list."),
        patch: z
          .record(z.unknown())
          .refine((patch) => Object.keys(patch).length > 0, {
            message: "Patch payload cannot be empty.",
          })
          .describe(
            "Partial JSON body per StarkFi update-order docs (e.g. { \"amount_from\": \"150.00\" })",
          ),
      },
    },
    async ({ order_id, patch }) => {
      const path = `/order/${encodeURIComponent(order_id)}`;
      const data = await client.requestJson<unknown>("PATCH", path, { body: patch });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "order_toggle_active",
    {
      title: "Enable or disable order template",
      description:
        "**When to use:** Flip an order template active flag to allow/block new payments without deleting template data.\n\n**Success shape:** `{ status: \"order_activated\" | \"order_deactivated\", data: { id, active } }`.\n\n**Common errors + recovery:** `order_not_found` -> refresh list and retry with valid id.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        order_id: z
          .string()
          .regex(CUID_PATTERN, "Expected StarkFi CUID-like id starting with 'c'.")
          .describe("Order CUID to toggle."),
      },
    },
    async ({ order_id }) => {
      const path = `/order/${encodeURIComponent(order_id)}/toggle`;
      const data = await client.requestJson<unknown>("PATCH", path);
      return jsonResult(data);
    },
  );
}
