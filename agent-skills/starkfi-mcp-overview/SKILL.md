---
name: starkfi-mcp-overview
description: >-
  Guides the agent when integrating or debugging the starkfi-mcp MCP server and
  StarkFi HTTP API. Covers environment variables, default host, tool naming
  conventions, and safe handling of secrets. Use when the user mentions
  starkfi-mcp, StarkFi MCP, StarkFi tools, x-api-key, or MCP configuration for
  this repository.
disable-model-invocation: true
---

# starkfi-mcp — overview for agents

## Scope

This skill applies to the **starkfi-mcp** project: a TypeScript MCP server that exposes **tools** calling the StarkFi API. The agent should prefer **documented MCP tools** over inventing REST paths or hosts.

## API host and paths

- Default StarkFi base URL in code: **`https://api.starkfi.io`** (`DEFAULT_BASE_URL` in `src/config.ts`).
- Optional override: **`STARKFI_BASE_URL`** in the environment (e.g. staging). If unset, every request uses the default host.
- Paths used by the client are **root-relative** (no `/api/` prefix), e.g. `/yield/strategies`, `/kyc/status`.

## Secrets

- **`STARKFI_API_KEY`** is required at runtime (`x-api-key` header). Never log it, never paste it into issues or commits.
- Users may set the key via MCP host `env`, shell export, or `.env` loaded by `dotenv` (see `src/load-env.ts`).

## Tool naming

Tools use stable prefixes:

| Prefix | Domain |
|--------|--------|
| `yield_*` | Yield / lending |
| `order_*` | Payment order templates |
| `starkpay_*` | Payment execution and status |
| `kyc_*` | KYC and email verification |

Exact tool names match the strings passed to `server.registerTool` in `src/tools/*.ts`.

## When editing this repo

1. Run **`npm run build`** after TypeScript changes; MCP entry is `dist/index.js`.
2. Keep Zod `inputSchema` aligned with the HTTP bodies StarkFi expects.
3. Surface StarkFi error envelopes (`message`, `status`) to the user when debugging failed tool calls.

## External docs

- [StarkFi documentation](https://starkfi.mintlify.app/)
- [llms.txt index](https://starkfi.mintlify.app/llms.txt)

For domain-specific flows, use the sibling skills: **starkfi-mcp-yield**, **starkfi-mcp-payments**, **starkfi-mcp-kyc-compliance**.
