#!/usr/bin/env node
// release: the commands the release workflows run (docs/release-flow-plan.md, sections 3 and 5;
// docs/global-rules-plan.md, section 6). A pushed release tag reaches every session at its next
// start, so only a workflow makes one: Candidate (.github/workflows/candidate.yml) tags a stamped
// commit <final>-rc.N and makes the branch rc/<final>-rc.N; Promote (promote.yml), run on that
// branch, adds <final> on the same commit.
//
//   next              the final tag for today (vYYYY.MM.DD, or .2, .3 once that date is
//                     released); refuses a HEAD already released or a candidate as the parent
//                     of a stamped commit
//   rc T              the next candidate tag of the final tag T: T-rc.1, T-rc.2, ...
//   stamp T           writes "Global rules: T" into line 1 of AGENTS.md in the working tree
//   latest            the highest release tag, or nothing
//   check-candidate B refuses unless B is candidate/<12-character sha of HEAD>, HEAD is on
//                     origin/main and origin has no other candidate/* branch
//   checks-passed ID  reads a commit's check runs (the API's JSON) on stdin; refuses unless one
//                     ran, all finished and none failed, leaving out run ID's own jobs and the
//                     candidate workflows' jobs from any run
//   check-promote R   refuses unless R is the highest rc tag of a new version whose commit's
//                     AGENTS.md line 1 is that version; prints the final tag
//   rc-branch B       the rc tag of a branch rc/<rc tag>, which Candidate makes at the tag's
//                     commit for Promote to run from (the GitHub app lists no tags)
//   superseded R      origin's rc branches of R's version below R, space-separated
//   released T        origin's rc branches of version T and every older one, space-separated
//
// Tests for this file set RELEASE_DATE.
"use strict";

const fs = require("fs");
const { execFileSync } = require("child_process");
const { compareVersions, latestRelease } = require("../hooks/global-sync.cjs");

function nextTag(date, tags) {
  const base = "v" + date.replace(/-/g, ".");
  const latest = latestRelease(tags);
  if (latest && compareVersions(base, latest.split(".").slice(0, 3).join(".")) < 0) {
    throw new Error(`${base} is older than the latest release ${latest}; check the clock`);
  }
  if (!tags.includes(base)) return base;
  let n = 2;
  while (tags.includes(`${base}.${n}`)) n++;
  return `${base}.${n}`;
}

const CANDIDATE = /^(v\d+(?:\.\d+)*)-rc\.(\d+)$/;
// The jobs of candidate.yml and candidate-guard.yml: their check runs on a main commit, from this
// run or an earlier candidate there, are not the commit's CI.
const CANDIDATE_JOBS = new Set([
  "check, stamp and test",
  "rc tag and prerelease",
  "delete the candidate branch",
  "candidate branch unchanged",
]);
const FAILED = new Set(["failure", "timed_out", "cancelled", "action_required", "stale", "startup_failure"]);

function candidates(final, tags) {
  return tags
    .map((t) => CANDIDATE.exec(t))
    .filter((m) => m && m[1] === final)
    .map((m) => Number(m[2]));
}

function rcTag(final, tags) {
  if (!final || latestRelease([final]) !== final) throw new Error(`${final || "(none)"} is not a release tag`);
  return `${final}-rc.${Math.max(0, ...candidates(final, tags)) + 1}`;
}

const RC_BRANCH = /^rc\/(v\d+(?:\.\d+)*-rc\.\d+)$/;

function rcOfBranch(branch) {
  const m = RC_BRANCH.exec(branch || "");
  if (!m) throw new Error(`${branch || "(none)"} is not rc/<rc tag>`);
  return m[1];
}

function rcBranches(branches) {
  return branches
    .map((b) => [b, RC_BRANCH.exec(b)])
    .filter(([, m]) => m)
    .map(([b, m]) => [b, CANDIDATE.exec(m[1])]);
}

function supersededBranches(branches, rc) {
  const [, final, n] = CANDIDATE.exec(rc);
  return rcBranches(branches)
    .filter(([, m]) => m[1] === final && Number(m[2]) < Number(n))
    .map(([b]) => b);
}

function releasedBranches(branches, final) {
  return rcBranches(branches)
    .filter(([, m]) => compareVersions(m[1], final) <= 0)
    .map(([b]) => b);
}

function checkCandidate(branch, head, onMain, others) {
  const m = /^candidate\/([0-9a-f]{12})$/.exec(branch);
  if (!m) throw new Error(`${branch} is not candidate/<12-character sha>`);
  if (!head.startsWith(m[1])) throw new Error(`${branch} names ${m[1]}, not HEAD ${head}`);
  if (!onMain) throw new Error(`${head} is not on origin/main`);
  if (others.length) throw new Error(`${others.join(", ")} is left over; Kade deletes it first`);
}

