// Run: node --test scripts/release.test.cjs
"use strict";

const test = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const r = require("./release.cjs");

test("nextTag is the date, or the date with a counter when it is taken", () => {
  assert.strictEqual(r.nextTag("2026-10-12", []), "v2026.10.12");
  assert.strictEqual(r.nextTag("2026-10-12", ["v2026.10.09"]), "v2026.10.12");
  assert.strictEqual(r.nextTag("2026-10-12", ["v2026.10.12"]), "v2026.10.12.2");
  assert.strictEqual(r.nextTag("2026-10-12", ["v2026.10.12", "v2026.10.12.2"]), "v2026.10.12.3");
});

test("nextTag refuses a date before the latest release", () => {
  assert.throws(() => r.nextTag("2026-10-01", ["v2026.10.12"]), /older than the latest release/);
});

test("setStamp writes line 1 and keeps the rest", () => {
  assert.strictEqual(r.setStamp("Global rules: v2026.10.09\n\nA rule.\n", "v2026.10.12"), "Global rules: v2026.10.12\n\nA rule.\n");
  assert.strictEqual(r.setStamp("A rule.\n", "v2026.10.12"), "Global rules: v2026.10.12\n\nA rule.\n");
});

function git(cwd, ...args) {
  return execFileSync("git", ["-C", cwd, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function release(cwd, ...args) {
  return execFileSync(process.execPath, [path.join(__dirname, "release.cjs"), ...args], {
    cwd,
    env: { ...process.env, RELEASE_DATE: "2026-10-12" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
}

// A release starts from one origin, one clone on main, one release v2026.10.09.
function released() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "release-"));
  const origin = path.join(root, "origin.git");
  const dev = path.join(root, "dev");
  git(root, "init", "-q", "--bare", "-b", "main", origin);
  git(root, "clone", "-q", origin, dev);
  git(dev, "symbolic-ref", "HEAD", "refs/heads/main");
  git(dev, "config", "user.email", "t@t");
  git(dev, "config", "user.name", "t");
  // Laid out as after the AGENTS.md move: the rules in AGENTS.md, CLAUDE.md the one line @AGENTS.md.
  fs.writeFileSync(path.join(dev, "AGENTS.md"), "Global rules: v2026.10.09\n\nA rule.\n");
  fs.writeFileSync(path.join(dev, "CLAUDE.md"), "@AGENTS.md\n");
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", "first");
  git(dev, "tag", "v2026.10.09");
  git(dev, "push", "-q", "origin", "main", "v2026.10.09");
  return { origin, dev };
}

test("prepare and tag are gone: a release is Candidate, then Promote", () => {
  const { dev } = released();
  assert.throws(() => release(dev, "prepare", "x"), /usage: release\.cjs next \| rc <tag> \| stamp <tag> \|/);
  assert.throws(() => release(dev, "tag"), /usage: release\.cjs next \| rc <tag> \| stamp <tag> \|/);
});

// next, stamp and latest, as Candidate (.github/workflows/candidate.yml) runs them.
function rcCheckout() {
  const { dev } = released();
  fs.writeFileSync(path.join(dev, "AGENTS.md"), "Global rules: v2026.10.09\n\nA rule.\nAnother rule.\n");
  git(dev, "commit", "-q", "-am", "second rule");
  return dev;
}

// What the workflow's tag job does with the API: a commit with the stamp whose parent is HEAD.
// A candidate's tag is <stamp>-rc.N.
function tagStampedChild(dev, tag, stampTag = tag.replace(/-rc\.\d+$/, "")) {
  const head = git(dev, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(dev, "AGENTS.md"), r.setStamp(fs.readFileSync(path.join(dev, "AGENTS.md"), "utf8"), stampTag));
  git(dev, "add", "AGENTS.md");
  const tree = git(dev, "write-tree");
  const commit = git(dev, "commit-tree", tree, "-p", head, "-m", `Release ${tag}`);
  git(dev, "tag", tag, commit);
  git(dev, "checkout", "-q", "--", ".");
  git(dev, "reset", "-q", "--hard", head);
}

test("next prints the tag for today, with a counter when today is taken", () => {
  const dev = rcCheckout();
  assert.strictEqual(release(dev, "next").trim(), "v2026.10.12");
  git(dev, "tag", "v2026.10.12", "HEAD~1");
  assert.strictEqual(release(dev, "next").trim(), "v2026.10.12.2");
});

test("next refuses a commit that is already released as a stamped child", () => {
  const dev = rcCheckout();
  tagStampedChild(dev, "v2026.10.12");
  assert.throws(() => release(dev, "next"), /already released as v2026\.10\.12/);
});

test("stamp writes the tag into line 1 of AGENTS.md and nothing else", () => {
  const dev = rcCheckout();
  release(dev, "stamp", "v2026.10.12");
  assert.strictEqual(fs.readFileSync(path.join(dev, "AGENTS.md"), "utf8"), "Global rules: v2026.10.12\n\nA rule.\nAnother rule.\n");
  assert.strictEqual(git(dev, "status", "--porcelain", "--untracked-files=all"), "M AGENTS.md");
});

test("stamp refuses a name that is not a release tag", () => {
  const dev = rcCheckout();
  assert.throws(() => release(dev, "stamp", "2026.10.12"), /not a release tag/);
});

test("latest prints the highest release tag, ignoring other v tags", () => {
  const dev = rcCheckout();
  git(dev, "tag", "v0.0.0-probe");
  git(dev, "tag", "v2026.10.09.2");
  assert.strictEqual(release(dev, "latest").trim(), "v2026.10.09.2");
});

// The candidate flow (docs/release-flow-plan.md, sections 3 and 5): Candidate tags the stamped
// commit <final>-rc.N, Promote adds <final> on the same commit.

test("nextTag reuses a date that has only candidates, and rc tags never count as releases", () => {
  assert.strictEqual(r.nextTag("2026-10-12", ["v2026.10.12-rc.1"]), "v2026.10.12");
  assert.strictEqual(r.nextTag("2026-10-12", ["v2026.10.12", "v2026.10.12.2-rc.1"]), "v2026.10.12.2");
  const { latestRelease } = require("../hooks/global-sync.cjs");
  assert.strictEqual(latestRelease(["v2026.10.09", "v2026.10.12-rc.1"]), "v2026.10.09", "global-sync ignores rc tags");
});

test("rcTag is the next candidate number of a version", () => {
  assert.strictEqual(r.rcTag("v2026.10.12", []), "v2026.10.12-rc.1");
  assert.strictEqual(r.rcTag("v2026.10.12", ["v2026.10.12-rc.1", "v2026.10.12-rc.2", "v2026.10.12.2-rc.5"]), "v2026.10.12-rc.3");
  assert.throws(() => r.rcTag("v2026.10.12-rc.1", []), /not a release tag/);
});

test("checkMain wants refs/heads/main and nothing else", () => {
  assert.doesNotThrow(() => r.checkMain("refs/heads/main"));
  for (const ref of ["refs/heads/candidate/0123456789ab", "refs/heads/claude/x", "refs/heads/rc/v1-rc.1", "refs/tags/v1", "main", ""]) {
    assert.throws(() => r.checkMain(ref), /a candidate is made from refs\/heads\/main only/, ref);
  }
});

test("checksPassed wants at least one finished check run, none failed, this run's own left out", () => {
  const run = (name, status, conclusion, id = 1) => ({ name, status, conclusion, details_url: `https://github.com/o/r/actions/runs/${id}/job/9` });
  assert.doesNotThrow(() => r.checksPassed([run("test", "completed", "success"), run("guard", "completed", "skipped")], "7"));
  assert.doesNotThrow(() => r.checksPassed([run("test", "completed", "success"), run("stamp and test", "in_progress", null, 7)], "7"));
  assert.throws(() => r.checksPassed([run("stamp and test", "in_progress", null, 7)], "7"), /no check run/);
  assert.throws(() => r.checksPassed([run("test", "in_progress", null)], "7"), /test: in_progress/);
  for (const c of ["failure", "timed_out", "cancelled", "action_required"]) {
    assert.throws(() => r.checksPassed([run("test", "completed", c)], "7"), new RegExp(`test: ${c}`));
  }
});

test("checkPromote wants the highest rc of a new version whose commit carries that version's stamp", () => {
  const tags = ["v2026.10.09", "v2026.10.12-rc.1", "v2026.10.12-rc.2"];
  const stamp = "Global rules: v2026.10.12";
  assert.strictEqual(r.checkPromote("v2026.10.12-rc.2", tags, stamp), "v2026.10.12");
  assert.throws(() => r.checkPromote("v2026.10.12", tags, stamp), /not a candidate tag/);
  assert.throws(() => r.checkPromote("v2026.10.12-rc.1", tags, stamp), /v2026\.10\.12-rc\.2 is newer/);
  assert.throws(() => r.checkPromote("v2026.10.12-rc.2", [...tags, "v2026.10.12"], stamp), /already released/);
  assert.throws(() => r.checkPromote("v2026.10.12-rc.2", [...tags, "v2026.10.13"], stamp), /not above the latest release v2026\.10\.13/);
  assert.throws(() => r.checkPromote("v2026.10.12-rc.2", tags, "Global rules: v2026.10.11"), /line 1 of AGENTS\.md/);
});

test("next refuses a commit that is already a candidate", () => {
  const dev = rcCheckout();
  tagStampedChild(dev, "v2026.10.12-rc.1");
  assert.throws(() => release(dev, "next"), /already a candidate as v2026\.10\.12-rc\.1/);
});

test("rc and check-promote read the repository's tags and the candidate's AGENTS.md", () => {
  const dev = rcCheckout();
  assert.strictEqual(release(dev, "rc", "v2026.10.12").trim(), "v2026.10.12-rc.1");
  tagStampedChild(dev, "v2026.10.12-rc.1");
  assert.strictEqual(release(dev, "rc", "v2026.10.12").trim(), "v2026.10.12-rc.2");
  assert.strictEqual(release(dev, "check-promote", "v2026.10.12-rc.1").trim(), "v2026.10.12");
});

test("check-main takes the ref from the command line", () => {
  const { dev } = released();
  assert.doesNotThrow(() => release(dev, "check-main", "refs/heads/main"));
  assert.throws(() => release(dev, "check-main", "refs/heads/candidate/0123456789ab"), /main only/);
  assert.throws(() => release(dev, "check-candidate", "x"), /usage: release\.cjs/);
});

test("check-changes refuses with nothing to release, and lists what main brings otherwise", () => {
  const { dev } = released();
  assert.throws(() => release(dev, "check-changes"), /nothing to release/);
  fs.mkdirSync(path.join(dev, "docs"));
  fs.writeFileSync(path.join(dev, "docs", "plan.md"), "plan\n");
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", "docs");
  assert.throws(() => release(dev, "check-changes"), /nothing to release/);
  fs.writeFileSync(path.join(dev, "CLAUDE.md"), "@AGENTS.md\n\n");
  git(dev, "commit", "-q", "-am", "rules");
  assert.strictEqual(release(dev, "check-changes"), "CLAUDE.md\n");
});

// A candidate that failed leaves its check runs on the main commit; a new Candidate run at the
// same commit must not be refused for them, nor for a guard run of an earlier push there.
test("checksPassed leaves out the candidate workflows' own jobs from any run", () => {
  const run = (name, conclusion, id) => ({ name, status: "completed", conclusion, details_url: `https://github.com/o/r/actions/runs/${id}/job/9` });
  assert.doesNotThrow(() => r.checksPassed([
    run("test", "success", 1),
    run("check, stamp and test", "failure", 2),
    run("rc tag and prerelease", "success", 2),
    run("rc branch unchanged", "failure", 3),
  ], "7"));
  assert.throws(() => r.checksPassed([run("check, stamp and test", "success", 2)], "7"), /no check run/);
});

test("the job names checksPassed leaves out are the candidate workflows' jobs", () => {
  const text = ["candidate.yml", "candidate-guard.yml"]
    .map((f) => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", f), "utf8"))
    .join("\n");
  const names = [...text.matchAll(/^ {4}name: (.+)$/gm)].map((m) => m[1]);
  assert.deepStrictEqual([...r.CANDIDATE_JOBS].sort(), names.sort());
});

// Promote runs from a branch rc/<rc tag>, which Candidate makes at the rc tag's commit: the
// GitHub app lists branches only (Kade, 2026-10-20). The tag stays the record; the branch is a
// handle, deleted once superseded or released. rc/ became free when Kade deleted the rc branch.
test("rcOfBranch reads the rc tag out of rc/<rc tag> and refuses anything else", () => {
  assert.strictEqual(r.rcOfBranch("rc/v2026.10.20-rc.1"), "v2026.10.20-rc.1");
  assert.strictEqual(r.rcOfBranch("rc/v0.0.1-rc.12"), "v0.0.1-rc.12");
  for (const b of ["candidate/v2026.10.20-rc.1", "candidate/0123456789ab", "rc/v2026.10.20", "main", "rc", "rc/v1-rc.x"]) {
    assert.throws(() => r.rcOfBranch(b), /not rc\/<rc tag>/, b);
  }
});

test("supersededBranches are the same version's rc branches below the new rc", () => {
  const branches = ["rc/v1.2.0-rc.1", "rc/v1.2.0-rc.2", "rc/v1.1.0-rc.4", "candidate/0123456789ab", "rc/v1.2.0-rc.3"];
  assert.deepStrictEqual(r.supersededBranches(branches, "v1.2.0-rc.3"), ["rc/v1.2.0-rc.1", "rc/v1.2.0-rc.2"]);
  assert.deepStrictEqual(r.supersededBranches([], "v1.2.0-rc.1"), []);
});

test("releasedBranches are the rc branches of the released version and every older one", () => {
  const branches = ["rc/v1.2.0-rc.1", "rc/v1.2.0-rc.2", "rc/v1.1.0-rc.4", "rc/v1.3.0-rc.1", "candidate/0123456789ab", "main"];
  assert.deepStrictEqual(r.releasedBranches(branches, "v1.2.0"), ["rc/v1.2.0-rc.1", "rc/v1.2.0-rc.2", "rc/v1.1.0-rc.4"]);
});

test("rc-branch, superseded and released read origin's rc/ branches", () => {
  const { dev } = released();
  git(dev, "fetch", "-q", "origin");
  git(dev, "push", "-q", "origin", "HEAD:refs/heads/rc/v2026.10.12-rc.1", "HEAD:refs/heads/rc/v2026.10.09.3-rc.1", "HEAD:refs/heads/rc/v2026.10.13-rc.1");
  assert.strictEqual(release(dev, "rc-branch", "rc/v2026.10.12-rc.1").trim(), "v2026.10.12-rc.1");
  assert.strictEqual(release(dev, "superseded", "v2026.10.12-rc.2").trim(), "rc/v2026.10.12-rc.1");
  assert.strictEqual(release(dev, "released", "v2026.10.12").trim(), "rc/v2026.10.09.3-rc.1 rc/v2026.10.12-rc.1");
});

// Candidate on main (docs/release-flow-plan.md, section 9.1): Candidate itself asks whether main has
// a file deployed to ~/.claude that the latest release has not (check-changes).
test("deployedPaths keeps the files deploy-exclude lets into ~/.claude", () => {
  const exclude = fs.readFileSync(path.join(__dirname, "..", "deploy-exclude"), "utf8");
  const files = [
    "AGENTS.md", "CLAUDE.md", "settings.global.json", "agents.json", ".gitattributes",
    "hooks/global-sync.cjs", "rules/x.md", "agent-skills/release-flow/SKILL.md",
    "rules/local-pc.md", "README.md", "docs/release-flow-plan.md", "scripts/release.cjs",
    ".github/workflows/test.yml", ".claude/CLAUDE.md", "setup/local-setup.sh", "deploy-exclude",
  ];
  assert.deepStrictEqual(r.deployedPaths(files, exclude), files.slice(0, 8));
});

test("should-candidate prints the deployed files changed since the latest release, nothing else", () => {
  const { dev } = released();
  assert.strictEqual(release(dev, "should-candidate"), "");
  fs.mkdirSync(path.join(dev, "docs"));
  fs.writeFileSync(path.join(dev, "docs", "plan.md"), "plan\n");
  git(dev, "add", "-A");
  git(dev, "commit", "-q", "-m", "docs");
  assert.strictEqual(release(dev, "should-candidate"), "");
  fs.writeFileSync(path.join(dev, "CLAUDE.md"), "@AGENTS.md\n\n");
  git(dev, "commit", "-q", "-am", "rules");
  assert.strictEqual(release(dev, "should-candidate"), "CLAUDE.md\n");
});

// A release tag is a stamped commit whose parent is on main: its AGENTS.md line 1 differs from
// main's, which is not a change to release.
test("should-candidate compares main with the main commit the latest release was stamped on", () => {
  const { dev } = released();
  const base = git(dev, "rev-parse", "HEAD");
  fs.writeFileSync(path.join(dev, "AGENTS.md"), "Global rules: v2026.10.12\n\nA rule.\n");
  git(dev, "commit", "-q", "-am", "stamp");
  git(dev, "tag", "v2026.10.12");
  git(dev, "checkout", "-q", base);
  assert.strictEqual(release(dev, "should-candidate"), "");
});
