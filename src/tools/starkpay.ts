import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

const CUID_PATTERN = /^c[a-z0-9]{20,}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const SOLANA_WALLET_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
const EVM_WALLET_PATTERN = /^0x[a-fA-F0-9]{40}$/;
const CHAIN_NAME_PATTERN = /^[a-z0-9_-]{2,32}$/i;
const CURRENCY_SYMBOL_PATTERN = /^[A-Z0-9]{2,12}$/;
const CPF_CNPJ_PATTERN = /^\d{11,14}$/;
const IPV4_PATTERN =
  /^(25[0-5]|2[0-4]\d|[01]?\d?\d)\.(25[0-5]|2[0-4]\d|[01]?\d?\d)\.(25[0-5]|2[0-4]\d|[01]?\d?\d)\.(25[0-5]|2[0-4]\d|[01]?\d?\d)$/;

const RATE_LIMIT_NOTE =
  "Rate limits: 600 req/min and 10 req/s per API key. On 429, apply exponential backoff with jitter.";
const PAYMENT_FLOW_NOTE =
  "Flow: order_create/order_get -> starkpay_register_intents_create_order -> starkpay_create_transaction -> user signs -> starkpay_broadcast_on_chain -> starkpay_payment_status.";

const paymentIdSchema = z
  .string()
  .regex(CUID_PATTERN, "Expected StarkFi payment/order CUID-like id starting with 'c'.");

const walletSchema = z
  .string()
  .refine(
    (value) => SOLANA_WALLET_PATTERN.test(value) || EVM_WALLET_PATTERN.test(value),
    "Expected Solana base58 or EVM 0x wallet format.",
  );

const transactionTypeSchema = z.enum([
  "crypto",
  "pixcrypto",
  "fiatcrypto",
  "cardcrypto",
  "cardfiat",
]);

const createTransactionRequestSchema = z
  .object({
    payment_id: paymentIdSchema.describe("Payment id returned by register intents."),
    transaction_type: transactionTypeSchema.describe(
      "Payment method type. Drives required fields in this payload.",
    ),
    payer_email: z.string().regex(EMAIL_PATTERN, "Invalid email format."),
    payer_wallet: walletSchema.optional(),
    chain_name: z
      .string()
      .regex(CHAIN_NAME_PATTERN)
      .describe("Required for `crypto` type. Example: `arbitrum`, `solana`.")
      .optional(),
    payer_token_symbol: z
      .string()
      .regex(CURRENCY_SYMBOL_PATTERN)
      .describe("Required for `crypto` type. Example: `USDC`, `SOL`, `ETH`.")
      .optional(),
    payer_cpf: z
      .string()
      .regex(CPF_CNPJ_PATTERN)
      .describe("Required for `pixcrypto` and `fiatcrypto` types.")
      .optional(),
    payer_name: z.string().min(3).max(120).optional(),
    payer_document: z.string().regex(CPF_CNPJ_PATTERN).optional(),
    payer_document_type: z.enum(["PASSPORT", "CPF", "CNPJ"]).optional(),
    payer_ip: z
      .string()
      .regex(IPV4_PATTERN, "payer_ip must be a valid IPv4.")
      .optional(),
    session_id: z
      .string()
      .min(3)
      .max(200)
      .optional()
      .describe("Recommended for card transactions and fraud checks."),
    payer_phone: z
      .object({
        country_code: z.string().min(1).max(4),
        area_code: z.string().min(1).max(4),
        number: z.string().min(6).max(15),
      })
      .optional(),
    card_data: z
      .object({
        installments: z.literal(1).describe("Only 1 installment is currently supported."),
        statement_descriptor: z.string().min(1).max(22).optional(),
        card_token: z.string().min(1).optional(),
        card: z
          .object({
            number: z.string().regex(/^\d{12,19}$/),
            holder_name: z.string().min(3).max(120),
            holder_document: z.string().regex(CPF_CNPJ_PATTERN),
            exp_month: z.number().int().min(1).max(12),
            exp_year: z.number().int().min(0).max(99),
            cvv: z.string().regex(/^\d{3,4}$/),
            brand: z.string().min(2).max(30).optional(),
          })
          .optional(),
        address: z.object({
          country: z.string().min(2).max(3),
          state: z.string().min(2).max(60),
          city: z.string().min(2).max(120),
          neighborhood: z.string().min(2).max(120),
          street: z.string().min(2).max(120),
          street_number: z.string().min(1).max(20),
          zipcode: z.string().regex(/^\d{5,12}$/),
          complement: z.string().max(120).optional(),
        }),
      })
      .optional(),
  })
  .superRefine((value, ctx) => {
    if (value.transaction_type === "crypto") {
      if (!value.payer_wallet) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payer_wallet"],
          message: "payer_wallet is required for crypto transactions.",
        });
      }
      if (!value.chain_name) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["chain_name"],
          message: "chain_name is required for crypto transactions.",
        });
      }
      if (!value.payer_token_symbol) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payer_token_symbol"],
          message: "payer_token_symbol is required for crypto transactions.",
        });
      }
    }

    if (value.transaction_type === "pixcrypto" || value.transaction_type === "fiatcrypto") {
      if (!value.payer_cpf) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["payer_cpf"],
          message: "payer_cpf is required for pixcrypto/fiatcrypto transactions.",
        });
      }
    }

    if (value.transaction_type === "cardcrypto" || value.transaction_type === "cardfiat") {
      const requiredCardFields: Array<keyof typeof value> = [
        "payer_name",
        "payer_document",
        "payer_document_type",
        "payer_phone",
        "card_data",
      ];
      for (const field of requiredCardFields) {
        if (!value[field]) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: [field],
            message: `${field} is required for card transactions.`,
          });
        }
      }
    }
  });

