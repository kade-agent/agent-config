// Run: node --test scripts/pr-body.test.cjs
// The PR body convention (agent-config#165): fixed first lines and headings, so a check can enforce
// them and the dispatcher reads a merged PR with a parse instead of a model helper.
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const path = require("path");
const { execFileSync } = require("child_process");

const SCRIPT = path.join(__dirname, "..", "agent-skills", "repo-workflow", "scripts", "pr-body.cjs");
const { check, extract } = require(SCRIPT);

const SHA = "0123456789abcdef0123456789abcdef01234567";
const GOOD = `Closes stella-rain/tasks#145
Task: GUIDE-MSGID · Plan: plans/app/guide-msgid.md@${SHA}

## What changed and why
The Guide body is three scene Labels.

## Verified
- \`./gradlew test\`: 312 passed

## NOT VERIFIED
- NOT VERIFIED: device check: needs an Android phone
- NOT VERIFIED: \`cmd:verify-needs-windows\`: the PC is offline

## Kade's steps
- [ ] Merge the draft
- [x] Run \`setup.ps1\` on the PC

## Follow-ups
- ADR 12 says two Labels; this uses three
- Rename \`GuideScene\`

## Placeholders
- Label padding 8 dp

## Wrong turns
None

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_x
`;

const NONE = `Closes kade-agent/agent-config#165
Task: none

## What changed and why
A fix.

## Verified
- \`node --test\`: pass

## NOT VERIFIED
None

## Kade's steps
None

## Follow-ups
None

## Placeholders
None

## Wrong turns
None
`;

const errors = (body, opts) => check(body, opts);

test("a body in the convention passes, with CRLF line ends too", () => {
  assert.deepStrictEqual(errors(GOOD), []);
  assert.deepStrictEqual(errors(GOOD.replace(/\n/g, "\r\n")), []);
  assert.deepStrictEqual(errors(NONE), []);
});

test("the first line names the issue with its repository, never a bare #n", () => {
  assert.ok(errors(GOOD.replace("Closes stella-rain/tasks#145", "Closes #145")).some((e) => /line 1/.test(e)));
  assert.ok(errors("\n" + GOOD).some((e) => /line 1/.test(e)));
  assert.deepStrictEqual(errors(GOOD.replace("Closes stella-rain/tasks#145", "Closes stella-rain/tasks#145, stella-rain/app#7")), []);
  assert.deepStrictEqual(errors(GOOD.replace("Closes stella-rain/tasks#145", "Part of kade-agent/agent-config#165")), []);
});

test("the second line is the task, and the plan at its full sha", () => {
  assert.ok(errors(GOOD.replace(/^Task: .*$/m, "Plan: x")).some((e) => /line 2/.test(e)));
  assert.ok(errors(GOOD.replace(SHA, SHA.slice(0, 7))).some((e) => /line 2/.test(e)));
  assert.deepStrictEqual(errors(GOOD.replace(/^Task: .*$/m, "Task: GUIDE-MSGID")), []);
});

test("a public repository's body names no plan path", () => {
  assert.ok(errors(GOOD, { public: true }).some((e) => /public/.test(e)));
  assert.deepStrictEqual(errors(GOOD.replace(/^Task: .*$/m, "Task: GUIDE-MSGID"), { public: true }), []);
});

test("every heading is present, in order, with no other level-2 heading", () => {
  assert.ok(errors(GOOD.replace("## Placeholders\n- Label padding 8 dp\n\n", "")).some((e) => /Placeholders/.test(e)));
  const swapped = GOOD.replace("## Verified", "## TMP").replace("## What changed and why", "## Verified").replace("## TMP", "## What changed and why");
  assert.ok(errors(swapped).some((e) => /order/.test(e)));
  assert.ok(errors(GOOD.replace("## Wrong turns", "## Decisions taken\nx\n\n## Wrong turns")).some((e) => /Decisions taken/.test(e)));
  // A heading inside a code fence is text.
  assert.deepStrictEqual(errors(GOOD.replace("The Guide body is three scene Labels.", "```\n## Verified\n```")), []);
});

test("an empty section says None", () => {
  assert.ok(errors(NONE.replace("## Follow-ups\nNone", "## Follow-ups\n")).some((e) => /Follow-ups.*None/.test(e)));
});

test("each NOT VERIFIED item is one NOT VERIFIED: <gate>: <reason> line", () => {
  assert.ok(errors(GOOD.replace("- NOT VERIFIED: device check: needs an Android phone", "- device check: needs a phone")).some((e) => /NOT VERIFIED/.test(e)));
  assert.ok(errors(GOOD.replace("- NOT VERIFIED: device check: needs an Android phone", "- NOT VERIFIED: device check")).some((e) => /NOT VERIFIED/.test(e)));
});

test("Kade's steps is a checklist", () => {
  assert.ok(errors(GOOD.replace("- [ ] Merge the draft", "- Merge the draft")).some((e) => /Kade's steps/.test(e)));
});

test("extract returns the sections the dispatcher posts on a merge", () => {
  const got = extract(GOOD);
  assert.deepStrictEqual(got.errors, []);
  assert.deepStrictEqual(got.closes, ["stella-rain/tasks#145"]);
  assert.equal(got.task, "GUIDE-MSGID");
  assert.equal(got.plan, `plans/app/guide-msgid.md@${SHA}`);
  assert.deepStrictEqual(got.notVerified, [
    { gate: "device check", reason: "needs an Android phone" },
    { gate: "`cmd:verify-needs-windows`", reason: "the PC is offline" },
  ]);
  assert.deepStrictEqual(got.kadesSteps, [
    { done: false, text: "Merge the draft" },
    { done: true, text: "Run `setup.ps1` on the PC" },
  ]);
  assert.deepStrictEqual(got.followUps, ["ADR 12 says two Labels; this uses three", "Rename `GuideScene`"]);
  assert.deepStrictEqual(got.placeholders, ["Label padding 8 dp"]);
  assert.equal(got.wrongTurns, "None", "the footer is not part of the last section");
  const none = extract(NONE);
  assert.equal(none.task, null);
  assert.deepStrictEqual([none.notVerified, none.kadesSteps, none.followUps, none.placeholders], [[], [], [], []]);
});

test("the command line checks a body from stdin or a file, and exits 1 on an error", () => {
  assert.equal(execFileSync("node", [SCRIPT, "check"], { input: GOOD, encoding: "utf8" }), "");
  assert.throws(() => execFileSync("node", [SCRIPT, "check", "--public"], { input: GOOD, stdio: "pipe" }), (e) => e.status === 1);
  const json = JSON.parse(execFileSync("node", [SCRIPT, "extract"], { input: GOOD, encoding: "utf8" }));
  assert.equal(json.task, "GUIDE-MSGID");
});
