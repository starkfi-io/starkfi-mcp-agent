import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { StarkFiHttpClient } from "../lib/http-client.js";
import { jsonResult } from "./helpers.js";

export function registerKycTools(server: McpServer, client: StarkFiHttpClient): void {
  server.registerTool(
    "kyc_prepare",
    {
      title: "Prepare KYC (register email)",
      description:
        "**When to use:** Start KYC for an email before OTP and Didit session. Same email must be used for OTP and session steps. First step in compliance onboarding.",
      inputSchema: {
        email: z.string().email().describe("End user email; lowercase recommended"),
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
        "**When to use:** Check verification state, session URL, IP summaries, or blocklist signal for an email. Read-only.",
      inputSchema: {
        email: z.string().email().describe("Email used in prepare / OTP / session"),
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
        "**When to use:** After kyc_prepare, send a one-time code to the whitelisted email so the user can verify ownership.",
      inputSchema: {
        email: z.string().email(),
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
        "**When to use:** Validate the OTP from email so the user can create a KYC (Didit) session. Call after kyc_send_email_otp.",
      inputSchema: {
        email: z.string().email(),
        code: z.string().min(1).describe("One-time code from email"),
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
        "**When to use:** After email is verified — create or resume hosted verification (verify_public_kyc flow). Returns session_url when applicable.",
      inputSchema: {
        email: z.string().email().describe("Must match prepare/OTP; email must be verified"),
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
