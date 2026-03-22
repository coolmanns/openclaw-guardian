/**
 * Guardian rule test harness — runs test cases against the rule matching logic
 * Usage: NODE_PATH=~/.openclaw/extensions/guardian node projects/guardian/test-rules.cjs
 */

const { readFileSync } = require("fs");
const { resolve } = require("path");

const RULES_PATH = resolve(process.env.HOME, ".openclaw/extensions/guardian/guardian-rules.json");
const rules = JSON.parse(readFileSync(RULES_PATH, "utf8"));

function evaluateRules(toolName, params) {
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.tool !== toolName) continue;

    const value = params?.[rule.field] || params?.[rule.fallbackField] || "";
    if (!value) continue;

    if (rule.exclude) {
      const excludeRe = new RegExp(rule.exclude, "i");
      if (excludeRe.test(value)) continue;
    }

    const patternRe = new RegExp(rule.pattern, "i");
    if (patternRe.test(value)) {
      return { blocked: true, ruleId: rule.id };
    }
  }
  return { blocked: false };
}

// ─── Test Cases ───────────────────────────────────────────────────────────────
const tests = [
  // T1: Docker mutations — should BLOCK
  { id: "T1.1",  tool: "exec", params: { command: "docker stop martinball-ghost" },         expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.2",  tool: "exec", params: { command: "docker compose up -d" },                 expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.3",  tool: "exec", params: { command: "docker run -d nginx" },                  expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.4",  tool: "exec", params: { command: "docker rm -f container123" },             expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.5",  tool: "exec", params: { command: "docker build -t myimage ." },             expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.6",  tool: "exec", params: { command: "docker pull nginx:latest" },              expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.7",  tool: "exec", params: { command: "docker volume rm my_vol" },               expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.8",  tool: "exec", params: { command: "docker network create mynet" },           expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.9",  tool: "exec", params: { command: "docker compose -f stack.yml up -d" },     expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.10", tool: "exec", params: { command: "docker container stop foo" },              expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.11", tool: "exec", params: { command: "docker container prune" },                 expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.12", tool: "exec", params: { command: "docker system prune" },                    expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.13", tool: "exec", params: { command: "docker image prune" },                     expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.14", tool: "exec", params: { command: "docker ps && docker stop foo" },           expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.15", tool: "exec", params: { command: "docker start ghost-1" },                   expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.16", tool: "exec", params: { command: "docker kill ghost-1" },                    expect: "BLOCK", rule: "docker-mutate" },
  { id: "T1.17", tool: "exec", params: { command: "docker restart caddy-1" },                 expect: "BLOCK", rule: "docker-mutate" },

  // T2: Docker read-only — should ALLOW
  { id: "T2.1",  tool: "exec", params: { command: "docker ps" },                              expect: "ALLOW" },
  { id: "T2.2",  tool: "exec", params: { command: "docker ps -a --format json" },             expect: "ALLOW" },
  { id: "T2.3",  tool: "exec", params: { command: "docker logs martinball-ghost" },            expect: "ALLOW" },
  { id: "T2.4",  tool: "exec", params: { command: "docker logs --tail 50 ghost-1" },          expect: "ALLOW" },
  { id: "T2.5",  tool: "exec", params: { command: "docker inspect ghost-1" },                 expect: "ALLOW" },
  { id: "T2.6",  tool: "exec", params: { command: "docker images" },                          expect: "ALLOW" },
  { id: "T2.7",  tool: "exec", params: { command: "docker stats --no-stream" },               expect: "ALLOW" },
  { id: "T2.8",  tool: "exec", params: { command: "docker info" },                            expect: "ALLOW" },
  { id: "T2.9",  tool: "exec", params: { command: "docker version" },                         expect: "ALLOW" },
  { id: "T2.10", tool: "exec", params: { command: "docker exec ghost-db-1 cat /etc/mysql/conf.d/custom.cnf" }, expect: "ALLOW" },
  { id: "T2.11", tool: "exec", params: { command: "docker exec ghost-db-1 ls -la /var/lib/mysql" },            expect: "ALLOW" },
  { id: "T2.12", tool: "exec", params: { command: "docker exec ghost-db-1 tail -50 /var/log/mysql/error.log" }, expect: "ALLOW" },
  { id: "T2.13", tool: "exec", params: { command: "docker exec ghost-db-1 grep ERROR /var/log/mysql/error.log" }, expect: "ALLOW" },
  { id: "T2.14", tool: "exec", params: { command: "docker port ghost-1" },                    expect: "ALLOW" },
  { id: "T2.15", tool: "exec", params: { command: "docker top ghost-1" },                     expect: "ALLOW" },
  { id: "T2.16", tool: "exec", params: { command: "docker diff ghost-1" },                    expect: "ALLOW" },
  { id: "T2.17", tool: "exec", params: { command: "docker service ls" },                      expect: "ALLOW" },
  { id: "T2.18", tool: "exec", params: { command: "docker service logs myservice" },          expect: "ALLOW" },
  { id: "T2.19", tool: "exec", params: { command: "docker context ls" },                      expect: "ALLOW" },

  // T3: Non-docker tools — should ALLOW (no rules match)
  { id: "T3.1",  tool: "exec",    params: { command: "ls -la" },                              expect: "ALLOW" },
  { id: "T3.2",  tool: "exec",    params: { command: "node server.js" },                      expect: "ALLOW" },
  { id: "T3.3",  tool: "write",   params: { file_path: "~/clawd/test.txt" },                  expect: "ALLOW" },
  { id: "T3.4",  tool: "Read",    params: { file_path: "~/clawd/AGENTS.md" },                 expect: "ALLOW" },
  { id: "T3.5",  tool: "gateway", params: { action: "config.get" },                           expect: "ALLOW" },
  { id: "T3.6",  tool: "gateway", params: { action: "restart" },                              expect: "BLOCK" },
  { id: "T3.7",  tool: "exec",    params: { command: "curl http://localhost:8100" },           expect: "ALLOW" },

  // T4: Edge cases
  { id: "T4.1",  tool: "exec", params: { command: "echo 'docker stop test'" },                expect: "ALLOW" },
  { id: "T4.5",  tool: "exec", params: { command: "node -e \"docker compose up\"" },          expect: "ALLOW" },
  { id: "T4.6",  tool: "exec", params: { command: "cd ~/clawd && node -e 'docker run'" },     expect: "ALLOW" },
  { id: "T4.2",  tool: "exec", params: {},                                                     expect: "ALLOW" },
  { id: "T4.3",  tool: "exec", params: { command: "" },                                        expect: "ALLOW" },
  { id: "T4.4",  tool: "exec", params: { command: "DOCKER_HOST=tcp://localhost docker ps" },   expect: "ALLOW" },

  // T5: Skill MD protection — should BLOCK Write/Edit to skill docs
  { id: "T5.1",  tool: "Write", params: { file_path: "/home/coolmann/clawd/skill-docs/komodo/SKILL.md" },           expect: "BLOCK" },
  { id: "T5.2",  tool: "Write", params: { file_path: "/home/coolmann/clawd/skill-docs/komodo/INDEX.md" },           expect: "BLOCK" },
  { id: "T5.3",  tool: "Edit",  params: { file_path: "/home/coolmann/clawd/skill-docs/postiz/SKILL.md" },           expect: "BLOCK" },
  { id: "T5.4",  tool: "Write", params: { path: "skill-docs/himalaya/SKILL.md" },                                   expect: "BLOCK" },
  { id: "T5.5",  tool: "Edit",  params: { path: "~/clawd/skill-docs/grepai/SKILL.md" },                             expect: "BLOCK" },
  { id: "T5.6",  tool: "Write", params: { file_path: "/home/coolmann/.openclaw/skills/generated/komodo.md" },        expect: "BLOCK" },
  { id: "T5.7",  tool: "Write", params: { file_path: "/home/coolmann/.openclaw/skills/generated/postiz.MD" },        expect: "BLOCK" },
  { id: "T5.8",  tool: "Edit",  params: { file_path: "/home/coolmann/.openclaw/skills/komodo/SKILL.md" },            expect: "BLOCK" },

  // T6: Skill MD protection — should ALLOW non-skill paths
  { id: "T6.1",  tool: "Write", params: { file_path: "/home/coolmann/clawd/projects/guardian/SPEC.md" },             expect: "ALLOW" },
  { id: "T6.2",  tool: "Edit",  params: { file_path: "/home/coolmann/clawd/AGENTS.md" },                             expect: "ALLOW" },
  { id: "T6.3",  tool: "Write", params: { file_path: "/home/coolmann/clawd/projects/skillgraph/PROJECT.md" },        expect: "ALLOW" },
  { id: "T6.4",  tool: "Write", params: { file_path: "/home/coolmann/clawd/projects/ghost-staging/PROJECT.md" },     expect: "ALLOW" },
  { id: "T6.5",  tool: "Edit",  params: { file_path: "/home/coolmann/clawd/MEMORY.md" },                             expect: "ALLOW" },
  { id: "T6.6",  tool: "Write", params: { file_path: "/home/coolmann/clawd/projects/skillgraph/enrich-komodo.cjs" }, expect: "ALLOW" },
  { id: "T6.7",  tool: "exec",  params: { command: "cat skill-docs/komodo/SKILL.md" },                               expect: "ALLOW" },
  { id: "T6.8",  tool: "Read",  params: { file_path: "/home/coolmann/clawd/skill-docs/komodo/SKILL.md" },            expect: "ALLOW" },

  // T7: Himalaya — block write/forward/delete, allow read
  { id: "T7.1",  tool: "exec",  params: { command: "himalaya write" },                                               expect: "BLOCK" },
  { id: "T7.2",  tool: "exec",  params: { command: "himalaya message write" },                                        expect: "BLOCK" },
  { id: "T7.3",  tool: "exec",  params: { command: "himalaya forward 12345" },                                        expect: "BLOCK" },
  { id: "T7.4",  tool: "exec",  params: { command: "himalaya message forward 12345" },                                expect: "BLOCK" },
  { id: "T7.5",  tool: "exec",  params: { command: "himalaya delete 12345" },                                         expect: "BLOCK" },
  { id: "T7.6",  tool: "exec",  params: { command: "himalaya message delete 12345" },                                 expect: "BLOCK" },
  { id: "T7.7",  tool: "exec",  params: { command: "himalaya move 12345 Trash" },                                     expect: "ALLOW" },
  { id: "T7.8",  tool: "exec",  params: { command: "himalaya copy 12345 Archive" },                                   expect: "BLOCK" },
  { id: "T7.9",  tool: "exec",  params: { command: "himalaya flag set 12345 seen" },                                  expect: "ALLOW" },
  { id: "T7.10", tool: "exec",  params: { command: "himalaya save draft.eml" },                                       expect: "BLOCK" },
  // T7: Himalaya — should ALLOW read operations
  { id: "T7.11", tool: "exec",  params: { command: "himalaya envelope list -a icloud -s 10" },                        expect: "ALLOW" },
  { id: "T7.12", tool: "exec",  params: { command: "himalaya message read -a icloud 91915" },                         expect: "ALLOW" },
  { id: "T7.13", tool: "exec",  params: { command: "himalaya envelope list -a icloud -w \"subject:invoice\"" },       expect: "ALLOW" },
  { id: "T7.14", tool: "exec",  params: { command: "himalaya account list" },                                         expect: "ALLOW" },
  { id: "T7.15", tool: "exec",  params: { command: "himalaya folder list" },                                          expect: "ALLOW" },

  // T8: Gateway restart — should BLOCK direct restart paths
  { id: "T8.1",  tool: "exec",    params: { command: "openclaw gateway restart" },                                    expect: "BLOCK" },
  { id: "T8.2",  tool: "exec",    params: { command: "systemctl restart openclaw" },                                  expect: "BLOCK" },
  { id: "T8.3",  tool: "exec",    params: { command: "sudo systemctl restart openclaw" },                             expect: "BLOCK" },
  { id: "T8.4",  tool: "exec",    params: { command: "systemctl stop openclaw" },                                     expect: "BLOCK" },
  { id: "T8.5",  tool: "gateway", params: { action: "restart" },                                                      expect: "BLOCK" },
  { id: "T8.6",  tool: "gateway", params: { action: "config.apply" },                                                 expect: "BLOCK" },

  // T9: Gateway — should ALLOW non-restart actions
  { id: "T9.1",  tool: "gateway", params: { action: "config.get" },                                                   expect: "ALLOW" },
  { id: "T9.2",  tool: "gateway", params: { action: "config.schema.lookup" },                                         expect: "ALLOW" },
  { id: "T9.3",  tool: "gateway", params: { action: "config.patch" },                                                 expect: "ALLOW" },
  { id: "T9.4",  tool: "gateway", params: { action: "update.run" },                                                   expect: "ALLOW" },
  { id: "T9.5",  tool: "exec",    params: { command: "openclaw gateway status" },                                     expect: "ALLOW" },
  { id: "T9.6",  tool: "exec",    params: { command: "openclaw status" },                                             expect: "ALLOW" },
  { id: "T9.7",  tool: "exec",    params: { command: "openclaw config validate" },                                    expect: "ALLOW" },

  // ── T10: Lobster self-approve ──────────────────────────────
  { id: "T10.1", tool: "lobster", params: { action: "resume", token: "abc123", approve: true },                        expect: "BLOCK" },
  { id: "T10.2", tool: "lobster", params: { action: "resume", token: "abc123", approve: false },                       expect: "BLOCK" },
  { id: "T10.3", tool: "lobster", params: { action: "run", pipeline: "workflows/gateway-restart.yaml" },               expect: "ALLOW" },
  { id: "T10.4", tool: "lobster", params: { action: "run", pipeline: "workflows/something-else.yaml" },                expect: "ALLOW" },
];

// ─── Run Tests ────────────────────────────────────────────────────────────────
let pass = 0, fail = 0;
const failures = [];

for (const t of tests) {
  const result = evaluateRules(t.tool, t.params);
  const got = result.blocked ? "BLOCK" : "ALLOW";
  const ok = got === t.expect;

  if (ok) {
    pass++;
  } else {
    fail++;
    failures.push({
      id: t.id,
      expected: t.expect,
      got,
      ruleId: result.ruleId || null,
      command: t.params?.command?.substring(0, 80) || t.params?.action || "(no command)",
    });
  }
}

console.log(`\nGuardian Rule Tests: ${pass} pass / ${fail} fail (of ${tests.length})\n`);

if (failures.length > 0) {
  console.log("FAILURES:");
  for (const f of failures) {
    console.log(`  ❌ ${f.id}  expected=${f.expected} got=${f.got}  rule=${f.ruleId}  cmd="${f.command}"`);
  }
}

process.exit(fail > 0 ? 1 : 0);
