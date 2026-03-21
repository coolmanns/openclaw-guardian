# 🛡️ Guardian — Structural Enforcement for OpenClaw

Guardian is an OpenClaw plugin that enforces behavioral constraints on AI agents through **hard blocks**, not prompts.

Instead of telling the model "please don't run docker stop" in a system prompt and hoping it listens, Guardian intercepts the `before_tool_call` hook and **rejects the call before it executes**. The agent gets a clear message explaining what's blocked and what managed path to use instead.

## Why

Prompt-based rules don't work reliably. The [Voxyz article](https://x.com/voxyz_ai/status/2035018811720552485) on running 5 AI agents in production found that making `memory_search` a mandatory process step (not a prompt reminder) improved retrieval from 30% to 73%. Their core finding: **"stronger models don't help as much as harder constraints."**

Guardian applies this principle: if there's a managed path (like Komodo for Docker management), block the raw path structurally. The agent can't ignore what it can't call.

## How It Works

```
Agent calls exec("docker stop nginx")
  → before_tool_call hook fires
  → Guardian evaluates rules from guardian-rules.json
  → docker-mutate rule matches
  → Tool call blocked with: "🛡️ Docker mutations blocked. Use Komodo."
  → Agent receives block reason and managed path alternative
```

- **Rules are JSON** — no code changes needed to add/modify rules
- **1-minute cache** — edit rules, they take effect within 60 seconds
- **Audit log** — every block logged to `~/.openclaw/guardian/guardian.jsonl`
- **Stats** — cumulative block counts in `~/.openclaw/guardian/stats.json`

## Install

1. Copy the plugin to your OpenClaw extensions directory:

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

3. Restart the gateway. You should see in logs:

```
[guardian] Loaded 1 rules (1 enabled)
[guardian] Registered before_tool_call enforcement hook
```

## Writing Rules

Rules live in `guardian-rules.json` — an array of rule objects:

```json
[
  {
    "id": "docker-mutate",
    "description": "Block direct docker mutations — use your stack manager",
    "enabled": true,
    "tool": "exec",
    "pattern": "(^|[;&|\\n])\\s*(sudo\\s+)?docker\\s+(stop|start|rm|kill|restart|pull|build|compose|run)",
    "field": "command",
    "exclude": "",
    "managedPath": "Use your Docker management tool for container operations",
    "blockMessage": "🛡️ Docker mutations blocked. Use your stack manager."
  }
]
```

### Rule Fields

| Field | Required | Description |
|-------|----------|-------------|
| `id` | Yes | Unique identifier |
| `description` | Yes | Human-readable description |
| `enabled` | Yes | `true`/`false` — disabled rules are skipped |
| `tool` | Yes | Tool name to match (e.g., `exec`, `write`, `edit`) |
| `pattern` | Yes | Regex pattern to match against the field value |
| `field` | Yes | Parameter field to test (e.g., `command` for exec, `file_path` for write) |
| `exclude` | No | Regex — if this matches, skip the rule (allow list) |
| `managedPath` | Yes | What the agent should use instead |
| `blockMessage` | Yes | Message shown to the agent when blocked |

### Pattern Tips

- Patterns are case-insensitive (`/i` flag)
- Use `(^|[;&|\\n])` to match command position (avoids false positives from strings inside scripts)
- The `exclude` field is checked first — use it to allow read-only variants (e.g., `docker ps`, `docker logs`)
- Keep patterns specific. Overly broad patterns will frustrate the agent and you.

## Example Rules

See `guardian-rules-examples.json` for a starter set:

- **docker-mutate** — Block raw docker mutations, allow read-only
- **git-in-workspace** — Block git operations in your workspace (if you use restic/other backup)
- **rm-workspace** — Block `rm -rf` on your workspace directory
- **sudo** — Block sudo (if your agent user shouldn't have it)

## Testing

Run the test suite:

```bash
node test-rules.cjs
```

This validates the regex patterns against known-good and known-bad inputs without needing the full OpenClaw runtime. Add your own test cases when you add rules.

## Config

The plugin supports one config option:

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

| Option | Default | Description |
|--------|---------|-------------|
| `verbose` | `false` | Log all evaluated tool calls, not just blocks |

## Design Principles

1. **Block, don't warn.** Warning tiers don't work — the agent ignores warnings the same way it ignores system prompts. Either block or don't.
2. **Rules in data, not code.** JSON rules can be auto-optimized by external harnesses (e.g., a Karpathy-style "edit one thing, measure one metric" loop).
3. **Managed path, always.** Every block must tell the agent what to do instead. A block without an alternative is just frustration.
4. **False positives are bugs.** If a legitimate operation gets blocked, fix the pattern. Don't add a "sometimes it's ok" tier.
5. **Audit everything.** Every block is logged with timestamp, session, rule, and the blocked command. You should know exactly what Guardian is doing.

## Architecture

Guardian is a single-file OpenClaw plugin (~180 lines). No dependencies, no external services.

```
guardian-rules.json  →  index.js (before_tool_call hook)  →  block or allow
                                       ↓
                              guardian.jsonl (audit log)
                              stats.json (cumulative counts)
```

The plugin registers one hook (`before_tool_call`) and evaluates rules on every tool call. Rules are cached for 1 minute to avoid repeated file reads.

## License

MIT
