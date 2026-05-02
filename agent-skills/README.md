# Agent skills (Cursor)

This directory contains **Cursor Agent Skills** for working with the **starkfi-mcp** MCP server and the StarkFi API. Each skill is a folder with a `SKILL.md` file (YAML frontmatter + instructions).

## Activate in Cursor

Cursor loads project skills from **`.cursor/skills/<skill-name>/`**.

After cloning this repository, copy (or symlink) each skill into `.cursor/skills/`:

```bash
mkdir -p .cursor/skills
cp -R agent-skills/starkfi-mcp-overview .cursor/skills/
cp -R agent-skills/starkfi-mcp-yield .cursor/skills/
cp -R agent-skills/starkfi-mcp-payments .cursor/skills/
cp -R agent-skills/starkfi-mcp-kyc-compliance .cursor/skills/
```

Restart Cursor or reload the window if skills do not appear.

## Skills

| Folder | Purpose |
|--------|---------|
| `starkfi-mcp-overview` | Host, env vars, tool naming, safety—use first for any StarkFi MCP task |
| `starkfi-mcp-yield` | Yield strategies, earnings, deposit / withdraw / rebalance, broadcast |
| `starkfi-mcp-payments` | Orders, StarkPay intents, transactions, on-chain broadcast |
| `starkfi-mcp-kyc-compliance` | KYC prepare → OTP → verify → Didit session → status |

Invoke a skill explicitly in chat when relevant (e.g. “use the starkfi-mcp-yield skill”), or rely on descriptions for discovery.

## Authoring

Skills follow [Cursor’s skill format](https://cursor.com/docs): `SKILL.md` with `name` and `description` in frontmatter (max lengths per Cursor docs).
