// Run: node --test scripts/repo.test.cjs
// Checks on this repository itself (docs/global-rules-plan.md, section 5): nothing tracked can reach
// ~/.claude unless the allowlist lets it, and the setup script checks out what the allowlist allows.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");
const { readStamp, mergeSettings } = require("../hooks/global-sync.cjs");

const ROOT = path.join(__dirname, "..");
// Tracked but never deployed: the sparse checkout in ~/.claude leaves these out.
const DEV_ONLY = ["setup/", "scripts/", "docs/", ".github/", ".claude/", "README.md", "deploy-exclude"];

function git(args, input) {
  return execFileSync("git", ["-C", ROOT, ...args], { encoding: "utf8", input, stdio: ["pipe", "pipe", "pipe"] });
}

const tracked = git(["ls-files"]).split("\n").filter(Boolean);

// Tracked paths the deploy allowlist would ignore in ~/.claude.
function excluded(paths) {
  const exclude = path.join(ROOT, "deploy-exclude");
  try {
    return git(["-c", `core.excludesFile=${exclude}`, "check-ignore", "--no-index", "--stdin"], paths.join("\n"))
      .split("\n")
      .filter(Boolean);
  } catch (e) {
    if (e.status === 1) return []; // none ignored
    throw e;
  }
}

const devOnly = (f) => DEV_ONLY.some((d) => (d.endsWith("/") ? f.startsWith(d) : f === d));

test("every tracked file is either allowed in ~/.claude or development-only", () => {
  const ignored = new Set(excluded(tracked));
  const stray = tracked.filter((f) => ignored.has(f) && !devOnly(f));
  assert.deepStrictEqual(stray, [], "add these to deploy-exclude or DEV_ONLY, deliberately");
  const leaking = tracked.filter((f) => devOnly(f) && !ignored.has(f));
  assert.deepStrictEqual(leaking, [], "development-only files the allowlist would let into ~/.claude");
});

test("the setup script checks out exactly the allowed top-level paths", () => {
  const script = fs.readFileSync(path.join(ROOT, "setup", "cloud-setup.sh"), "utf8");
  const sparse = /sparse-checkout set --no-cone (.+)/.exec(script)[1].trim().split(/\s+/);
  const deployable = tracked.filter((f) => !devOnly(f));
  for (const f of deployable) {
    assert.ok(
      sparse.some((p) => (p.endsWith("/") ? `/${f}`.startsWith(p) : `/${f}` === p)),
      `${f} is allowed but not in the setup script's sparse-checkout list`
    );
  }
});

// The AGENTS.md move (docs/agent-migration-plan.md, step 7): a machine set up from any script must
// check AGENTS.md out, and the allowlist must let it be tracked in ~/.claude.
test("the three setup scripts check out the same paths, AGENTS.md among them", () => {
  const lists = ["cloud-setup.sh", "local-setup.sh", "local-setup.ps1"].map((name) => {
    const script = fs.readFileSync(path.join(ROOT, "setup", name), "utf8");
    return [name, /sparse-checkout set --no-cone (.+?)\s*(\\|$)/m.exec(script)[1].trim().split(/\s+/)];
  });
  for (const [name, list] of lists) {
    assert.ok(list.includes("/AGENTS.md"), `${name}: /AGENTS.md in the sparse-checkout list`);
    assert.deepStrictEqual(list, lists[0][1], `${name} checks out what ${lists[0][0]} does`);
  }
  assert.deepStrictEqual(excluded(["AGENTS.md", "CLAUDE.md"]), [], "deploy-exclude allows both rules files");
});

// Step 9: global-sync copies the skills and the rules link for the other agents from ~/.claude, so
// a newly set-up machine must check out what an updated one gets from global-sync.
test("the three setup scripts check out agents.json and agent-skills/, and the allowlist lets them in", () => {
  for (const name of ["cloud-setup.sh", "local-setup.sh", "local-setup.ps1"]) {
    const script = fs.readFileSync(path.join(ROOT, "setup", name), "utf8");
    const list = /sparse-checkout set --no-cone (.+?)\s*(\\|$)/m.exec(script)[1].trim().split(/\s+/);
    for (const p of ["/agents.json", "/agent-skills/"]) assert.ok(list.includes(p), `${name}: ${p} in the sparse-checkout list`);
  }
  assert.deepStrictEqual(excluded(["agents.json", "agent-skills/repo-workflow/SKILL.md"]), []);
});

test("AGENTS.md starts with a release stamp and stays within 60 lines", () => {
  const text = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  assert.ok(readStamp(text), 'line 1 must be "Global rules: v<version>"');
  const lines = text.trimEnd().split("\n").length;
  assert.ok(lines <= 60, `AGENTS.md is ${lines} lines; the cap is 60 (it is loaded in every session)`);
});

