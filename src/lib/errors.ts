/**
 * Builds a concise, LLM-friendly error string from an HTTP response and parsed JSON/text body.
 */
export function formatApiError(
  status: number,
  statusText: string,
  body: unknown,
): string {
  const parts: string[] = [`HTTP ${status} ${statusText}`.trim()];
  let apiStatus: string | undefined;

  if (body && typeof body === "object" && !Array.isArray(body)) {
    const o = body as Record<string, unknown>;
    if (typeof o.message === "string" && o.message.length > 0) {
      parts.push(`Message: ${o.message}`);
    }
    if (typeof o.status === "string" && o.status.length > 0) {
      apiStatus = o.status;
      parts.push(`API status: ${o.status}`);
    }
    if (typeof o.code === "number") {
      parts.push(`Code: ${o.code}`);
    }
    if (Array.isArray(o.errors) && o.errors.length > 0) {
      parts.push(`Details: ${JSON.stringify(o.errors)}`);
    }
    if (parts.length === 1) {
      parts.push(`Body: ${JSON.stringify(body)}`);
    }
  } else if (typeof body === "string" && body.length > 0 && body.length < 2000) {
    parts.push(body);
  } else if (body !== undefined && body !== null) {
    try {
      parts.push(JSON.stringify(body));
    } catch {
      parts.push(String(body));
    }
  }

  const recoveryHint = getRecoveryHint(status, apiStatus);
  if (recoveryHint) {
    parts.push(`Recovery hint: ${recoveryHint}`);
  }

  return parts.join("\n");
}

function getRecoveryHint(status: number, apiStatus?: string): string | undefined {
  if (status === 429) {
    return "Rate limit exceeded (600 req/min and 10 req/s). Use exponential backoff with jitter and retry after a short delay.";
  }

  if (status === 401 || status === 403) {
    return "Check STARKFI_API_KEY, send it as x-api-key header, and ensure the key is active in StarkFi dashboard.";
  }

  switch (apiStatus) {
    case "invalid_parameters":
    case "validation_error":
    case "params_mismatch":
      return "Validate required fields and enum values before retrying.";
    case "order_limit_reached":
      return "Tenant reached max 20 orders. Disable or reuse existing templates instead of creating new ones.";
    case "payment_not_found":
    case "order_not_found":
    case "kyc_not_found":
    case "user_not_found":
      return "Verify the identifier/email and confirm the resource was created in this tenant.";
    case "invalid_payment_status":
      return "Poll payment status until it becomes registered/retry before broadcasting again.";
    case "missing_unsigned_transaction":
      return "Call create/build transaction endpoint first and only then broadcast signed payload.";
    case "invalid_signed_transaction":
      return "Re-sign the exact unsigned transaction returned by StarkFi; do not mutate tx fields before signing.";
    case "stale_transaction_nonce":
      return "Nonce is stale. Rebuild transaction to refresh nonce, then sign and broadcast again.";
    case "solana_blockhash_expired":
      return "Blockhash expired on Solana. Rebuild operation, collect a fresh signature, and rebroadcast immediately.";
    case "payment_failed":
    case "blockchain_transaction_failed":
    case "finalizer_payment_order_on_chain_failed":
      return "Transaction failed after submission. Check payment status details and create a new payment/transaction attempt.";
    case "withdraw_position_not_found":
    case "rebalance_position_out_not_found":
      return "Fetch earnings/positions first and ensure the source position exists for this wallet, asset, and provider.";
    case "invalid_withdraw_position":
      return "Withdraw amount exceeds tracked principal/protocol balance. Reduce amount and retry.";
    case "email_not_verified":
      return "Run KYC flow in order: kyc_prepare -> kyc_send_email_otp -> kyc_verify_email_otp -> kyc_create_verify_session.";
    case "otp_expired":
    case "otp_max_attempts":
      return "Request a new OTP and ask the user to enter the latest code.";
    default:
      return undefined;
  }
}
