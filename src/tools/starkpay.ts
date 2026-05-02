import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

export function registerStarkPayTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "starkpay_payment_status",
    {
      title: "Check payment transaction status",
      description:
        "**When to use:** After creating a payment / transaction, poll or inspect full payment details (status, amounts, unsigned_tx, errors). Read-only.",
      inputSchema: {
        payment_id: z.string().min(1).describe("Payment transaction id from StarkPay flow"),
      },
    },
    async ({ payment_id }) => {
      const path = `/payment/${encodeURIComponent(payment_id)}/status`;
      const data = await client.requestJson<unknown>("GET", path);
      return jsonResult(data);
    },
  );

  server.registerTool(
    "starkpay_register_intents_create_order",
    {
      title: "Register payment intent from order template",
      description:
        "**When to use:** Start a payment using a pre-created order template. Send the order_id (order_code) returned from order_create.",
      inputSchema: {
        order_code: z.string().min(1).describe("Order CUID from order_create"),
      },
    },
    async ({ order_code }) => {
      const data = await client.requestJson<unknown>(
        "POST",
        "/payment/register/intents-create-order",
        {
          body: { order_code },
        },
      );
      return jsonResult(data);
    },
  );

  server.registerTool(
    "starkpay_create_transaction",
    {
      title: "Create transaction from payment registration",
      description:
        "**When to use:** Build the next step after registering a payment — returns payment_id, session link, unsigned crypto_tx or fiat (Pix) payload. Required fields depend on transaction_type (crypto, pixcrypto, cardcrypto, cardfiat). Pass the full JSON body the API expects in request_body (see StarkFi Create Transaction docs).",
      inputSchema: {
        request_body: z
          .record(z.unknown())
          .describe(
            "Complete request JSON, e.g. payment_id, transaction_type, payer_email, and type-specific fields (payer_wallet, chain_name for crypto; payer_cpf for pixcrypto; card_data for cardcrypto, etc.)",
          ),
      },
    },
    async ({ request_body }) => {
      const data = await client.requestJson<unknown>(
        "POST",
        "/payment/register/intents-create-transaction",
        { body: request_body },
      );
      return jsonResult(data);
    },
  );

  server.registerTool(
    "starkpay_broadcast_on_chain",
    {
      title: "Broadcast signed on-chain payment transaction",
      description:
        "**When to use:** After the user signs the unsigned transaction from starkpay_create_transaction. Never submit via wallet sendTransaction — always this endpoint. Uses POST /payment/execute/on-chain.",
      inputSchema: {
        executor_id: z.string().describe("Use api_transaction for API-driven flows"),
        payment_id: z.string().min(1),
        signed_transaction: z
          .string()
          .min(1)
          .describe("Signed transaction hex (EVM) or encoding required by StarkFi for the chain"),
      },
    },
    async (args) => {
      const data = await client.requestJson<unknown>("POST", "/payment/execute/on-chain", {
        body: {
          executor_id: args.executor_id,
          payment_id: args.payment_id,
          signed_transaction: args.signed_transaction,
        },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "starkpay_tokenize_card",
    {
      title: "Tokenize card for card payments",
      description:
        "**When to use:** Before cardcrypto/cardfiat create_transaction with card_token — exchange raw card data for a short-lived token. Pass full JSON body per StarkFi tokenization docs.",
      inputSchema: {
        request_body: z
          .record(z.unknown())
          .describe('Typically includes type: "card" and card object with PAN, holder, expiry, etc.'),
      },
    },
    async ({ request_body }) => {
      const data = await client.requestJson<unknown>("POST", "/payment/card/tokenize", {
        body: request_body,
      });
      return jsonResult(data);
    },
  );
}