// Claude Code reads CLAUDE.md, not AGENTS.md: the shim imports the rules and holds nothing else.
test("CLAUDE.md is the one line @AGENTS.md", () => {
  const text = fs.readFileSync(path.join(ROOT, "CLAUDE.md"), "utf8").replace(/\r\n/g, "\n");
  assert.strictEqual(text, "@AGENTS.md\n");
});

// The rules for every agent (docs/agent-migration-plan.md, step 8, decisions 2 and 6): each agent
// authors its own commits and has its own branch prefix.
test("AGENTS.md names each agent's commit author and branch prefix", () => {
  const text = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  for (const s of ["Claude <noreply@anthropic.com>", "Antigravity <antigravity@noreply.invalid>", "claude/<task>", "agent/<task>"]) {
    assert.ok(text.includes(s), `AGENTS.md must name ${s}`);
  }
});

// Repositories move to AGENTS.md one by one (step 11), so a rule naming CLAUDE.md names AGENTS.md too.
test("every line of AGENTS.md that names CLAUDE.md also names AGENTS.md", () => {
  const lines = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8").split("\n");
  const bare = lines.map((l, i) => [i + 1, l]).filter(([, l]) => l.includes("CLAUDE.md") && !l.includes("AGENTS.md"));
  assert.deepStrictEqual(bare, []);
});

// The global rule on GitHub workflows, applied to this repository's own.
test("workflows grant nothing at the top and keep no credentials after checkout", () => {
  const dir = path.join(ROOT, ".github", "workflows");
  for (const name of fs.readdirSync(dir)) {
    const text = fs.readFileSync(path.join(dir, name), "utf8");
    assert.match(text, /^permissions: \{\}$/m, `${name}: top-level "permissions: {}"`);
    const checkouts = text.match(/uses: actions\/checkout@\S+[^]*?(?=\n\s*- |\n\S|$)/g) || [];
    for (const step of checkouts) {
      assert.match(step, /persist-credentials: false/, `${name}: actions/checkout needs persist-credentials: false`);
    }
    for (const [, ref] of text.matchAll(/uses: [\w.-]+\/[\w.-]+@(\S+)/g)) {
      assert.match(ref, /^v\d+$/, `${name}: pin actions to a major version (got @${ref})`);
    }
  }
});

