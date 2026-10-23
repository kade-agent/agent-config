---
name: release-flow
description: How every release is made in Kade's repositories - a version PR into main, a candidate/SHA branch at that main commit, pushed by CI (auto-candidate) or else by the agent, Kade's Candidate run (an -rc.N tag, a prerelease and an rc/ branch named after that tag), then his Promote run on that rc/ branch, which tags the same commit and releases it without a rebuild. Use whenever Kade asks for a release, a release candidate, a version bump or a tag, and before touching candidate/ or rc/ branches, release workflows or release checks in any repository.
---

# Release flow

One flow in every repository; a repository's `AGENTS.md` (or `CLAUDE.md`) says only where its
version and release notes live, never the flow itself. The design and its reasons:
`kade-agent/agent-config` `docs/release-flow-plan.md`.

```
main --(1) version PR--> main --(2) CI, else agent: candidate/<12-character sha> at that commit
     --(3) Kade: Actions > Candidate on it --> tag v<version>-rc.N + prerelease + branch rc/<rc tag>
     --(4) Kade tries it, then Actions > Promote on rc/<rc tag> --> tag v<version> + release
```

## 1. Version change into main

- A normal `claude/<task>` PR into `main`: the version bump where the repository keeps it, and its
  release notes if it has them. It merges like any other PR.
- The version is Kade's: use the one he named; otherwise propose one (patch for fixes only,
  minor for features, major for a break) and ask before committing.
- A repository whose release tag is computed rather than written (agent-config: `vYYYY.MM.DD`)
  skips this step.

## 2. The candidate branch (CI pushes it; the agent only when that fails)

- `candidate/<12-character sha>`, at a commit already on `main`, with no commit of its own, and
  never pushed to again.
- **Where the repository has `auto-candidate.yml`**, CI pushes it: once `test` passes on a push to
  `main` that has something to release (agent-config: a file deployed to `~/.claude` changed since
  the latest release; elsewhere: the version file changed), its run creates the branch at that
  commit and deletes an unused older `candidate/*` branch. After step 1 has merged, read that
  run: if it passed, the branch exists; go on to telling Kade. Push by hand only when that run
  failed (its error says why: Candidate was running, or the API refused the push).
- **By hand** (that failure, or a repository without `auto-candidate.yml`): the one branch an
  agent pushes outside `claude/<task>` (or `agent/<task>`). `git fetch origin main`; on the
  commit every check run has finished and none failed. Then
  `git push origin <sha>:refs/heads/candidate/<first 12 characters of sha>`, and wait for the
  **Candidate guard** run on that push (`candidate-guard.yml`) to pass; it deletes a branch with
  a wrong name, a commit not on `main`, or a second push. If the push is refused, report it to
  Kade with the command; never retry it in a loop.
- Tell Kade: "Actions > Candidate > Run workflow > branch `candidate/<sha>`", with the version,
  what `main` brings since the last release (`git log --no-merges <latest v tag>..<sha>`, grouped
  by PR with links), the `NOT VERIFIED` lines of those commits, and what to try on the prerelease.
- One candidate branch at a time. A cloud session cannot delete a branch: one it left behind by
  mistake is Kade's to delete (or goes when `auto-candidate.yml` next pushes one).

## 3. Kade: Candidate

- It refuses unless the branch names its commit, the commit is on `main` with its checks passed,
  no other `candidate/*` branch exists, the branch has not moved and the version is new. It
  builds and tests once, tags `v<version>-rc.N`, makes a prerelease with the assets, makes the
  branch `rc/<rc tag>` at the tag's commit, and deletes the same version's lower `rc/` branches.
  Only a successful run deletes the `candidate/` branch: a failed or refused Candidate keeps it,
  so Kade can run Candidate again on it (`auto-candidate.yml` deletes it when `main` gets a newer
  candidate). A re-run after a failure that already made the rc tag is refused ("already a
  candidate"); that case needs the half-made tag removed by Kade.
- When he asks, read the run and record the result on the issue. A failed run is fixed on `main`
  and starts again at step 2; one refused only because `main`'s checks had not finished may be
  pushed again at the same commit.

## 4. Kade: Promote

- He tries the prerelease, then runs "Actions > Promote > Run workflow > branch `rc/<rc tag>`".
  It refuses unless the branch is at its tag's commit, that tag is the version's highest rc and
  the version is still new; it tags the same commit `v<version>` and makes the release with the
  same assets, never rebuilt. Then it deletes the `rc/` branches of that version and older.
- When he asks, read the run. A failed Promote deletes nothing and can run again; a half-made
  release (a tag or release left behind) is reported, and Kade removes it.

## Never

- Push a `v*` tag, create, edit or delete a GitHub release, or start any workflow.
- Push an `rc/` branch, push to an existing `candidate/` branch, add a commit to one, or point
  one at a commit that is not on `main`.
- Open a PR into a release branch, or keep a long-lived `rc` branch.
- Work around a refused check (the head, the version, the notes) instead of fixing it on `main`.

## What a repository needs for this flow

Moving a repository onto it is its own task (plan first). The pieces, as in agent-config:

- **`candidate.yml`** (`workflow_dispatch`): the checks of step 3, the repository's build and
  tests, `SHA256SUMS`, the rc tag, the prerelease and the `rc/` branch, all made with
  `GITHUB_TOKEN`; a last job (`if: needs.<tag job>.result == 'success'`) deletes the `candidate/` branch.
- **`promote.yml`** (`workflow_dispatch`): the checks of step 4, the assets downloaded and checked
  against `SHA256SUMS`, the final tag on the same commit, the release, the `rc/` branches deleted.
- **`auto-candidate.yml`** on `workflow_run` of `test` on `main`: when the push has something to
  release, creates the `candidate/` branch with `GITHUB_TOKEN` (deleting an unused older one);
  its jobs are left out of Candidate's check of the commit's checks.
- **`candidate-guard.yml`** on push to `candidate/**` and `rc/**`. No new rulesets; a `v*` tag
  ruleset stays where one exists.
- No `rc` branch (git cannot hold `rc` beside `rc/…`), no `release-checks.yml`, no release ruleset
  on `rc`. Auto-merge acts only on `claude/*` into `main`.
- A signed update feed: the binary carries the final version and is signed once, in Candidate;
  Promote reuses the files and their signatures and writes only the stable feed entry
  (`docs/release-flow-plan.md`, section 5a).
- The repository's rules: one line pointing here, plus where its version and notes live; its
  profile in `kade-agent/code-quality-assurance` names the flow.

Reference implementation: `kade-agent/agent-config` (`candidate.yml`, `promote.yml`,
`candidate-guard.yml`, `scripts/release.cjs`; a date tag that stamps line 1 of `AGENTS.md`).
