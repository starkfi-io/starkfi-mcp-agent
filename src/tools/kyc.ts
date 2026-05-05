import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

const OTP_PATTERN = /^\d{4,8}$/;
const RATE_LIMIT_NOTE =
  "Rate limits: 600 req/min and 10 req/s per API key. On 429, apply exponential backoff with jitter.";
const KYC_FLOW_NOTE =
  "Flow dependencies: kyc_prepare -> kyc_send_email_otp -> kyc_verify_email_otp -> kyc_create_verify_session -> kyc_get_status.";

const emailSchema = z
  .string()
  .email("Provide a valid email address.")
  .transform((value) => value.trim().toLowerCase());

export function registerKycTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "kyc_prepare",
    {
      title: "Prepare KYC (register email)",
      description:
        "**When to use:** First step of KYC flow; registers email before OTP/session.\n\n**Success shape:** `user_prepared` (201) or `user_already_prepared` (200 with existing flags).\n\n**Common errors + recovery:** `missing_params` -> include email; `server_failed` -> retry.\n\n" +
        KYC_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        email: emailSchema.describe("End-user email. Canonicalized to lowercase for consistent flow."),
      },
    },
    async ({ email }) => {
      const data = await client.requestJson<unknown>("POST", "/kyc/prepare", {
        body: { email },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "kyc_get_status",
    {
      title: "Get KYC status",
      description:
        "**When to use:** Query KYC state at any time (pending/approved/session status/blocklist flags).\n\n**Success shape:** `{ status: \"kyc_status_retrieved\", data: { status, approved, session_id, session_url, ip_info, is_blocklisted } }`.\n\n**Common errors + recovery:** `kyc_not_found` -> run kyc_prepare first.\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        email: emailSchema.describe("Must match the same email used in prepare/OTP/session."),
      },
    },
    async ({ email }) => {
      const data = await client.requestJson<unknown>("GET", "/kyc/status", {
        query: { email },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "kyc_send_email_otp",
    {
      title: "Send KYC email OTP",
      description:
        "**When to use:** After kyc_prepare, send one-time code to whitelisted email.\n\n**Success shape:** `{ status: \"otp_sent\" }`.\n\n**Common errors + recovery:** `email_already_verified` -> skip to session creation; `user_not_found` -> call kyc_prepare first.\n\n" +
        KYC_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        email: emailSchema.describe("Prepared email in lowercase."),
      },
    },
    async ({ email }) => {
      const data = await client.requestJson<unknown>("POST", "/security/email/send-otp", {
        body: { email },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "kyc_verify_email_otp",
    {
      title: "Verify KYC email OTP",
      description:
        "**When to use:** Validate OTP before opening Didit session.\n\n**Success shape:** `{ status: \"email_verified\" }`.\n\n**Common errors + recovery:** `otp_invalid` -> ask user to recheck code; `otp_expired`/`otp_max_attempts` -> send new OTP; `email_already_verified` -> proceed to session creation.\n\n" +
        KYC_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        email: emailSchema.describe("Same email used in prepare/send OTP."),
        code: z
          .string()
          .regex(OTP_PATTERN, "Use numeric OTP code with 4-8 digits.")
          .describe("One-time code received by email."),
      },
    },
    async ({ email, code }) => {
      const data = await client.requestJson<unknown>("POST", "/security/email/verify-otp", {
        body: { email, code },
      });
      return jsonResult(data);
    },
  );

  server.registerTool(
    "kyc_create_verify_session",
    {
      title: "Create or resume KYC (Didit) session",
      description:
        "**When to use:** Create/resume Didit hosted verification after OTP is verified.\n\n**Success shape:** `{ status: \"kyc_session_created\", data: { session: { session_id, session_url }, ... } }`.\n\n**Common errors + recovery:** `email_not_verified` -> run OTP verification first; `method_not_found` -> use supported method (`verify_public_kyc`).\n\n" +
        KYC_FLOW_NOTE +
        "\n\n" +
        RATE_LIMIT_NOTE,
      inputSchema: {
        email: emailSchema.describe("Must match prepared/verified email."),
      },
    },
    async ({ email }) => {
      const data = await client.requestJson<unknown>(
        "POST",
        "/kyc/create/verify_public_kyc",
        {
          body: { email },
        },
      );
      return jsonResult(data);
    },
  );
}
