/**
 * Guardian — Structural enforcement plugin for OpenClaw
 *
 * Blocks raw paths that have managed alternatives.
 * Rules defined in guardian-rules.json. No warnings, no escalation — block means block.
 *
 * Hook: before_tool_call → evaluate rules → block or allow
 */

import { readFileSync, appendFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { resolve as pathResolve, dirname } from "path";

// ─── Paths ────────────────────────────────────────────────────────────────────
const HOME = process.env.HOME || "/home/coolmann";
const PLUGIN_DIR = dirname(new URL(import.meta.url).pathname);
const RULES_PATH = pathResolve(PLUGIN_DIR, "guardian-rules.json");
const LOG_DIR = pathResolve(HOME, ".openclaw/guardian");
const LOG_PATH = pathResolve(LOG_DIR, "guardian.jsonl");
const STATS_PATH = pathResolve(LOG_DIR, "stats.json");

// ─── Timezone ─────────────────────────────────────────────────────────────────
const TZ = "America/Chicago";

function localIso() {
  const now = new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t)?.value || "00";
  return `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}`;
}

// ─── Rules Loading ────────────────────────────────────────────────────────────
let rulesCache = null;
let rulesCacheTime = 0;
const RULES_CACHE_TTL = 60_000; // 1 minute — fast enough for dev, no file watcher needed

function loadRules() {
  const now = Date.now();
  if (rulesCache && (now - rulesCacheTime) < RULES_CACHE_TTL) {
    return rulesCache;
  }
  try {
    const raw = readFileSync(RULES_PATH, "utf8");
    rulesCache = JSON.parse(raw);
    rulesCacheTime = now;
    return rulesCache;
  } catch (err) {
    console.error(`[guardian] Failed to load rules: ${err.message}`);
    return rulesCache || []; // fall back to last good cache, or empty
  }
}

// ─── Stats ────────────────────────────────────────────────────────────────────
let stats = { totalBlocks: 0, byRule: {}, lastBlock: null, since: localIso() };

function loadStats() {
  try {
    if (existsSync(STATS_PATH)) {
      stats = JSON.parse(readFileSync(STATS_PATH, "utf8"));
    }
  } catch {
    // start fresh
  }
}

function saveStats() {
  try {
    writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
  } catch (err) {
    console.error(`[guardian] Failed to save stats: ${err.message}`);
  }
}

// ─── Logging ──────────────────────────────────────────────────────────────────
function logBlock(entry) {
  try {
    appendFileSync(LOG_PATH, JSON.stringify(entry) + "\n");
  } catch (err) {
    console.error(`[guardian] Failed to write log: ${err.message}`);
  }
}

// ─── Rule Evaluation ──────────────────────────────────────────────────────────
function evaluateRules(toolName, params) {
  const rules = loadRules();

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.tool !== toolName) continue;

    // Get the value to test
    const value = params?.[rule.field] || params?.[rule.fallbackField] || "";
    if (!value) continue;

    // Check exclusions first (allow list takes priority)
    if (rule.exclude) {
      try {
        const excludeRe = new RegExp(rule.exclude, "i");
        if (excludeRe.test(value)) continue;
      } catch (err) {
        console.error(`[guardian] Bad exclude regex in rule ${rule.id}: ${err.message}`);
      }
    }

    // Check pattern (block list)
    try {
      const patternRe = new RegExp(rule.pattern, "i");
      if (patternRe.test(value)) {
        return {
          blocked: true,
          ruleId: rule.id,
          blockMessage: rule.blockMessage,
          managedPath: rule.managedPath,
          description: rule.description,
        };
      }
    } catch (err) {
      console.error(`[guardian] Bad pattern regex in rule ${rule.id}: ${err.message}`);
    }
  }

  return { blocked: false };
}

// ─── Plugin Entry ─────────────────────────────────────────────────────────────
export default {
  id: "guardian",
  name: "Guardian",

  register(api) {
    // Ensure log directory exists
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }

    // Load persisted stats
    loadStats();

    // Validate rules on startup
    const rules = loadRules();
    const enabledCount = rules.filter((r) => r.enabled).length;
    console.log(`[guardian] Loaded ${rules.length} rules (${enabledCount} enabled)`);

    for (const rule of rules) {
      try {
        new RegExp(rule.pattern, "i");
        if (rule.exclude) new RegExp(rule.exclude, "i");
      } catch (err) {
        console.error(`[guardian] Invalid regex in rule ${rule.id}: ${err.message}`);
      }
    }

    if (!api.on) {
      console.warn("[guardian] api.on not available — hooks not registered");
      return;
    }

    // ─── before_tool_call — the enforcement point ─────────────────────
    api.on("before_tool_call", (event, ctx) => {
      const { toolName, params } = event;

      const result = evaluateRules(toolName, params);

      if (result.blocked) {
        const sessionKey = ctx?.sessionKey || "__unknown__";
        const paramValue = params?.[
          loadRules().find((r) => r.id === result.ruleId)?.field
        ] || "";

        // Update stats
        stats.totalBlocks++;
        stats.byRule[result.ruleId] = (stats.byRule[result.ruleId] || 0) + 1;
        stats.lastBlock = localIso();
        saveStats();

        // Log the block
        logBlock({
          ts: localIso(),
          sessionKey,
          ruleId: result.ruleId,
          tool: toolName,
          paramValue: paramValue.substring(0, 500),
          managedPath: result.managedPath,
        });

        console.log(`[guardian] BLOCKED ${toolName} — rule: ${result.ruleId} — ${paramValue.substring(0, 100)}`);

        return {
          block: true,
          blockReason: `${result.blockMessage}\n\nManaged path: ${result.managedPath}`,
        };
      }

      return {};
    });

    console.log("[guardian] Registered before_tool_call enforcement hook");
  },
};
