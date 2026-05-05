# starkfi-mcp

<p align="center">
  <strong>Model Context Protocol (MCP) server for the StarkFi HTTP API</strong><br>
  TypeScript · ESM · Zod-validated tools · stdio transport
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/starkfi-mcp"><img src="https://img.shields.io/npm/v/starkfi-mcp?label=npm&logo=npm" alt="npm version"></a>
  <img src="https://img.shields.io/node/v/starkfi-mcp" alt="Node version">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT">
  <a href="https://docs.starkfi.io/"><img src="https://img.shields.io/badge/docs-StarkFi-0A0A0A?logo=readthedocs&logoColor=white" alt="StarkFi docs"></a>
</p>

---

## Overview

**starkfi-mcp** connects AI assistants (Cursor, Claude Desktop, and other MCP hosts) to **[StarkFi](https://docs.starkfi.io/)**—payments, yield, orders, and KYC—through a typed **tool** surface instead of ad-hoc REST calls. Tool metadata is written for **domain context**, not only parameter types: when to call each tool, typical **success response** shapes, **ordered flows** (orders → StarkPay → broadcast → status; KYC steps; yield build → broadcast), and **common API error `status` values** with recovery guidance.

| Aspect | Detail |
|--------|--------|
| **Protocol** | [MCP](https://modelcontextprotocol.io/) over **stdio** (stdin/stdout JSON-RPC) |
| **Runtime** | Node.js **20+** |
| **Validation** | [Zod](https://zod.dev/) schemas per tool (patterns, enums, cross-field rules where documented) |
| **HTTP errors** | `formatApiError` in `src/lib/errors.ts` appends **`Recovery hint:`** for many known StarkFi cases (auth, rate limit, validation, Solana blockhash expiry, payment/KYC flows) |
| **Default API host** | `https://api.starkfi.io` (see [Configuration](#configuration)) |

---

## Table of contents

- [Features](#features)
- [Prerequisites](#prerequisites)
- [Quick start (npm)](#quick-start-npm)
- [Install from source](#install-from-source)
- [Configuration](#configuration)
- [MCP client setup](#mcp-client-setup)
- [Tool catalog](#tool-catalog)
- [Agent-oriented tool design](#agent-oriented-tool-design)
- [Agent skills (Cursor)](#agent-skills-cursor)
- [Scripts](#scripts)
- [Testing](#testing)
- [Publishing to npm](#publishing-to-npm)
- [Security](#security)
- [References](#references)

---

## Features

- **Yield** — strategies, rebalance opportunities, earnings, deposit / withdraw / rebalance builds, broadcast.
- **Orders** — list, get, create, partial update, toggle active state.
- **StarkPay** — payment status, register intents, create transaction, on-chain broadcast, card tokenization payload.
- **KYC** — prepare user, email OTP, verify OTP, Didit session, status lookup.
- **Environment** — optional `.env` loading via `dotenv`; MCP `env` block still supported.
- **Agent-oriented metadata** — tool descriptions summarize StarkFi semantics (broadcast rules, multichain wallets on order splits, card tokenization vs raw card data).

---

## Prerequisites

1. **Node.js** v20 or newer  
2. A **StarkFi API key** (`x-api-key`) from your [StarkFi account / dashboard](https://starkfi.io/)

---

## Quick start (npm)

After the package is published to npm, consumers can run it without cloning the repository.

```bash
STARKFI_API_KEY="your_key_here" npx -y starkfi-mcp
```

Pin a version for reproducible installs (match the version you want from [npm](https://www.npmjs.com/package/starkfi-mcp)):

```bash
STARKFI_API_KEY="your_key_here" npx -y starkfi-mcp@1.0.1
```

Add as a project dependency:

```bash
npm install starkfi-mcp
```

---

## Install from source

For development, contributions, or running from a GitHub checkout.

```bash
git clone https://github.com/<your-org>/starkfi-agent.git
cd starkfi-agent
npm install
npm run build
```

Start the MCP server (stdio):

```bash
export STARKFI_API_KEY="your_key_here"
node dist/index.js
```

There is **no HTTP listen port**; the host application spawns this process and communicates over stdio.

---

## Configuration

### Environment variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `STARKFI_API_KEY` | **Yes** | Sent on every request as the `x-api-key` header |
| `STARKFI_BASE_URL` | No | Overrides the default StarkFi API base URL (default: `https://api.starkfi.io`) |

### `.env` file

On startup, the server loads environment variables from disk when present:

1. **Package directory** — `.env` next to the published layout (for a repo clone: project root above `dist/`).
2. **Current working directory** — if `STARKFI_API_KEY` is still empty, `.env` under `process.cwd()` is loaded.

Values already set in the process environment (for example from an MCP `env` block) are **not** overwritten.

### Interactive `.env` setup

```bash
npm run init
```

Prompts for your StarkFi API key (and optional base URL) and writes `.env` in the project root. Existing `.env` files require confirmation before overwrite.

---

## MCP client setup

MCP hosts spawn this server as a **child process** and talk over **stdio**. Use **`npx`** when you consume the published package (recommended for docs, teammates, and any machine without a local clone). Use **`node` + absolute path** only on your own machine when developing from a Git checkout (after `npm run build`).

### Recommended: `npx` (published package)

Use this in **Cursor**, **Claude Desktop**, and any other MCP client. Paths stay portable; each user sets their own `STARKFI_API_KEY` in the `env` block (never commit real keys).

```json
{
  "mcpServers": {
    "starkfi": {
      "command": "npx",
      "args": ["-y", "starkfi-mcp"],
      "env": {
        "STARKFI_API_KEY": "your_key_here"
      }
    }
  }
}
```

- **`npx`** must be on the `PATH` seen by the IDE (install Node from [nodejs.org](https://nodejs.org/) or your package manager).  
- **`-y`** accepts the package download without an interactive prompt.  
- **Pin a version** in `args` if you want reproducible installs, e.g. `["-y", "starkfi-mcp@1.0.1"]`.

**Claude Desktop:** Settings → Developer → Edit Config. On macOS the file is often  
`~/Library/Application Support/Claude/claude_desktop_config.json` — merge the `mcpServers` entry above and restart the app.

**Cursor:** Settings → MCP → add or edit the server JSON using the same `command`, `args`, and `env`.

### Local development: `node` + absolute path to `dist/index.js`

Use this **only** when you are running from a **clone of this repository** on **your** machine. You must run `npm install` and `npm run build` first so `dist/index.js` exists. Replace the path with your real project path; do **not** publish this snippet as the “official” setup for third parties (their paths differ).

```json
{
  "mcpServers": {
    "starkfi": {
      "command": "node",
      "args": ["/absolute/path/to/your/checkout/dist/index.js"],
      "env": {
        "STARKFI_API_KEY": "your_key_here"
      }
    }
  }
}
```

### Optional: global binary (`starkfi-mcp`)

If the `starkfi-mcp` executable is on your `PATH` (for example `npm install -g starkfi-mcp` or `npm link` from the repo after a build):

```json
{
  "mcpServers": {
    "starkfi": {
      "command": "starkfi-mcp",
      "env": {
        "STARKFI_API_KEY": "your_key_here"
      }
    }
  }
}
```

GUI apps on macOS often inherit a **minimal `PATH`**, so the global npm bin directory may be missing and the spawn fails. Prefer **`npx`** unless you know the binary resolves correctly.

### Troubleshooting

| Symptom | Cause | Fix |
|--------|--------|-----|
| `spawn starkfi-mcp ENOENT` | The host tried to run `starkfi-mcp` but no executable was found (not installed globally, or not on `PATH`). | Use **`npx`** with `args: ["-y", "starkfi-mcp"]`, or use **`node`** with an absolute path to `dist/index.js` after `npm run build`. |
| Server fails immediately (local) | `dist/` missing. | Run `npm run build` from the repository root. |

---

## Tool catalog

Tools are grouped by domain. Each tool includes a description in the MCP client explaining **when** the model should call it.

| Prefix | Domain |
|--------|--------|
| `yield_*` | Yield strategies, rebalance, earnings, deposit / withdraw / rebalance build, broadcast |
| `order_*` | Payment order templates: list, get, create, patch, toggle |
| `starkpay_*` | Payment lifecycle: status, intents, transaction creation, on-chain broadcast, card tokenize |
| `kyc_*` | KYC flow: prepare, OTP, verify, Didit session, status |

**API path convention:** requests use the configured StarkFi host with **root-relative** paths (no `/api/` prefix), e.g. `GET /yield/strategies`, `GET /kyc/status`.

---

## Agent-oriented tool design

This server is tuned so models **reason about StarkFi**, not only emit JSON.

| Concern | What the codebase does |
|---------|-------------------------|
| **When to call** | Each tool’s MCP `description` states intent (read vs write, polling vs one-shot) and **dependencies** between tools. |
| **Valid payloads** | Zod enforces documented shapes where possible (for example CUID-like ids, chain slugs, `payment_method_allowed` with at least one method enabled, `transaction_type`-specific fields on `starkpay_create_transaction`, Solana yield wallets, Solana or EVM `receiver_wallet` on order splits). |
| **Success envelopes** | Descriptions reference typical `{ success, status, message, data }`-style responses so the agent knows what fields to read next. |
| **Failures** | Non-2xx HTTP responses throw; the message includes parsed body fields and, when matched, a **`Recovery hint:`** line (see `src/lib/errors.ts`). |
| **Rate limits** | Per [StarkFi Authentication](https://docs.starkfi.io/authentication): **600 requests per minute** and **10 requests per second** per API key. On `429`, use exponential backoff with jitter; tool descriptions remind the model of this cadence. |
| **On-chain payments** | StarkPay and yield flows require signing locally, then submitting through StarkFi’s **broadcast** endpoints—**not** `sendTransaction` from the user’s wallet for those flows. See the StarkFi guides linked from [docs.starkfi.io](https://docs.starkfi.io/). |

---

## Agent skills (Cursor)

This repository includes **Cursor Agent Skills** under [`agent-skills/`](agent-skills/README.md): reusable `SKILL.md` instructions for the agent when integrating yield, payments, KYC, or the MCP server itself.

Copy each skill folder into **`.cursor/skills/`** so Cursor loads them (see the index in [`agent-skills/README.md`](agent-skills/README.md)).

| Skill folder | Focus |
|--------------|--------|
| `starkfi-mcp-overview` | Host, env, tool prefixes, secrets |
| `starkfi-mcp-yield` | Deposit / withdraw / rebalance / broadcast |
| `starkfi-mcp-payments` | Orders and StarkPay lifecycle |
| `starkfi-mcp-kyc-compliance` | Ordered KYC and Didit flow |

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to `dist/` |
| `npm start` | Run `node dist/index.js` |
| `npm run dev` | Build then start |
| `npm run init` | Interactive `.env` helper |

---

## Testing

| Goal | Command / action |
|------|------------------|
| **Compile** | `npm run build` |
| **Smoke start** | `STARKFI_API_KEY=… node dist/index.js` — should start without config errors and wait on stdio |
| **Packaged tarball** | `npm pack` → install the `.tgz` in a temp folder → `npx starkfi-mcp` with env set |
| **End-to-end** | Configure Claude or Cursor MCP, enable the server, invoke tools from chat with a valid key |

---

## Publishing to npm

1. Log in: `npm login`  
2. Ensure **two-factor authentication** (or an appropriate **granular access token**) is enabled on your npm account—publish may fail with `403` otherwise.  
3. From the repository root:

   ```bash
   npm run build
   npm publish
   ```

4. If npm reports `package.json` fixes, run `npm pkg fix`, review changes, commit, and publish again.  
5. For subsequent releases, bump `"version"` in `package.json` (or use `npm version patch`) before `npm publish`.

---

## Security

> **Never commit real API keys.** Use the MCP host `env` block, a local `.env` (gitignored), or your OS secret manager. Treat `STARKFI_API_KEY` like any production secret.

- **Header name** must be exactly `x-api-key` (see [Authentication](https://docs.starkfi.io/authentication)); other header names are rejected.
- **Card and KYC payloads** may contain PII; do not log full card numbers, CVV, or raw verification payloads into chat transcripts. Prefer **`starkpay_tokenize_card`** and pass only **`card_token`** in create-transaction flows when the API allows it.
- **KYC** for on-ramp and fiat/card rails is required at the account level per StarkFi; align product behavior with [dashboard](https://starkfi.io/) and compliance guidance.

---

## References

| Resource | URL |
|----------|-----|
| StarkFi documentation | [docs.starkfi.io](https://docs.starkfi.io/) |
| LLM-friendly index (`llms.txt`) | [docs.starkfi.io/llms.txt](https://docs.starkfi.io/llms.txt) |
| Model Context Protocol | [modelcontextprotocol.io](https://modelcontextprotocol.io/) |

---

## License

[MIT](LICENSE)
