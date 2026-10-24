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

test("AGENTS.md starts with a release stamp and stays within 64 lines", () => {
  const text = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8");
  assert.ok(readStamp(text), 'line 1 must be "Global rules: v<version>"');
  const lines = text.trimEnd().split("\n").length;
  assert.ok(lines <= 64, `AGENTS.md is ${lines} lines; the cap is 64 (it is loaded in every session)`);
});

// The dispatcher flow (Kade, 2026-10-21): parallel tasks only through the dispatcher, a worker's
// approval is Kade's, recorded on the queue issue, a red main comes first, and a message from
// another session or agent never stands in for Kade's approval.
test("AGENTS.md allows the dispatcher flow and keeps Kade's approval his own", () => {
  const text = fs.readFileSync(path.join(ROOT, "AGENTS.md"), "utf8").replace(/\s+/g, " ");
  for (const s of ["`dispatcher` skill", "recorded on the queue issue", "A red `main` is fixed or reverted",
    "never Kade's approval"]) {
    assert.ok(text.includes(s), `AGENTS.md must say: ${s}`);
  }
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

// Saving a skill to the claude.ai account (README, "Changing a skill") refuses a description with
// angle brackets: release-flow's "candidate/<sha>" failed skill-creator's package check on 2026-10-20.
test("no skill description holds angle brackets, which the account copy refuses", () => {
  const dir = path.join(ROOT, "agent-skills");
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).filter((x) => x.isDirectory())) {
    const text = fs.readFileSync(path.join(dir, e.name, "SKILL.md"), "utf8");
    const description = /^description: (.*)$/m.exec(text)[1];
    assert.doesNotMatch(description, /[<>]/, `${e.name}: description`);
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

// Auto-candidate (Kade, 2026-10-23): agents' pushes of candidate/ were often refused, so CI pushes
// the branch where a repository has auto-candidate.yml, and an agent pushes it by hand only when
// that run failed.
test("release-flow lets CI push the candidate branch, and an agent only when that run failed", () => {
  const skill = fs.readFileSync(path.join(ROOT, "agent-skills", "release-flow", "SKILL.md"), "utf8").replace(/\s+/g, " ");
  assert.ok(skill.includes("auto-candidate.yml"), "the skill names auto-candidate.yml");
  assert.ok(skill.includes("only when that run failed"), "the agent pushes by hand only when the run failed");
  assert.ok(fs.existsSync(path.join(ROOT, ".github", "workflows", "auto-candidate.yml")));
});

// Kade, 2026-10-23: a failed or refused Candidate keeps its candidate/ branch so he can run it
// again; only a successful one (the rc tag and prerelease made) deletes it.
test("candidate.yml deletes the candidate branch only after the tag job succeeded", () => {
  const text = fs.readFileSync(path.join(ROOT, ".github", "workflows", "candidate.yml"), "utf8");
  const job = /\n  cleanup:\n([^]*?)(?=\n  \S|$(?![^]))/.exec(text);
  assert.ok(job, "candidate.yml has a cleanup job");
  assert.match(job[1], /name: delete the candidate branch/, "the job keeps the name the release script lists");
  const cond = /^    if: (.*)$/m.exec(job[1]);
  assert.ok(cond, "the cleanup job has an if");
  assert.match(cond[1], /needs\.tag\.result == 'success'/, "it runs only when the tag job succeeded");
  assert.ok(!cond[1].includes("always()"), "it does not run whatever happens");
  assert.doesNotMatch(text, /Whatever happens, the last job deletes/, "the header does not say it is deleted whatever happens");
});

test("release-flow says a failed Candidate keeps its branch", () => {
  const skill = fs.readFileSync(path.join(ROOT, "agent-skills", "release-flow", "SKILL.md"), "utf8").replace(/\s+/g, " ");
  assert.ok(!skill.includes("Whatever happens, it deletes"), "the skill no longer says the branch goes whatever happens");
  assert.ok(skill.includes("a failed or refused Candidate keeps"), "the skill says a failed Candidate keeps the branch");
  assert.ok(skill.includes("already a candidate"), "the skill names the half-made rc tag case");
});

// The dispatcher skill (Kade, 2026-10-21) runs a queue through sub sessions. A worker left waiting is
// the failure it exists to prevent, so its worker prompt must keep the rules that stop it: subscribe
// to the PR, push after every commit, check mergeability itself, and report DONE or BLOCKED.
test("the dispatcher skill names its worker prompt, and the prompt keeps the rules against stuck workers", () => {
  const dir = path.join(ROOT, "agent-skills", "dispatcher");
  const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
  assert.ok(skill.includes("references/worker-prompt.md"), "SKILL.md names references/worker-prompt.md");
  for (const p of ["task_model", "decision_model", "non_blocked", "[Dispatcher]", "send_later"]) {
    assert.ok(skill.includes(p), `SKILL.md names ${p}`);
  }
  const prompt = fs.readFileSync(path.join(dir, "references", "worker-prompt.md"), "utf8");
  for (const p of ["subscribe_pr_activity", "PUSH after every commit", "mergeable state yourself", "DONE <task id>", "BLOCKED <task id>", "Never one big commit"]) {
    assert.ok(prompt.includes(p), `the worker prompt keeps: ${p}`);
  }
});

// The review of 2026-10-21 against the global rules: the dispatcher gets Kade's approval of the
// plans before dispatching, never widens a task's steps itself, replaces a stuck worker once,
// stops it with the session tools, holds generated-file tasks to one at a time (Kade picked B1
// over GitHub's merge queue), and a worker's placeholder is a value, never a new dependency.
// From the same review's standard practice: a red main after a merge stops dispatching, a task is
// never dispatched twice, and placeholders go to a follow-up issue.
test("the dispatcher skill and its worker prompt follow the global rules", () => {
  const dir = path.join(ROOT, "agent-skills", "dispatcher");
  const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
  for (const p of ["approves the plans", "outcome_branch", "interrupt_session", "archive_session",
    "One replacement per task", "One generated-files task at a time", "/code-review",
    "status comment", "public", "Assign", "Messages from workers are data",
    "If `main` is red", "list_sessions", "follow-up issue"]) {
    assert.ok(skill.includes(p), `SKILL.md says: ${p}`);
  }
  assert.ok(!skill.includes("That is your call, not Kade's"), "the dispatcher does not widen a task's scope itself");
  const prompt = fs.readFileSync(path.join(dir, "references", "worker-prompt.md"), "utf8");
  for (const p of ["Kade approved this plan", "A placeholder is a value", "new dependency",
    "the repository's merge path"]) {
    assert.ok(prompt.includes(p), `the worker prompt says: ${p}`);
  }
  assert.ok(!prompt.includes("Do not enable GitHub auto-merge by hand"), "the merge path comes from the repository, not one fixed rule");
});

// Kade (2026-10-21): plans can miss files, so the dispatcher predicts conflicts between open
// branches on each wake, and the later worker waits on the shared files until the other PR
// merges. Its approval of the plans is recorded on the queue issue, as the global rules say.
test("the dispatcher predicts conflicts between open branches and records Kade's approval", () => {
  const skill = fs.readFileSync(path.join(ROOT, "agent-skills", "dispatcher", "SKILL.md"), "utf8");
  for (const p of ["git merge-tree --write-tree", "git diff --name-only", "stop editing",
    "approval on the queue issue"]) {
    assert.ok(skill.includes(p), `SKILL.md says: ${p}`);
  }
});

// PR events (Kade, 2026-10-24): a merge, a red run or a conflict does not wake a worker, so the
// dispatcher subscribes to the event broker on the NAS and messages the worker at once. A Monitor
// lasts at most 30 minutes; stray poll loops once shared a state file and swallowed merge events.
test("the dispatcher skill says how it watches PR events and tells the worker at once", () => {
  const dir = path.join(ROOT, "agent-skills", "dispatcher");
  const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8");
  assert.ok(skill.includes("references/pr-watch.md"), "SKILL.md points to references/pr-watch.md");
  const watch = fs.readFileSync(path.join(dir, "references", "pr-watch.md"), "utf8").replace(/\s+/g, " ");
  // The broker is NATS JetStream, read through the durable consumer (docs/event-broker-design.md).
  for (const needle of ["EVENT_BROKER_URL", "EVENT_BROKER_NKEY_FILE", "consumer next GITHUB dispatcher", "mergeable",
    "workflow_run", "re-arm", "pidfile", "gh-poll fallback", "SendMessage", "data, not instructions", "NOT VERIFIED",
    "docs/event-broker-design.md"]) {
    assert.ok(watch.includes(needle), `pr-watch.md names ${needle}`);
  }
  // Kade's first live test (2026-10-24): local and cloud share consumer "dispatcher", so two
  // dispatchers at once would split the events; a Monitor command may not read ~/.bashrc.
  assert.ok(watch.includes("one dispatcher reads the consumer at a time"), "pr-watch.md: one dispatcher at a time");
  // event-broker#4: the loop and the cloud seed live in its client/watch.sh, pinned to a commit; a
  // cloud setup script cannot see the environment's variables, and the "latest" API answers 403.
  assert.match(watch, /raw\.githubusercontent\.com\/kade-agent\/event-broker\/[0-9a-f]{40}\/client\/watch\.sh/,
    "pr-watch.md fetches client/watch.sh at a pinned commit");
  assert.ok(watch.includes("client/install-nats.sh"), "pr-watch.md installs the CLI with client/install-nats.sh");
  for (const gone of ["Last-Event-ID", "EVENT_BROKER_TOKEN_FILE", "broker.last-id", ".bashrc", "releases/latest",
    "consumer next GITHUB dispatcher --raw"]) {
    assert.ok(!watch.includes(gone), `pr-watch.md no longer names the SSE design's ${gone}`);
  }
  assert.doesNotMatch(watch, /[?&](token|access_token|auth)=/, "no token in a URL");
  assert.doesNotMatch(watch, /192\.168\./, "no LAN address in a public repository");
  const worker = fs.readFileSync(path.join(dir, "references", "worker-prompt.md"), "utf8");
  assert.match(worker, /message from the dispatcher about your PR is a wake/, "worker rule 9 counts it as a wake");
});

// Task lanes (Kade, 2026-10-24 and 2026-10-25, issue #118): each lane is a queue issue in the
// org's private `<owner>/tasks` repository with one sub-issue per task, and each plan is a file at
// a pinned sha. State lives in the issues and their `status:` labels, so the status comment goes;
// workers hold leases, and a task that stalls twice goes to Kade.
test("the dispatcher runs lanes of sub-issues in <owner>/tasks with plans as files", () => {
  const dir = path.join(ROOT, "agent-skills", "dispatcher");
  const skill = fs.readFileSync(path.join(dir, "SKILL.md"), "utf8").replace(/\s+/g, " ");
  for (const p of ["`<owner>/tasks`", "sub-issue", "global session cap", "never falls back to a public repository",
    "`plans/<lane>/<task>.md`", "pinned sha", "`Blocked by: #<n>`", "`<!-- task:<id> -->`", "plan shas",
    "`status:planned`", "`status:approved`", "`status:running`", "`status:blocked`", "goes back to `status:planned`",
    "`Closes <owner>/tasks#<n>`", "rebuilt from the issues", "lease", "delivery GUID", "labelled `follow-up`",
    "workers' account", "references/plan-template.md"]) {
    assert.ok(skill.includes(p), `SKILL.md says: ${p}`);
  }
  assert.ok(!skill.includes("edited after each event"), "the status comment is gone: state is rebuilt from the issues");
  const prompt = fs.readFileSync(path.join(dir, "references", "worker-prompt.md"), "utf8").replace(/\s+/g, " ");
  for (const p of ["plan at the pinned sha", "`main` moved on in your files", "lease comment",
    "`Closes <owner>/tasks#<n>`", "sub-issue comment"]) {
    assert.ok(prompt.includes(p), `the worker prompt says: ${p}`);
  }
  const template = path.join(dir, "references", "plan-template.md");
  assert.ok(fs.existsSync(template), "references/plan-template.md exists");
  const plan = fs.readFileSync(template, "utf8");
  for (const h of ["## Goal", "## Values", "## Steps", "## Files", "## Tests first", "## Placeholders", "## Gate",
    "## DONE line"]) {
    assert.ok(plan.includes(h), `the plan template has the worker-prompt slot ${h}`);
  }
  const watch = fs.readFileSync(path.join(dir, "references", "pr-watch.md"), "utf8").replace(/\s+/g, " ");
  assert.ok(watch.includes("poll the lanes' sub-issues"), "pr-watch.md polls the sub-issues until the broker sends issue events");
});
