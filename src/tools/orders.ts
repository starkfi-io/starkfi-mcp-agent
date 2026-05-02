import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

const paymentMethodAllowedSchema = z
  .object({
    pixcrypto: z.boolean().optional(),
    cardcrypto: z.boolean().optional(),
    cardfiat: z.boolean().optional(),
    cryptopix: z.boolean().optional(),
    crypto: z.boolean().optional(),
  })
  .passthrough();

const splitReceiverSchema = z.object({
  receiver_wallet: z.string().min(1),
  receiver_percent: z.number(),
});

const orderItemSchema = z
  .object({
    name: z.string().optional(),
    description: z.string().optional(),
    quantity: z.number().optional(),
    image_url: z.string().optional(),
  })
  .passthrough();

const tenantDataSchema = z
  .object({
    public_client_id: z.string().optional(),
    webhook_url: z.string().optional(),
  })
  .passthrough();

export function registerOrderTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "order_list",
    {
      title: "List payment orders",
      description:
        "**When to use:** Paginated list of reusable payment order templates for the tenant (newest first). Use for checkout configuration history or to pick an order_id. Read-only.",
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
        "**When to use:** Fetch one payment order template by CUID (payment_orders.id). Use before updating or referencing an order in payment flows. Read-only.",
      inputSchema: {
        order_id: z.string().min(1).describe("Order CUID"),
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
        "**When to use:** Create a fixed reusable order (max 20 per tenant). Used with StarkPay register intents (order_code). Requires currencies, split config, and payment_method_allowed.",
      inputSchema: {
        executor_id: z
          .string()
          .describe("Use api_transaction when the request comes from API automation"),
        from_currency_symbol: z.string().min(1),
        amount_from: z.string().min(1),
        to_currency_symbol: z.string().min(1),
        to_chain: z.string().min(1),
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
        "**When to use:** Change fields on an existing order template (e.g. amount_from, gateway_method). Arrays merge by index; subscription_payment_config shallow-merges. Send only fields to change in patch.",
      inputSchema: {
        order_id: z.string().min(1).describe("Order CUID"),
        patch: z
          .record(z.unknown())
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
        "**When to use:** Flip the active flag on an order template so it can or cannot be used for new payments. Idempotent toggle per API semantics.",
      inputSchema: {
        order_id: z.string().min(1).describe("Order CUID"),
      },
    },
    async ({ order_id }) => {
      const path = `/order/${encodeURIComponent(order_id)}/toggle`;
      const data = await client.requestJson<unknown>("PATCH", path);
      return jsonResult(data);
    },
  );
}
