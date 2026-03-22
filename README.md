# 🛡️ Guardian — Hard Behavioral Constraints for AI Agents

Prompt-based rules don't work. You tell your AI agent "don't run docker stop" in a system prompt and it ignores it when it thinks it knows better. Guardian fixes this by intercepting tool calls **before they execute** and blocking the ones you don't allow.

It's an [OpenClaw](https://github.com/openclaw/openclaw) plugin. One file, no dependencies, no external services.

## What It Solves

**Protect your workspace from destructive commands**
```json
{
  "id": "rm-workspace",
  "tool": "exec",
  "pattern": "(^|[;&|\\n])\\s*(sudo\\s+)?rm\\s+-(r|rf|fr)\\s+.*/clawd",
  "field": "command",
  "blockMessage": "🛡️ rm -rf blocked on workspace. Use trash instead."
}
```

**Make tools read-only** — let the agent read emails but block write, forward, and delete:
```json
{
  "id": "email-readonly",
  "tool": "exec",
  "pattern": "(^|[;&|\\n])\\s*himalaya\\s+(message\\s+)?(write|forward|delete|copy|save)",
  "field": "command",
  "blockMessage": "🛡️ Email is read-only. Ask the human to send/forward/delete."
}
```

**Protect files from edits** — prevent the agent from rewriting its own identity:
```json
{
  "id": "soul-protect",
  "tool": "Write",
  "pattern": "SOUL\\.md$",
  "field": "file_path",
  "blockMessage": "🛡️ SOUL.md is protected. Changes require human approval."
}
```
```json
{
  "id": "soul-protect-edit",
  "tool": "Edit",
  "pattern": "SOUL\\.md$",
  "field": "file_path",
  "blockMessage": "🛡️ SOUL.md is protected. Changes require human approval."
}
```

**Force managed paths** — block raw docker commands so the agent uses your stack manager:
```json
{
  "id": "docker-mutate",
  "tool": "exec",
  "pattern": "(^|[;&|\\n])\\s*(sudo\\s+)?docker\\s+(stop|start|rm|kill|restart|pull|build|compose|run)",
  "field": "command",
  "managedPath": "Use Komodo for container management",
  "blockMessage": "🛡️ Docker mutations blocked. Use your stack manager."
}
```

## Why Not Just Use System Prompts?

