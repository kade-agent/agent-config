# Plan: releases from an immutable candidate branch, tagged -rc.N, then promoted

- **Scope:** how every release is made in Kade's repositories (the `release-flow` skill), and
  agent-config's own release workflows as the first repository moved onto it.
- **Status:** **accepted** (2026-10-20, by Kade, in the merge of #95). Kade answered the open
  questions the same day (decisions 5 to 8). Section 6 is built step by step from here, each
  step one PR.
- **Revision proposed 2026-10-24** (section 9): Candidate runs on `main`, so no `candidate/*`
  branch is pushed at all, and a version already released becomes the next patch instead of
  being refused. Accepted by Kade in the merge of its PR; until then sections 3 to 6 hold.
- **Replaces:** the `rc` flow of `agent-skills/release-flow/SKILL.md` (Kade, 2026-10-18) and
  section 6 of `docs/global-rules-plan.md` where it describes the Release run on `rc`.
- **Decided by Kade, 2026-10-20:**
  1. Option B of the brief in section 2: no long-lived `rc` branch; a release candidate is a
     `-rc.N` tag and a prerelease; the final release is promoted from it, not rebuilt.
  2. Kade does not type a SHA. The agent pushes a branch at the proposed commit and Kade runs
     **Candidate** on that branch from the Actions dropdown.
  3. Once created, nobody pushes to or merges into that branch. Candidate deletes it when the
     candidate was made; a failed or refused run keeps it, so Kade can run Candidate again on it
     (Kade, 2026-10-23).
  4. The four adjustments of section 3 (the commit is on `main`; the branch kept immutable;
     deletion in a job that always runs; Promote run from the rc tag).
  5. A cloud session may push `candidate/*` (Kade, answering open question 1).
  6. **No new rulesets**: Kade works alone. A workflow keeps `candidate/*` immutable in every
     repository (section 4); the `v*` tag rulesets that exist today stay.
  7. **Signed update feeds stay**, built once (section 5a).
  8. Candidate's "CI passed" check needs no check name per repository: every check run on the
     commit has finished, none failed, at least one ran (section 3).
  9. **Promote runs on a branch `rc/<rc tag>`**, not on the tag: the GitHub mobile app lists
     branches only. Candidate makes that branch at the rc tag's commit; the tag stays the
     record, the branch is a handle that Promote checks against it. Candidate deletes the
     version's lower rc branches; Promote deletes the released version's and every older one's.
     The branch an agent pushes is `candidate/<12-character sha>` in every repository; `rc/`
     holds only what can be promoted. `rc/` needs the old `rc` branch gone (git cannot hold
     `rc` and `rc/x`): Kade deleted it after promoting `v2026.10.20`. (Kade, during step 3.)

## 1. The problem

Today: a version PR into `main`, a PR from `main` into `rc` that the agent opens, then Kade's
Release run on `rc`, which tags `rc`'s head.

What already holds: `workflow_dispatch` fixes `GITHUB_SHA` when Kade clicks Run, and the run
tags that commit; `v*` tags cannot be moved or deleted; fixes always go to `main`, so nothing is
back-merged from `rc`.

What does not:

1. The open PR from `main` into `rc` follows `main`, so what Kade reads is not fixed until he
   merges it.
2. Nothing ties the release to what Kade tried: if `rc` moves between his test of the candidate
   build and his click on Release, the release takes the new head.
3. Where a candidate is built (resonance-stream's candidate exe), the release builds again from
   source instead of publishing the binary Kade tried.
4. `rc` is a long-lived, mutable branch whose only job is to point at a commit; a tag does that
   and cannot move.

**Not a fix here:** triggering the release on a tag push. In agent-config a pushed `v*` tag is
the deploy (`global-sync` moves every session to it), and the tag must name the stamped commit,
so a workflow creates the tags, never a person or an agent.

## 2. The options (brief of 2026-10-20)

| | A. Keep `rc`, check the tested SHA | **B. Candidate tag on a `main` commit, then promote** | C. `release/vX.Y.Z` branches |
|---|---|---|---|
| Fixes | 2 | 1 to 4 | 1 to 4 |
| Upkeep | Least change; keeps `rc`, its PR, `release-checks.yml`, its rulesets | Removes all four; adds a check that the final tag is on the rc tag's commit | A branch and back-ports per release, for one maintainer whose fixes go to `main` |

Kade chose **B**. A hotfix to a released version while `main` has moved on is the one case for
C: a `release/vX.Y` branch is cut from that version's tag then, under its own plan.

## 3. The flow

```
main --(1) version PR--> main
     --(2) agent: candidate/<12-character sha> at that main commit
     --(3) Kade: Actions > Candidate on that branch --> tag v<version>-rc.N + prerelease
                 + branch rc/v<version>-rc.N; the sha branch deleted
     --(4) Kade tries the prerelease, then Actions > Promote on branch rc/v<version>-rc.N
                 --> tag v<version> + release; the rc branches of that version and older deleted
```

1. **Version PR into `main`**, as today. The version is Kade's. agent-config skips this step:
   its version is computed (`vYYYY.MM.DD`, `.2` later the same day).
2. **The candidate branch.** After step 1 has merged, the agent fetches `main`, checks that
   `main`'s CI is green on the merge commit, and pushes a branch at that commit, adding no commit
   of its own: `git push origin <sha>:refs/heads/candidate/<12-character sha>`. It waits for the
   guard's run on that push to pass, then tells Kade: "Actions > Candidate > Run workflow >
   branch `candidate/<12-character sha>`". Where the repository has `auto-candidate.yml`, CI
   pushes the branch instead and the agent pushes it only when that run failed (section 4a).
3. **Candidate** (`candidate.yml`, `workflow_dispatch`). It refuses unless:
   - it runs on `refs/heads/candidate/<12-character sha>`, and the sha is the commit's;
   - the commit is on `origin/main`, and its checks passed: at least one check run, every
     check run finished, none `failure`, `timed_out`, `cancelled` or `action_required`
     (the jobs of Candidate and the guard left out, from any run), so no repository names its
     checks;
   - no other `candidate/<sha>` branch exists (a left-over one is reported, not reused);
   - the version is above every final `v*` tag and has no final tag yet;
   - the branch head still equals `GITHUB_SHA`, read through the API at the start and again just
     before the tag is created.

   It then builds and tests once, creates the annotated tag `v<version>-rc.N` (N is one more
   than that version's highest rc tag) and a GitHub prerelease with the assets and a
   `SHA256SUMS` file, then the branch `rc/v<version>-rc.N` at the tag's commit, and
   deletes that version's lower rc branches (only the highest rc can be promoted). A last job,
   `if: needs.tag.result == 'success'`, deletes the `candidate/<sha>` branch only after the rc
   tag and prerelease were made. A failed or refused run keeps the branch, and Kade can run
   Candidate again on it (a failure that already made the rc tag is refused as "already a
   candidate" until Kade removes the half-made tag). A failure caused by `main` is fixed there
   and starts again at step 2; `auto-candidate.yml` deletes the kept branch when `main` gets a
   newer candidate.
4. **Promote** (`promote.yml`, `workflow_dispatch`). Kade runs it on the branch
   `rc/v<version>-rc.N`, so the workflow is read from the candidate's commit. The tag is
   the record and the branch a handle: Promote refuses unless the branch head is the rc tag's
   commit (read again before tagging), that tag is the version's highest rc tag, its prerelease
   exists and its assets match `SHA256SUMS`, and the version is still new. It creates the
   annotated tag `v<version>` on the same commit and the release with the same assets,
   downloaded from the prerelease, never rebuilt, and marks it latest. Then it deletes the rc
   branches of that version and every older one, so a candidate never promoted does not linger;
   a failed Promote deletes none and can run again. The prerelease and its tag stay as the
   record.

**Who does what:** the agent does steps 1 and 2 and reads the runs; Kade starts steps 3 and 4.
An agent never creates a tag or release, never starts a workflow, never pushes a
`rc/*` branch, never pushes to an existing `candidate/*` branch, and never points
one at a commit that is not on `main`. A cloud session cannot delete a branch (its git proxy
refuses), so a branch it left behind by mistake is Kade's to delete.

## 4. Keeping the branch immutable

No rulesets (decision 6). Two workflows keep the branch as it was created:

- **`candidate-guard.yml`**, on `push` to `candidate/*`, in every repository with releases.
  A push that creates the branch is checked: the name has the form of section 3 and the commit
  is on `origin/main`; otherwise the guard deletes the branch and fails. A push that updates it
  (`created` false, `deleted` false), forced or not, makes the guard delete the branch and
  fail, naming the commit it pointed at; the candidate starts again at step 2. A deletion is
  ignored. It also runs on `rc/**`: an `rc/` branch is made only by Candidate, so a push that
  creates or updates one is deleted. The workflows create and delete branches with `GITHUB_TOKEN`,
  which starts no workflow.
- **The guard runs only for commits that contain it**: a push runs the pushed commit's own
  workflow files. Every candidate is a `main` commit after #97, so it always has one; a branch
  at an older commit is not guarded (step 3 found this with a test branch at `7b11dcf`).
- **Candidate itself** reads the branch head through the API at the start and just before the
  tag, so a push the guard has not handled yet still fails the run, which then deletes the
  branch.
- **What this guards against:** mistakes, which is the risk for one person and his agents. A
  workflow cannot refuse a push, only undo it, and a push that changes the guard's own file
  runs that changed file; a ruleset would refuse it, and is the step up if the team grows.
- **Tag rulesets on `v*`** stay where they exist, as today (agent-config: only GitHub Actions
  creates them, nobody moves or deletes them). They cover the `-rc.N` tags too. A repository
  without one gets the same guard for tags in its own plan (step 7): Actions creates tags with
  `GITHUB_TOKEN`, which starts no workflow, so any `v*` push that reaches a workflow is
  someone else's and is reported.
- **Left-overs:** if a runner dies before the last job, the branch stays; the next Candidate
  refuses, and the daily report lists `candidate/*` branches older than a day (section 6, step 6).

## 4a. Auto-candidate (Kade, 2026-10-23)

Agents' pushes of `candidate/*` from cloud sessions were often refused, so Kade had to ask for
each one again. **`auto-candidate.yml`** pushes the branch instead:

- It runs on `workflow_run` of `test`, completed with success on a push to `main`.
- Job *decide on a candidate* (`contents: read`) checks out that commit and runs
  `release.cjs should-candidate`: the files `deploy-exclude` lets into `~/.claude` changed since
  the merge base with the latest release tag (the `main` commit it was stamped on). None: no
  candidate. A repository with a version file decides on "the version file changed" instead.
- Job *push the candidate branch* (`contents: write`, `actions: read`, no checkout): nothing if
  `main` has moved on (the newer commit's run decides); fails if Candidate is running or queued,
  so it never deletes the branch Candidate reads; deletes an unused `candidate/*` branch at an
  older commit (Kade's choice: the newest `main` is the candidate); creates
  `candidate/<12-character sha>` with `GITHUB_TOKEN`; writes the Candidate line in its summary.
- It fails only when it could not push. That is the one case where an agent pushes by hand.
- `GITHUB_TOKEN` starts no workflow, so the guard does not run on this branch; Candidate checks
  the same things again. Both jobs are in `CANDIDATE_JOBS`, so a failed run does not make
  Candidate refuse the commit's checks.

## 5. agent-config

- **The stamp.** Candidate picks the final tag `vYYYY.MM.DD[.N]` (`scripts/release.cjs next`:
  today's date, or `.2`, `.3` once that date has a final tag; a date with rc tags only is
  reused, with the next N), writes
  `Global rules: <final tag>` into line 1 of `AGENTS.md`, runs `node --test` on that tree, and
  creates the stamped commit whose parent is the `main` commit, tagged `<final tag>-rc.N`.
  Promote adds `<final tag>` on the same stamped commit. The stamp and the final tag therefore
  cannot differ, as today. There are no build assets; the release notes are the asset.
- **Trying the candidate:** `global-sync` takes only numeric tags (`/^v\d+(\.\d+)*$/`), so no
  session moves to an rc tag. Kade tries it in one session with `git -C ~/.claude fetch --depth
  1 origin tag <rc tag>` and `checkout -f --detach <rc tag>`; the next session start moves it on
  to the final tag once promoted.
- **`test.yml`** on a tag compares the stamp with the tag name less its `-rc.N` suffix.
- **Removed after the first promoted release** (`v2026.10.20`): the `rc` branch and its ruleset
  (Kade), and `release.yml`, which ran only on `rc`.

## 5a. Signed update feeds, built once

For an app that updates itself (resonance-stream, D-30), the rule is: **the binary never knows
it is a candidate.** Its version is the final one (`1.2.0`, from the version file); `-rc.N`
exists only in the tag, the prerelease and the feed it is listed in. So the bytes Kade tries are
the bytes users get.

- **Candidate** builds and signs once: the code signature on the binary and the updater
  signature over the file (a `.sig` over the bundle). Only Candidate holds the signing
  secrets. It publishes them as prerelease assets with `SHA256SUMS`, and a feed entry on a
  **candidate channel** (a second feed URL only Kade's test install follows) naming the
  prerelease's file, its hash and signature.
- **Promote** holds no signing key for the binary. It downloads the assets, checks them against
  `SHA256SUMS`, attaches the same files and `.sig` to the final release, and writes the
  **stable** feed entry: the same hash and signature, the final release's URL. Updaters check
  the file's signature, not the URL, so the moved URL needs no new signature.
- **If the feed file itself is signed** (a signed manifest, not only signed files), Promote signs
  that small manifest with a feed key kept apart from the code-signing key: metadata is
  re-signed, the binary never.
- Each repository's own plan (step 7) checks this against how its feed is built today.

## 6. Steps (each its own PR, after this plan is accepted)

1. **This plan**, accepted by Kade in the merge.
2. **agent-config's workflows, test-first:** `release.cjs` (rc numbering, the date skip, the
   checks Candidate and Promote share), `candidate.yml`, `promote.yml`, `candidate-guard.yml`,
   the `test.yml` stamp check. `release.yml` stays on `rc` as the fallback until step 3 has passed.
3. **First run** (2026-10-20). Done so far: the guard passed `candidate/47b24fae8e1a` and
   deleted it after a second push; Candidate made `v2026.10.20-rc.1` (commit `0971b99`, parent
   `47b24fa`, only line 1 of `AGENTS.md` changed) and deleted the branch; a second Candidate on
   the same commit failed with "already a candidate" and deleted the branch too. Promote could
   not be started from the GitHub app, which lists no tags: decision 9, built in its own PR.
   Kade then promoted rc.1 from the browser (its commit holds the tag-based `promote.yml`):
   `v2026.10.20` on `0971b99`, the latest release. He deleted `rc`; the PR of decision 9
   moved the promotable branches to `rc/` and removed `release.yml`. **Done 2026-10-20**:
   from the app, Candidate on `candidate/b427341632db` made `v2026.10.20.2-rc.1` (`900bdd9`,
   parent `b427341`) and `rc/v2026.10.20.2-rc.1`; Promote on that branch tagged
   `v2026.10.20.2` on the same commit, the latest release, and no `candidate/` or `rc/`
   branch was left.
4. **The global rules and the skill** (a draft PR, released through the new flow): the Branches
   bullet of `AGENTS.md` names `candidate/<12-character sha>` as the one branch an agent creates outside
   `claude/<task>`, immutable once created; `agent-skills/release-flow/SKILL.md` describes
   section 3 and its "Never" list; `scripts/repo.test.cjs` checks both.
5. **README and `docs/global-rules-plan.md` section 6** point here.
6. **code-quality-assurance:** `release_branch: "rc"` becomes `release_model: "candidate"` in the
   profiles and their test; the daily report lists left-over `candidate/*` branches.
7. **Each repository with a release** (`stella-rain/core`, `stella-rain/app`,
   `star-resonance/resonance-stream`, `enjay27/lakehouse`): its own session and plan, removing
   `rc`, `release-checks.yml` and their rulesets, adding `candidate-guard.yml` (and a tag
   guard where no tag ruleset exists), and, for resonance-stream, section 5a.

## 7. Open questions

None left; Kade answered all four on 2026-10-20:

1. A cloud session may push `candidate/*` (decision 5); seen working in step 3. It cannot
   delete one.
2. No rulesets for `stella-rain/app` or anywhere new: the guard workflow (decision 6, section 4).
3. Signed update feeds, built once: section 5a (decision 7).
4. No required check name: Candidate reads every check run on the commit (decision 8).

## 8. How it is tested

- `node --test`: `release.cjs` against real git repositories, as `release.test.cjs` does today
  (rc numbering, the date skip, refusals); the rules and skill text in `repo.test.cjs`.
- The workflows: YAML parses here; NOT VERIFIED until step 3 has run on GitHub, including one
  deliberately failed Candidate to see the branch deleted, and one push the guard undoes.

## 9. Revision: Candidate on `main`, the next patch for a released version (proposed 2026-10-24)

Kade asked (2026-10-24) for a candidate that always exists for `main`'s latest commit, and for
a Candidate run on a version that is already released to make a new release instead of being
refused. His example: `main` and the latest release are both `0.0.5`, `main` gets new commits,
and Candidate should still make something.

### 9.1 The candidate is `main` itself

A `candidate/<sha>` branch that always follows `main`'s head is a copy of `main`. The branch
existed so that Kade does not type a SHA (decision 2) and the commit he releases is fixed. A
`workflow_dispatch` run on `main` gives both:

- `main` is the default branch, so the Actions dropdown, in the GitHub app too, already has it
  selected: Kade clicks Run, nothing else.
- `GITHUB_SHA` is fixed when he clicks. Candidate tags that commit and makes `rc/<rc tag>` at
  its release commit; Promote releases only that, as today. A push to `main` during the run
  changes nothing: the run keeps its commit, which is on `main`.
- What Kade tries is still what users get: the rc tag, not the branch he clicked, is the record.

**What goes:** `auto-candidate.yml`; the `candidate/**` half of `candidate-guard.yml` (its `rc/**`
half stays); `release.cjs check-candidate` and the "no other candidate branch" refusal; step 2 of
the skill, decision 5 (cloud sessions push `candidate/*`) and section 4a. Agents then push
nothing outside `claude/*` and `agent/*`, which also ends the refused cloud pushes that 4a was
built around.

**What Candidate checks instead**, all on `GITHUB_SHA`:

- it runs on `refs/heads/main`, nothing else;
- every check run on the commit has finished and none failed (`checks-passed`, unchanged; a
  refusal because checks are still running is run again later, as today);
- there is something to release: agent-config, a file deployed to `~/.claude` changed since the
  latest release (`should-candidate`, moved here from auto-candidate); a repository with a
  version file, at least one commit since the latest final tag's `main` commit;
- the commit is not already a candidate (the existing "already a candidate" refusal).

**The notes Kade reads before clicking** move from the agent's message about the branch to the
run itself: the summary of the run lists what `main` brings since the latest release, grouped by
PR, with the commits' `NOT VERIFIED` lines. An agent asked for a release still writes the same
message, naming `main` at the commit it read.

### 9.2 The version: the next patch once a version is released

The version file on `main` becomes the **floor**, not the version itself. With `V` the version
in the file and `L` the latest final `v*` tag:

| `V` against `L` | The release | Example (`L` = `v0.0.5`) |
|---|---|---|
| `V` above `L` | `V` | file `0.1.0` gives `v0.1.0-rc.N` |
| `V` equal to or below `L` | `L` with its patch number plus one | file `0.0.5` gives `v0.0.6-rc.N` |
| no `L` yet | `V` | first release |

`N` is one more than that version's highest rc tag, as today, so a second Candidate before
Promote makes `v0.0.6-rc.2`. A minor or major release still needs a version PR (step 1 of the
skill); a patch release needs none.

**Candidate stamps the version** into the release commit, whose parent is the `main` commit, as
agent-config already stamps line 1 of `AGENTS.md`: the version file and every file that repeats
it (`Cargo.toml` with `Cargo.lock`, `package.json` with its lock file, `tauri.conf.json`), named
in each repository's own plan. It builds after the stamp, so section 5a holds: the binary
carries the final version and never knows it is a candidate.

**Why not `0.0.5-fix.1`**, the form Kade first named: in SemVer a suffix after `-` is a
prerelease, which sorts below the version without it (`0.0.5-fix.1 < 0.0.5`). Updaters and the
signed feed would treat it as older than `0.0.5` and offer it to nobody already on it; Windows
file and installer versions take numbers only; GitHub and every SemVer sort would keep `0.0.5`
as the latest. Build metadata (`0.0.5+fix.1`) is ignored by version order altogether, and a
fourth number (`0.0.5.1`) is not SemVer and most updaters ignore it. A new patch number is what
semantic-release, release-please and Changesets do for the same case.

**agent-config** changes only in 9.1: its version is already computed (`vYYYY.MM.DD`, `.2` later
the same day), so it is never "already released".

**The cost:** `main`'s version file can lag the latest release (`0.0.5` on `main` while
`v0.0.7` is out). A local build from `main` then says `0.0.5`; it is a development build, and the
release's version is in its tag. Writing the version back to `main` would need a workflow that
pushes to `main` or opens a PR after every Promote; this plan proposes neither (open question 1).

### 9.3 Steps (each its own PR, after this revision is accepted)

1. **This revision**, accepted by Kade in the merge.
2. **agent-config, test-first:** `release.cjs` (the `main`-only check, `should-candidate` used by
   Candidate, `check-candidate` removed); `candidate.yml` on `main`; `auto-candidate.yml` and the
   `candidate/**` half of `candidate-guard.yml` removed; README; the `release-flow` skill and its
   tests in `repo.test.cjs`, so the skill never describes a flow that is not built yet.
3. **First run** on agent-config: Candidate from `main` in the GitHub app, one refusal on a
   commit whose checks have not finished, then Promote.
4. **code-quality-assurance:** the daily report no longer lists left-over `candidate/*` branches.
5. **Each repository with a numeric version** (its own session and plan): `release.cjs next`
   learns the floor rule of 9.2 with tests, Candidate stamps that repository's version files,
   and its rules say the file is the floor.

### 9.4 Open questions

1. Should `main`'s version file follow the releases? Recommended: no. The tag is the version;
   a workflow that writes to `main` is a new writer that branch has never had.
2. Should a repository with a version file also refuse a Candidate when only docs changed
   since the latest release, as agent-config does with `deploy-exclude`? Recommended: decide in
   each repository's plan, with "at least one commit" as the default.

### 9.5 How it is tested

- `node --test`: the floor rule against real git repositories with tags (`V` above, equal to
  and below `L`, no `L`, a second rc), the `main`-only refusal and "nothing to release", in
  `release.test.cjs`; the skill text in `repo.test.cjs`.
- The workflows: NOT VERIFIED until step 3 has run on GitHub.