function checksPassed(runs, runId) {
  const own = `/actions/runs/${runId}/`;
  const others = runs.filter((c) => !String(c.details_url || "").includes(own) && !CANDIDATE_JOBS.has(c.name));
  if (!others.length) throw new Error("no check run on this commit besides this run");
  const bad = others
    .filter((c) => c.status !== "completed" || FAILED.has(c.conclusion))
    .map((c) => `${c.name}: ${c.status === "completed" ? c.conclusion : c.status}`);
  if (bad.length) throw new Error(`checks not passed: ${bad.join("; ")}`);
}

function checkPromote(rc, tags, stampLine) {
  const m = CANDIDATE.exec(rc || "");
  if (!m) throw new Error(`${rc || "(none)"} is not a candidate tag vX-rc.N`);
  const final = m[1];
  const highest = Math.max(...candidates(final, tags), Number(m[2]));
  if (highest > Number(m[2])) throw new Error(`${final}-rc.${highest} is newer than ${rc}`);
  if (tags.includes(final)) throw new Error(`${final} is already released`);
  const latest = latestRelease(tags);
  if (latest && compareVersions(final, latest) <= 0) {
    throw new Error(`${final} is not above the latest release ${latest}`);
  }
  if (stampLine !== `Global rules: ${final}`) {
    throw new Error(`line 1 of AGENTS.md at ${rc} is '${stampLine}', not 'Global rules: ${final}'`);
  }
  return final;
}

function setStamp(text, tag) {
  const line = `Global rules: ${tag}`;
  return /^Global rules: /.test(text) ? text.replace(/^[^\n]*/, line) : `${line}\n\n${text}`;
}

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function today() {
  return process.env.RELEASE_DATE || new Date().toISOString().slice(0, 10);
}

function releaseTags() {
  return git("tag", "-l", "v*").split("\n").filter(Boolean);
}

function next() {
  const head = git("rev-parse", "HEAD");
  const tags = releaseTags();
  for (const t of tags) {
    let parent;
    try {
      parent = git("rev-parse", "-q", "--verify", `${t}^{commit}^`);
    } catch {
      continue; // a root commit has no parent
    }
    if (parent === head && latestRelease([t]) === t) {
      throw new Error(`${head} is already released as ${t}`);
    }
    if (parent === head && CANDIDATE.test(t)) {
      throw new Error(`${head} is already a candidate as ${t}`);
    }
  }
  return nextTag(today(), tags);
}

function stamp(tag) {
  if (!tag || latestRelease([tag]) !== tag) {
    throw new Error(`${tag || "(none)"} is not a release tag`);
  }
  fs.writeFileSync("AGENTS.md", setStamp(fs.readFileSync("AGENTS.md", "utf8"), tag));
}

function originBranches(pattern) {
  return git("ls-remote", "--heads", "origin", pattern)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("refs/heads/")[1]);
}

function checkCandidateHere(branch) {
  const head = git("rev-parse", "HEAD");
  let onMain = true;
  try {
    git("merge-base", "--is-ancestor", head, "origin/main");
  } catch {
    onMain = false;
  }
  const others = originBranches("candidate/*").filter((b) => b !== branch);
  checkCandidate(branch, head, onMain, others);
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    process.chdir(git("rev-parse", "--show-toplevel"));
    if (cmd === "next") console.log(next());
    else if (cmd === "rc") console.log(rcTag(rest[0], releaseTags()));
    else if (cmd === "stamp") stamp(rest[0]);
    else if (cmd === "latest") console.log(latestRelease(releaseTags()) || "");
    else if (cmd === "check-candidate") checkCandidateHere(rest[0] || "");
    else if (cmd === "checks-passed") checksPassed(JSON.parse(fs.readFileSync(0, "utf8")).check_runs || [], rest[0]);
    else if (cmd === "check-promote") {
      const line = git("show", `${rest[0]}^{commit}:AGENTS.md`).split("\n")[0];
      console.log(checkPromote(rest[0], releaseTags(), line));
    } else if (cmd === "rc-branch") console.log(rcOfBranch(rest[0]));
    else if (cmd === "superseded") console.log(supersededBranches(originBranches("rc/*"), rcOfBranch(`rc/${rest[0]}`)).join(" "));
    else if (cmd === "released") {
      if (!rest[0] || latestRelease([rest[0]]) !== rest[0]) throw new Error(`${rest[0] || "(none)"} is not a release tag`);
      console.log(releasedBranches(originBranches("rc/*"), rest[0]).join(" "));
    } else {
      throw new Error("usage: release.cjs next | rc <tag> | stamp <tag> | latest | check-candidate <branch> | checks-passed <run id> | check-promote <rc tag> | rc-branch <branch> | superseded <rc tag> | released <tag>");
    }
  } catch (e) {
    console.error(`release: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { nextTag, setStamp, rcTag, checkCandidate, checksPassed, checkPromote, CANDIDATE_JOBS, rcOfBranch, supersededBranches, releasedBranches };
