---
name: starkfi-mcp-payments
description: >-
  Guides order templates and StarkPay MCP tools: list and mutate orders,
  register intents, create transactions with flexible payloads, broadcast
  on-chain payments, tokenize cards, and read payment status. Use when the user
  mentions StarkPay, payment orders, checkout, PIX, card crypto, payment_id,
  or order_code for StarkFi.
disable-model-invocation: true
---

# starkfi-mcp — orders and StarkPay

## Order templates (`order_*`)

Typical sequence:

1. **`order_create`** — Defines a reusable template (currencies, `split_payment_config`, `payment_method_allowed`, `gateway_method`, etc.). Capture returned `order_id` / codes from the response.
2. **`order_list`** / **`order_get_by_id`** — Inspect or paginate templates.
3. **`order_update`** — Partial JSON patch per StarkFi rules (arrays merge by index where documented).
4. **`order_toggle_active`** — Enable or disable a template.

## StarkPay execution (`starkpay_*`)

1. **`starkpay_register_intents_create_order`** — Body includes `order_code` from the template creation step.
2. **`starkpay_create_transaction`** — Accepts a **`request_body`** object (full JSON). Required fields depend on `transaction_type` (`crypto`, `pixcrypto`, `cardcrypto`, `cardfiat`, etc.). Always confirm the type before building the object; see StarkFi “Create Transaction” docs.
3. **`starkpay_broadcast_on_chain`** — After the user signs the unsigned transaction from step 2. Use StarkFi’s execute endpoint only—never advise `sendTransaction` directly from the wallet for this flow.
4. **`starkpay_payment_status`** — Poll or inspect a payment by `payment_id`.

## Card tokenization

**`starkpay_tokenize_card`** — Pass **`request_body`** matching StarkFi’s tokenization contract; use the returned token in `card_data.card_token` inside `starkpay_create_transaction` when applicable.

## Safety

- Payment payloads may contain PII; do not echo full card numbers or secrets into chat logs.
- Split payouts and `executor_id` (`api_transaction` for API-driven flows) must match tenant configuration.
