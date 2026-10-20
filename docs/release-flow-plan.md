# Plan: releases from an immutable candidate branch, promoted by tag

- **Scope:** how every release is made in Kade's repositories (the `release-flow` skill), and
  agent-config's own Release workflow as the first repository moved onto it.
- **Status:** **proposed** (2026-10-20). Nothing in section 6 is built until Kade accepts it.
- **Replaces:** the `rc` flow of `agent-skills/release-flow/SKILL.md` (Kade, 2026-10-18) and
  section 6 of `docs/global-rules-plan.md` where it describes the Release run on `rc`.
- **Decided by Kade, 2026-10-20:**
  1. Option B of the brief in section 2: no long-lived `rc` branch; a release candidate is a
     `-rc.N` tag and a prerelease; the final release is promoted from it, not rebuilt.
  2. Kade does not type a SHA. The agent pushes a branch at the proposed commit and Kade runs
     **Candidate** on that branch from the Actions dropdown.
  3. Once created, nobody pushes to or merges into that branch. Candidate deletes it when it
     finishes, whether the candidate was made or the run failed.
  4. The four adjustments of section 3 (the commit is on `main`; a ruleset where the plan allows
     it; deletion in a job that always runs; Promote run from the rc tag).

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
     --(2) agent: candidate/v<version> at that main commit
     --(3) Kade: Actions > Candidate on that branch --> tag v<version>-rc.N + prerelease; branch deleted
     --(4) Kade tries the prerelease, then Actions > Promote on tag v<version>-rc.N --> tag v<version> + release
```

1. **Version PR into `main`**, as today. The version is Kade's. agent-config skips this step:
   its version is computed (`vYYYY.MM.DD`, `.2` later the same day).
2. **The candidate branch.** After step 1 has merged, the agent fetches `main`, checks that
   `main`'s CI is green on the merge commit, and pushes a branch at that commit, adding no commit
   of its own: `git push origin <sha>:refs/heads/candidate/v<version>`. agent-config names it
   `candidate/<12-character sha>`. It tells Kade: "Actions > Candidate > Run workflow > branch
   `candidate/v<version>`".
3. **Candidate** (`candidate.yml`, `workflow_dispatch`). It refuses unless:
   - it runs on `refs/heads/candidate/*`, and the name matches the version at that commit (or,
     in agent-config, the commit's own sha);
   - the commit is on `origin/main`, and `main`'s required check passed on it;
   - no other `candidate/*` branch exists (a left-over one is reported, not reused);
   - the version is above every final `v*` tag and has no final tag yet;
   - the branch head still equals `GITHUB_SHA`, read through the API at the start and again just
     before the tag is created.

   It then builds and tests once, creates the annotated tag `v<version>-rc.N` (N is one more
   than that version's highest rc tag) and a GitHub prerelease with the assets and a
   `SHA256SUMS` file. A last job, `if: always()`, deletes the branch: after a candidate, a
   failure, or a cancel. A failed candidate is never re-run; it is fixed on `main` and starts
   again at step 2 (the next N).
4. **Promote** (`promote.yml`, `workflow_dispatch`). Kade runs it with the rc tag chosen under
   "Use workflow from" (the dropdown lists tags), so the workflow is read from the candidate's
   commit. It refuses unless the ref is a `v<version>-rc.N` tag, that is the version's highest
   rc tag, its prerelease exists and its assets match `SHA256SUMS`, and the version is still new.
   It creates the annotated tag `v<version>` on the same commit and the release with the same
   assets, downloaded from the prerelease, never rebuilt, and marks it latest. The prerelease
   stays as the record.

**Who does what:** the agent does steps 1 and 2 and reads the runs; Kade starts steps 3 and 4.
An agent never creates a tag or release, never starts a workflow, never pushes to or recreates
an existing `candidate/*` branch, and never points one at a commit that is not on `main`.

## 4. Keeping the branch immutable

- **Ruleset on `candidate/*`** (Kade's), where the plan allows rulesets: creation allowed,
  updates and force pushes blocked, no bypass. Agents push through Kade's account, so the
  ruleset cannot tell an agent from Kade; it stops updates for everyone, which is the rule.
- **Where there are no rulesets** (a private repository on GitHub Free) the workflow is the
  guard: the head check of section 3 runs twice, and a moved branch fails the run, which then
  deletes the branch.
- **Tag ruleset on `v*`**, as today: only GitHub Actions creates them, nobody moves or deletes
  them. It covers the `-rc.N` tags too.
- **Left-overs:** if a runner dies before the last job, the branch stays; the next Candidate
  refuses, and the daily report lists `candidate/*` branches older than a day (section 6, step 6).

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
- **Removed after the first promoted release:** `release.yml` on `rc`, the `rc` branch and its
  ruleset (Kade's).

## 6. Steps (each its own PR, after this plan is accepted)

1. **This plan**, accepted by Kade in the merge.
2. **agent-config's workflows, test-first:** `release.cjs` (rc numbering, the date skip, the
   checks Candidate and Promote share), `candidate.yml`, `promote.yml`, the `test.yml` stamp
   check. `release.yml` stays on `rc` as the fallback until step 3 has passed.
3. **First run (Kade):** the `candidate/*` and `v*` rulesets; the agent pushes a candidate
   branch; Kade runs Candidate, tries the rc tag in one session, runs Promote. Then he deletes
   `rc` and its ruleset, and a PR removes `release.yml`.
4. **The global rules and the skill** (a draft PR, released through the new flow): the Branches
   bullet of `AGENTS.md` names `candidate/v<version>` as the one branch an agent creates outside
   `claude/<task>`, immutable once created; `agent-skills/release-flow/SKILL.md` describes
   section 3 and its "Never" list; `scripts/repo.test.cjs` checks both.
5. **README and `docs/global-rules-plan.md` section 6** point here.
6. **code-quality-assurance:** `release_branch: "rc"` becomes `release_model: "candidate"` in the
   profiles and their test; the daily report lists left-over `candidate/*` branches.
7. **Each repository with a release** (`stella-rain/core`, `stella-rain/app`,
   `star-resonance/resonance-stream`, `enjay27/lakehouse`): its own session and plan, removing
   `rc`, `release-checks.yml` and their rulesets.

## 7. Open questions

1. **Can a cloud session push `candidate/*`?** Its git proxy may allow only the session's own
   `claude/*` branch. If not, a cloud session prints the push command for Kade, or a local
   session pushes it. Checked in step 3.
2. **`stella-rain/app` is private:** does its organization's plan offer rulesets? If not, the
   workflow's head check is its only guard (section 4).
3. **Build once where the version is inside the artifact:** resonance-stream's signed update
   feed and any store upload may name the version or channel. Promote then re-signs or re-labels
   metadata, never the binary; each repository's own plan in step 7 says how.
4. **Required check name per repository** for Candidate's "CI passed on that commit" check.

## 8. How it is tested

- `node --test`: `release.cjs` against real git repositories, as `release.test.cjs` does today
  (rc numbering, the date skip, refusals); the rules and skill text in `repo.test.cjs`.
- The workflows: YAML parses here; NOT VERIFIED until step 3 has run on GitHub, including one
  deliberately failed Candidate to see the branch deleted.
