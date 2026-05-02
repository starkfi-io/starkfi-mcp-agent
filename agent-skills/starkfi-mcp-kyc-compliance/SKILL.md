---
name: starkfi-mcp-kyc-compliance
description: >-
  Describes the ordered StarkFi KYC MCP flow: prepare email, send and verify
  OTP, create Didit session, and read status. Use when the user mentions KYC,
  identity verification, Didit, email OTP, whitelist, or compliance onboarding
  for StarkFi.
disable-model-invocation: true
---

# starkfi-mcp — KYC and compliance

## Mandatory order

Run steps **in sequence** for a new user email:

1. **`kyc_prepare`** — Registers the email to start KYC. Use the **same** email string (lowercase recommended) for all following steps.
2. **`kyc_send_email_otp`** — Sends the one-time code after prepare.
3. **`kyc_verify_email_otp`** — Validates `email` + `code` from the user.
4. **`kyc_create_verify_session`** — Creates or resumes the Didit session (`verify_public_kyc` flow). Requires email verification to succeed.

Skipping steps typically yields `email_not_verified` or similar errors.

## Status anytime

- **`kyc_get_status`** — Query `email` for approval state, session URL, IP summaries, and blocklist signals. Safe to call after any step for UX messaging.

## Consistency rules

- One **canonical email** per user journey; mismatches cause 404 or validation errors.
- Do not fabricate OTP codes; always wait for user input after `kyc_send_email_otp`.
- If the API returns `kyc_not_found` or `user_not_found`, confirm the email was prepared first.

## Privacy

Treat KYC responses as sensitive: avoid dumping full provider payloads into public channels; summarize status for the user.