// Plan step 5: context-guard runs from ~/.claude/hooks for every repository, so settings.global.json
// must register it, and every command must point there (global-sync owns what does).
test("settings.global.json registers global-sync and context-guard from $HOME/.claude/hooks", () => {
  const fragment = JSON.parse(fs.readFileSync(path.join(ROOT, "settings.global.json"), "utf8"));
  const commands = (event, matcher) =>
    (fragment.hooks[event] || [])
      .filter((g) => g.matcher === matcher)
      .flatMap((g) => g.hooks.map((h) => h.command));
  assert.deepStrictEqual(commands("SessionStart", "startup"), ['node "$HOME/.claude/hooks/global-sync.cjs"']);
  assert.deepStrictEqual(commands("SessionStart", "compact"), ['node "$HOME/.claude/hooks/context-guard.cjs"']);
  assert.deepStrictEqual(commands("UserPromptSubmit", undefined), ['node "$HOME/.claude/hooks/context-guard.cjs"']);
  for (const groups of Object.values(fragment.hooks)) {
    for (const h of groups.flatMap((g) => g.hooks)) {
      assert.match(h.command, /\$HOME\/\.claude\/hooks\//, `${h.command}: must point into ~/.claude/hooks`);
      assert.ok(fs.existsSync(path.join(ROOT, "hooks", /hooks\/(\S+?)"/.exec(h.command)[1])), `${h.command}: no such hook`);
    }
  }
  const once = mergeSettings({ hooks: { Stop: [{ hooks: [{ type: "command", command: "foreign" }] }] } }, fragment);
  assert.deepStrictEqual(mergeSettings(structuredClone(once), fragment), once, "merging twice must change nothing");
  assert.strictEqual(once.hooks.Stop.length, 1, "foreign hooks stay");
});

// The reports' repository was renamed kade-agent/code-quality-assurance on 2026-10-14.
test("no tracked file names the reports' repository by its old name", () => {
  const old = /kade-agent\\?\/governance\b/; // also inside a regular expression
  const found = [];
  for (const f of tracked) {
    const full = path.join(ROOT, f);
    if (!fs.statSync(full).isFile()) continue;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      if (old.test(line)) found.push(`${f}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(found, []);
});

// This repository and the skills' moved to kade-agent on 2026-10-15 (agent-migration-plan.md,
// step 2). The dated plans and the review snapshot keep the names they had when written.
const HISTORY = new Set([
  "docs/agent-migration-plan.md",
  "docs/global-rules-plan.md",
  "docs/governance-plan.md",
  "docs/refactor-plan.md",
  "docs/repo-rules-review.html",
]);
test("no tracked file outside the dated plans names this repository or the skills' by the old owner", () => {
  const old = /enjay27\\?\/claude-(global|skills)\b/; // also inside a regular expression
  const found = [];
  for (const f of tracked) {
    if (HISTORY.has(f)) continue;
    const full = path.join(ROOT, f);
    if (!fs.statSync(full).isFile()) continue;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      if (old.test(line)) found.push(`${f}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(found, []);
});

// The code graph skill and its bundle were removed on 2026-10-16: on resonance-stream git grep
// found every caller and every dependant of three merged PRs, the graph 39% and 4 of 12.
test("no tracked file outside the dated plans names the removed code graph skill", () => {
  const old = /code-(graph|review-graph)\b|\bcg\.cjs\b/;
  const found = [];
  for (const f of tracked) {
    if (HISTORY.has(f)) continue;
    const full = path.join(ROOT, f);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) continue;
    fs.readFileSync(full, "utf8").split("\n").forEach((line, i) => {
      if (old.test(line)) found.push(`${f}:${i + 1}`);
    });
  }
  assert.deepStrictEqual(found, []);
});

// Step 4: the skills live in agent-skills/<name>/SKILL.md. Claude Code and Antigravity both need
// front matter with a description; Claude's name must match the folder.
test("every skill in agent-skills/ has front matter naming its folder and a description", () => {
  const dir = path.join(ROOT, "agent-skills");
  const names = fs.readdirSync(dir, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name);
  assert.ok(names.length > 0, "agent-skills/ holds no skill");
  for (const name of names) {
    const text = fs.readFileSync(path.join(dir, name, "SKILL.md"), "utf8");
    const front = /^---\n([^]*?)\n---\n/.exec(text);
    assert.ok(front, `${name}: SKILL.md starts with front matter between --- lines`);
    // YAML values may be quoted.
    assert.match(front[1], new RegExp(`^name: ("?)${name}\\1$`, "m"), `${name}: name must be the folder's`);
    assert.match(front[1], /^description: "?[^\s"]/m, `${name}: description must not be empty`);
  }
});

// Releases follow one global skill in every repository (Kade, 2026-10-18): a version PR into main, a
// PR from main into rc that the agent opens, then Kade's manual Release run on rc. The rules must send
// every release there, and the skill must exist, so no repository needs its own release text.
test("AGENTS.md sends every release to the release-flow skill, and the skill exists", () => {
  const rules = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  const precedence = /## Precedence\n([^]*?)\n## /.exec(rules)[1].replace(/\s+/g, " ");
  assert.match(precedence, /`release-flow` for every release/, "the Precedence section names release-flow");
  assert.ok(fs.existsSync(path.join(ROOT, "agent-skills", "release-flow", "SKILL.md")),
    "agent-skills/release-flow/SKILL.md exists");
});

// The candidate flow (docs/release-flow-plan.md, step 4): the agent pushes candidate/<12-character
// sha> at a commit on main, Kade runs Candidate, then Promote on rc/<rc tag>. The skill describes
// the flow and no longer the PR from main into rc. AGENTS.md sends every release to the skill
// (Precedence, tested above) and has no room for the branch (60 lines), so the skill names it as
// the one branch an agent pushes outside claude/<task>, never pushed to again.
test("release-flow describes Candidate and Promote, and the candidate branch an agent pushes once", () => {
  const skill = fs.readFileSync(path.join(ROOT, "agent-skills", "release-flow", "SKILL.md"), "utf8").replace(/\s+/g, " ");
  for (const needle of ["candidate/<12-character sha>", "rc/<rc tag>", "Actions > Candidate", "Actions > Promote", "candidate-guard.yml"]) {
    assert.ok(skill.includes(needle), `the skill names ${needle}`);
  }
  for (const gone of ["--base rc", "PR from main into rc", "pull request from main into rc", "Release on rc"]) {
    assert.ok(!skill.includes(gone), `the skill no longer says ${gone}`);
  }
  assert.ok(skill.includes("never pushed to again"), "the skill keeps the candidate branch immutable");
  assert.ok(skill.includes("outside `claude/<task>`"), "the skill names it as the exception to the Branches rule");
});
