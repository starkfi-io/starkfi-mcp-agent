# starkfi-mcp

<p align="center">
  <strong>Model Context Protocol (MCP) server for the StarkFi HTTP API</strong><br>
  TypeScript · ESM · Zod-validated tools · stdio transport
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/starkfi-mcp"><img src="https://img.shields.io/npm/v/starkfi-mcp?label=npm&logo=npm" alt="npm version"></a>
  <img src="https://img.shields.io/node/v/starkfi-mcp" alt="Node version">
  <img src="https://img.shields.io/badge/license-MIT-blue.svg" alt="License MIT">
  <a href="https://starkfi.mintlify.app/"><img src="https://img.shields.io/badge/docs-StarkFi-0A0A0A?logo=readthedocs&logoColor=white" alt="StarkFi docs"></a>
</p>

---

## Overview

**starkfi-mcp** connects AI assistants (Cursor, Claude Desktop, and other MCP hosts) to **[StarkFi](https://starkfi.mintlify.app/)**—payments, yield, orders, and KYC—through a typed **tool** surface instead of ad-hoc REST calls.

| Aspect | Detail |
|--------|--------|
| **Protocol** | [MCP](https://modelcontextprotocol.io/) over **stdio** (stdin/stdout JSON-RPC) |
| **Runtime** | Node.js **20+** |
| **Validation** | [Zod](https://zod.dev/) schemas per tool |
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

Pin a version for reproducible installs:

```bash
STARKFI_API_KEY="your_key_here" npx -y starkfi-mcp@1.0.0
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

### Claude Desktop

1. Open **Settings → Developer → Edit Config** (or edit the JSON file manually).  
2. Typical path on **macOS**:  
   `~/Library/Application Support/Claude/claude_desktop_config.json`  
3. Merge a `mcpServers` entry (use a **absolute** path when pointing at `dist/index.js`):

```json
{
  "mcpServers": {
    "starkfi": {
      "command": "node",
      "args": ["/absolute/path/to/starkfi-agent/dist/index.js"],
      "env": {
        "STARKFI_API_KEY": "your_key_here"
      }
    }
  }
}
```

**Using `npx` (after npm publish):**

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

Restart Claude Desktop after saving.

### Cursor

Add an MCP server under **Settings → MCP** using the same `command`, `args`, and `env` pattern as above.

### Global binary

If `starkfi-mcp` is on your `PATH` (`npm install -g starkfi-mcp` or `npm link`):

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

---

## References

| Resource | URL |
|----------|-----|
| StarkFi documentation | [starkfi.mintlify.app](https://starkfi.mintlify.app/) |
| LLM-friendly index | [starkfi.mintlify.app/llms.txt](https://starkfi.mintlify.app/llms.txt) |
| Model Context Protocol | [modelcontextprotocol.io](https://modelcontextprotocol.io/) |

---

## License

[MIT](LICENSE)
