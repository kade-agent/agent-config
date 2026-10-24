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
//   check-main REF    refuses unless REF is refs/heads/main: a candidate is made from main only
//   check-changes     should-candidate, refusing with "nothing to release" when it prints no file
//   checks-passed ID  reads a commit's check runs (the API's JSON) on stdin; refuses unless one
//                     ran, all finished and none failed, leaving out run ID's own jobs and the
//                     candidate workflows' jobs from any run
//   check-promote R   refuses unless R is the highest rc tag of a new version whose commit's
//                     AGENTS.md line 1 is that version; prints the final tag
//   rc-branch B       the rc tag of a branch rc/<rc tag>, which Candidate makes at the tag's
//                     commit for Promote to run from (the GitHub app lists no tags)
//   superseded R      origin's rc branches of R's version below R, space-separated
//   released T        origin's rc branches of version T and every older one, space-separated
//   should-candidate  the files deploy-exclude lets into ~/.claude that HEAD changed since the main
//                     commit of the latest release, one per line; nothing means no candidate
//                     (check-changes, in Candidate)
//
// Tests for this file set RELEASE_DATE.
"use strict";

const fs = require("fs");
const path = require("path");
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
  "rc branch unchanged",
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

function checkMain(ref) {
  if (ref !== "refs/heads/main") throw new Error(`a candidate is made from refs/heads/main only; this run is on ${ref || "(none)"}`);
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

// deploy-exclude is a git exclude file: last matching pattern wins, and nothing under an excluded
// directory comes back. Enough of gitignore for its own patterns: !, a trailing /, * and **.
function excludePatterns(text) {
  return text
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("#"))
    .map((l) => {
      const negate = l.startsWith("!");
      let p = negate ? l.slice(1) : l;
      const dirOnly = p.endsWith("/");
      if (dirOnly) p = p.slice(0, -1);
      const anchored = p.includes("/");
      const re = p
        .split(/(\*\*|\*|\?)/)
        .map((t) => (t === "**" ? ".*" : t === "*" ? "[^/]*" : t === "?" ? "[^/]" : t.replace(/[.+^${}()|[\]\\]/g, "\\$&")))
        .join("");
      return { negate, dirOnly, anchored, re: new RegExp(`^${re}$`) };
    });
}

function excluded(patterns, p, isDir) {
  let out = false;
  for (const x of patterns) {
    if (x.dirOnly && !isDir) continue;
    if (x.re.test(x.anchored ? p : p.split("/").pop())) out = !x.negate;
  }
  return out;
}

function deployedPaths(files, excludeText) {
  const patterns = excludePatterns(excludeText);
  return files.filter((f) => {
    const parts = f.split("/");
    for (let i = 1; i < parts.length; i++) {
      if (excluded(patterns, parts.slice(0, i).join("/"), true)) return false;
    }
    return !excluded(patterns, f, false);
  });
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

// A release tag is a stamped commit whose parent is on main; the merge base is that main commit.
function shouldCandidate() {
  const latest = latestRelease(releaseTags());
  const files = latest
    ? git("diff", "--name-only", git("merge-base", latest, "HEAD"), "HEAD")
    : git("ls-files");
  const exclude = fs.readFileSync(path.join(__dirname, "..", "deploy-exclude"), "utf8");
  return deployedPaths(files.split("\n").filter(Boolean), exclude);
}

function changesToRelease() {
  const files = shouldCandidate();
  if (!files.length) throw new Error("nothing to release: no file deployed to ~/.claude changed since the latest release");
  return files;
}

if (require.main === module) {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    process.chdir(git("rev-parse", "--show-toplevel"));
    if (cmd === "next") console.log(next());
    else if (cmd === "rc") console.log(rcTag(rest[0], releaseTags()));
    else if (cmd === "stamp") stamp(rest[0]);
    else if (cmd === "latest") console.log(latestRelease(releaseTags()) || "");
    else if (cmd === "check-main") checkMain(rest[0] || "");
    else if (cmd === "check-changes") console.log(changesToRelease().join("\n"));
    else if (cmd === "checks-passed") checksPassed(JSON.parse(fs.readFileSync(0, "utf8")).check_runs || [], rest[0]);
    else if (cmd === "check-promote") {
      const line = git("show", `${rest[0]}^{commit}:AGENTS.md`).split("\n")[0];
      console.log(checkPromote(rest[0], releaseTags(), line));
    } else if (cmd === "rc-branch") console.log(rcOfBranch(rest[0]));
    else if (cmd === "superseded") console.log(supersededBranches(originBranches("rc/*"), rcOfBranch(`rc/${rest[0]}`)).join(" "));
    else if (cmd === "released") {
      if (!rest[0] || latestRelease([rest[0]]) !== rest[0]) throw new Error(`${rest[0] || "(none)"} is not a release tag`);
      console.log(releasedBranches(originBranches("rc/*"), rest[0]).join(" "));
    } else if (cmd === "should-candidate") {
      const files = shouldCandidate();
      if (files.length) console.log(files.join("\n"));
    } else {
      throw new Error("usage: release.cjs next | rc <tag> | stamp <tag> | latest | check-main <ref> | check-changes | checks-passed <run id> | check-promote <rc tag> | rc-branch <branch> | superseded <rc tag> | released <tag> | should-candidate");
    }
  } catch (e) {
    console.error(`release: ${e.message}`);
    process.exit(1);
  }
}

module.exports = { nextTag, setStamp, rcTag, checkMain, checksPassed, checkPromote, CANDIDATE_JOBS, rcOfBranch, supersededBranches, releasedBranches, deployedPaths };
