---
name: starkfi-mcp-yield
description: >-
  Describes StarkFi yield MCP tools: strategies, rebalance opportunities,
  earnings, deposit and withdraw builds, rebalance build, and yield broadcast.
  Use when the user asks about yield, APY, Jupiter Lend, Kamino, rebalance,
  deposit, withdraw, earnings, or unsigned Solana transactions for StarkFi.
disable-model-invocation: true
---

# starkfi-mcp — yield workflows

## Read-only discovery

1. **`yield_list_strategies`** — Broad view of strategies and provider health.
2. **`yield_get_strategies_by_symbol`** — Filter by token symbol (e.g. USDC).
3. **`yield_list_rebalance_opportunities`** — Optional `asset_symbol` filter.
4. **`yield_get_earnings`** — Requires `wallet`; pass `chain_name` (e.g. `solana`) when relevant.

Use these before recommending deposits or comparing APYs.

## Deposit flow

1. **`yield_build_deposit`** — Returns unsigned Solana transaction (base64) and `position_id`.
2. User **signs** the transaction in their wallet (never skip user consent).
3. **`yield_broadcast`** with `operation: "deposit"`, `position_id`, and `op_signed` (signed wire).

Do not tell users to broadcast directly with `sendTransaction` outside StarkFi’s flow.

## Withdraw flow

1. **`yield_build_withdraw`** — Same pattern: unsigned tx + `position_id` / fee metadata.
2. Sign → **`yield_broadcast`** with `operation: "withdraw"` and the same `position_id` semantics as the build response.

## Rebalance flow

1. **`yield_build_rebalance`** — **PATCH** semantics on the API; body includes `chain_name`, `wallet`, `asset`, `amount`, and provider fields (`provider_out` / `provider_in`, or `provider` when both legs match).
2. Response includes `position_out_id`, `position_in_id`, and one or two unsigned transactions depending on mode.
3. **`yield_broadcast`** with `operation: "rebalance"`; `op_signed` may be a **single** base64 string or an **array of two** strings for two-step mode.

## Provider values

Use **`jupiter_lend`** or **`kamino`** where the tool schema requires `provider` enums.

## Errors

If StarkFi returns `success: false`, read `message` and `status` from the JSON body and explain the next step (e.g. invalid chain, missing position).