const tokenizeCardSchema = z.object({
  type: z.literal("card").describe("Must be `card` for StarkFi card tokenization."),
  card: z.object({
    number: z.string().regex(/^\d{12,19}$/, "Card number must contain 12-19 digits."),
    holder_name: z.string().min(3).max(120),
    holder_document: z.string().regex(CPF_CNPJ_PATTERN),
    exp_month: z.number().int().min(1).max(12),
    exp_year: z.number().int().min(0).max(99),
    cvv: z.string().regex(/^\d{3,4}$/),
  }),
});

export function registerStarkPayTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "starkpay_payment_status",
    {
      title: "Check payment transaction status",
      description:
        "**When to use:** Poll after create/broadcast to track lifecycle (`registered`, `processing`, `received`, `success`, `error`).\n\n**Success shape:** `{ status: \"payment_found\", data: { id, status, transaction_type, unsigned_tx, global_payment_data, data_error, ... } }`.\n\n**Common errors + recovery:** `payment_not_found` -> verify `payment_id` and tenant; `data_error.code=invalid_payment_status` -> rebuild transaction or retry flow based on current state.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        payment_id: paymentIdSchema.describe("Payment id returned by StarkPay register/create calls."),
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
        "**When to use:** Start payment intent from an existing order template before creating transaction details.\n\n**Success shape:** `{ status: \"payment_registered\" | ... , data: { payment_id, ... } }`.\n\n**Common errors + recovery:** `order_not_found` -> call order_list/order_get_by_id and retry with valid order code.\n\n" +
        PAYMENT_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        order_code: z
          .string()
          .regex(CUID_PATTERN, "Expected StarkFi order CUID-like id starting with 'c'.")
          .describe("Order CUID from `order_create` response."),
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
        "**When to use:** Build payment execution payload after register intents. Returns unsigned `crypto_tx` (for sign+broadcast) or fiat/card payment data.\n\n**Success shape:** `{ status: \"payment_registered\", data: { payment_id, session_payment, crypto_tx, fiat_tx } }`.\n\n**Common errors + recovery:** `validation_error` -> send fields required by `transaction_type`; `unauthorized` -> validate API key header.\n\n**Security:** never expose raw PAN/CVV in logs; prefer `starkpay_tokenize_card` + `card_data.card_token`.\n\n" +
        PAYMENT_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        request_body: createTransactionRequestSchema.describe(
          "Typed request body. Required fields are validated by transaction_type.",
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
        "**When to use:** Submit signed transaction after user signs `crypto_tx` from create transaction. Do not broadcast with wallet `sendTransaction`.\n\n**Success shape:** `{ status: \"payment_confirmed\" | \"payment_received\", data: { id, tid_hash|tx_hash } }`.\n\n**Common errors + recovery:** `invalid_signed_transaction` -> re-sign exact unsigned tx; `stale_transaction_nonce` -> rebuild tx and sign again; `invalid_payment_status` -> poll status and retry only when valid.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        executor_id: z
          .enum(["api_transaction"])
          .describe("Executor id. Use `api_transaction` for API-driven flows."),
        payment_id: paymentIdSchema.describe("Payment id from register/create transaction step."),
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
        "**When to use:** Convert raw card details into short-lived token before card payment creation.\n\n**Success shape:** `{ id, type: \"card\", created_at, expires_at, card: { first_six_digits, last_four_digits, ... } }`.\n\n**Security:** call from backend only, avoid logging raw card data, and pass only returned token in subsequent calls.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        request_body: tokenizeCardSchema.describe(
          "Card tokenization payload. Example: `{ type: 'card', card: { number, holder_name, holder_document, exp_month, exp_year, cvv } }`.",
        ),
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