The [Voxyz article](https://x.com/voxyz_ai/status/2035018811720552485) on running 5 AI agents in production found that making `memory_search` a mandatory process step (not a prompt reminder) improved retrieval from 30% to 73%. Their conclusion: **"stronger models don't help as much as harder constraints."**

System prompts are suggestions. Guardian is enforcement.

```
Agent calls exec("docker stop nginx")
  → before_tool_call hook fires
  → Guardian matches docker-mutate rule
  → Tool call BLOCKED
  → Agent sees: "🛡️ Docker mutations blocked. Use your stack manager."
  → Agent uses the managed path instead
```

## Install

1. Copy the plugin:

```bash
mkdir -p ~/.openclaw/extensions/guardian
cp index.js openclaw.plugin.json guardian-rules.json ~/.openclaw/extensions/guardian/
```

2. Enable in `~/.openclaw/openclaw.json`:

```json
{
  "plugins": {
    "allow": ["guardian"],
    "load": {
      "paths": ["~/.openclaw/extensions/guardian"]
    },
    "entries": {
      "guardian": { "enabled": true }
    }
  }
}
```

3. Restart the gateway. Look for:

```
[guardian] Loaded N rules (N enabled)
[guardian] Registered before_tool_call enforcement hook
```

## Writing Rules

Rules live in `guardian-rules.json`:

```json
[
  {
    "id": "unique-id",
    "description": "What this rule does",
    "enabled": true,
    "tool": "exec",
    "pattern": "regex-to-match",
    "field": "command",
    "exclude": "optional-allow-pattern",
    "managedPath": "What the agent should use instead",
    "blockMessage": "🛡️ Message shown when blocked"
  }
]
```

### Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | ✅ | Unique rule identifier |
| `description` | ✅ | Human-readable explanation |
| `enabled` | ✅ | Toggle without deleting |
| `tool` | ✅ | Tool to intercept: `exec`, `Write`, `Edit`, etc. |
| `pattern` | ✅ | Regex matched against the target field (case-insensitive) |
| `field` | ✅ | Parameter to check: `command`, `file_path`, `path`, etc. |
| `fallbackField` | | Try this field if the primary is empty (e.g., `path` when `file_path` is null) |
| `exclude` | | Regex — if this matches, the rule is skipped (allow list) |
| `managedPath` | | Tells the agent what to use instead |
| `blockMessage` | ✅ | What the agent sees on block |

### Pattern Tips

- Patterns use the `i` flag (case-insensitive)
- For exec commands, prefix with `(^|[;&|\\n])\\s*` to match command position — avoids false positives from docker/himalaya inside echo strings or comments
- Use `exclude` to carve out read-only operations from a broad block
- Rules are cached for 60 seconds — edit the JSON and changes take effect automatically

## Common Recipes

### Block sudo entirely
```json
{
  "id": "no-sudo",
  "tool": "exec",
  "pattern": "(^|[;&|\\n])\\s*sudo\\s+",
  "field": "command",
  "blockMessage": "🛡️ sudo blocked. Stage files and ask the human to run privileged commands."
}
```

### Block git in workspace (use backup tool instead)
```json
{
  "id": "no-git-workspace",
  "tool": "exec",
  "pattern": "(^|[;&|\\n])\\s*git\\s+(clone|init|checkout|push|pull|merge|rebase|reset)",
  "field": "command",
  "blockMessage": "🛡️ Git blocked in workspace. Clone to /tmp/ first, copy what you need."
}
```

### Protect config files
```json
{
  "id": "protect-config",
  "tool": "Write",
  "pattern": "\\.openclaw/openclaw\\.json$",
  "field": "file_path",
  "blockMessage": "🛡️ Config is protected. Use the config validation workflow."
}
```

### Read-only database access
```json
{
  "id": "db-readonly",
  "tool": "exec",
  "pattern": "(^|[;&|\\n])\\s*(sqlite3|psql|mysql).*\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE)\\b",
  "field": "command",
  "blockMessage": "🛡️ Database writes blocked. Read-only access only."
}
```

### Block self-approval of workflow gates
Prevent agents from approving their own approval gates — forces human-in-the-loop:
```json
{
  "id": "self-approve-lobster",
  "tool": "lobster",
  "pattern": "^resume$",
  "field": "action",
  "blockMessage": "🛡️ Self-approval blocked. Route approval requests to your human."
}
```

### Block gateway restarts (force approval workflow)
```json
{
  "id": "gateway-restart",
  "tool": "exec",
  "pattern": "(^|[;&|\\n])\\s*(sudo\\s+)?openclaw\\s+gateway\\s+restart",
  "field": "command",
  "blockMessage": "🛡️ Direct restart blocked. Use your restart workflow."
}
```

## Testing

Write test cases alongside your rules:

```bash
node test-rules.cjs
# Guardian Rule Tests: 97 pass / 0 fail (of 97)
```

The test harness validates regex patterns against known inputs without needing the OpenClaw runtime. **Add test cases every time you add or modify a rule.**

## Audit Log

Every block is logged to `~/.openclaw/guardian/guardian.jsonl`:

```json
{"ts":"2026-03-21T22:54:28.123Z","session":"main","rule":"docker-mutate","tool":"exec","blocked":"docker stop nginx"}
```

Cumulative stats in `~/.openclaw/guardian/stats.json`. Review periodically — frequent blocks on the same rule might mean your agent needs a better managed path, not more blocks.

## Config

```json
{
  "plugins": {
    "entries": {
      "guardian": {
        "enabled": true,
        "config": {
          "verbose": false
        }
      }
    }
  }
}
```

Set `verbose: true` to log all evaluated tool calls, not just blocks.

## Design Principles

1. **Block, don't warn.** Warning tiers don't work — the agent treats warnings the same way it treats system prompts. Either block or allow.
2. **Rules in data, not code.** JSON rules can be edited without touching the plugin. They can even be auto-optimized by external harnesses.
3. **Every block needs an alternative.** A block without a `managedPath` is just frustration. Tell the agent what to do instead.
4. **False positives are bugs.** If a legitimate operation gets blocked, fix the pattern. Don't add a "sometimes it's ok" tier.
5. **Audit everything.** You should know exactly what Guardian is doing.

## Architecture

```
guardian-rules.json  →  index.js (before_tool_call hook)  →  block or allow
                                       ↓
                              guardian.jsonl (audit log)
                              stats.json (block counts)
```

Single-file plugin, ~180 lines. Registers one `before_tool_call` hook. Evaluates all enabled rules against every tool call. First match wins.

Guardian can intercept **any** OpenClaw tool — not just `exec`. Block `Write`, `Edit`, `gateway`, `lobster`, `message`, or any other tool by name. If the tool has parameters, you can match against any parameter field.

## License

MIT
