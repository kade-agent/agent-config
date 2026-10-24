---
name: release-flow
description: How every release is made in Kade's repositories - a version PR into main when the version changes, Kade's Candidate run on main itself (an -rc.N tag, a prerelease and an rc/ branch named after that tag), then his Promote run on that rc/ branch, which tags the same commit and releases it without a rebuild. Use whenever Kade asks for a release, a release candidate, a version bump or a tag, and before touching rc/ branches, release workflows or release checks in any repository.
---

# Release flow

One flow in every repository; a repository's `AGENTS.md` (or `CLAUDE.md`) says only where its
version and release notes live, never the flow itself. The design and its reasons:
`kade-agent/agent-config` `docs/release-flow-plan.md`.

```
main --(1) version PR, only when the version changes--> main
     --(2) Kade: Actions > Candidate on main --> tag v<version>-rc.N + prerelease + branch rc/<rc tag>
     --(3) Kade tries it, then Actions > Promote on rc/<rc tag> --> tag v<version> + release
```

## 1. Version change into main

- A normal `claude/<task>` PR into `main`: the version bump where the repository keeps it, and its
  release notes if it has them. It merges like any other PR.
- The version is Kade's: use the one he named; otherwise propose one (patch for fixes only,
  minor for features, major for a break) and ask before committing.
- A repository whose release tag is computed rather than written (agent-config: `vYYYY.MM.DD`)
  skips this step. So does a patch release in a repository with a version file (step 2).

## 2. Kade: Candidate on `main`

- There is no candidate branch: Kade runs "Actions > Candidate > Run workflow" on `main`, which the
  Actions dropdown has selected already. The commit is `GITHUB_SHA` at his click; a push to `main`
  during the run changes nothing. Agents push only their own `claude/<task>` (or `agent/<task>`) branches.
- **An agent asked for a release** does not start anything. It reads `main`'s head and its checks,
  then tells Kade: "Actions > Candidate > Run workflow on `main`", naming the commit, with the
  version, what `main` brings since the last release (`git log --no-merges <latest v tag>..<sha>`,
  grouped by PR with links), the `NOT VERIFIED` lines of those commits, and what to try on the
  prerelease. The run's summary lists the same commits.
- **Candidate refuses** unless it runs on `main`, there is something to release (agent-config: a
  file deployed to `~/.claude` changed since the latest release; elsewhere: at least one commit
  since the latest release, unless the repository's plan says otherwise), every check run on the
  commit has finished and none failed, and the commit is not a candidate already. A refusal
  because checks are still running is run again later.
- **The version** of a repository with a version file: the file is the **floor**. With `V` the
  version in the file and `L` the latest final `v*` tag: `V` above `L` releases `V`; `V` equal to
  or below `L` releases `L` with its patch number plus one (file `0.0.5`, `L` `v0.0.5`, release
  `v0.0.6`); no `L` releases `V`. Candidate stamps the version into a release commit whose parent
  is the `main` commit, and builds after the stamp. A minor or major release still needs the
  version PR of step 1; `main`'s file never follows the releases and no workflow writes to `main`.
- Candidate builds and tests once, tags `v<version>-rc.N` (N is one more than that version's
  highest rc), makes a prerelease with the assets, makes the branch `rc/<rc tag>` at the tag's
  commit, and deletes the same version's lower `rc/` branches. A re-run after a failure that
  already made the rc tag is refused ("already a candidate"); that case needs the half-made tag
  removed by Kade.
- When he asks, read the run and record the result on the issue. A failure caused by `main` is
  fixed on `main`.

## 3. Kade: Promote

- He tries the prerelease, then runs "Actions > Promote > Run workflow > branch `rc/<rc tag>`".
  It refuses unless the branch is at its tag's commit, that tag is the version's highest rc and
  the version is still new; it tags the same commit `v<version>` and makes the release with the
  same assets, never rebuilt. Then it deletes the `rc/` branches of that version and older.
- When he asks, read the run. A failed Promote deletes nothing and can run again; a half-made
  release (a tag or release left behind) is reported, and Kade removes it.

## Never

- Push a `v*` tag, create, edit or delete a GitHub release, or start any workflow.
- Push an `rc/` branch, or add a commit to one.
- Open a PR into a release branch, or keep a long-lived `rc` branch.
- Work around a refused check (the version, the notes, unfinished checks) instead of fixing it on `main`.

## What a repository needs for this flow

Moving a repository onto it is its own task (plan first). The pieces, as in agent-config:

- **`candidate.yml`** (`workflow_dispatch`): the checks of step 2 (the ref is `refs/heads/main`,
  something to release, the commit's checks passed), the repository's build and tests,
  `SHA256SUMS`, the rc tag, the prerelease and the `rc/` branch, all made with `GITHUB_TOKEN`;
  the notes in the run summary. No cleanup job and no workflow that pushes a branch for it.
- **`promote.yml`** (`workflow_dispatch`): the checks of step 3, the assets downloaded and checked
  against `SHA256SUMS`, the final tag on the same commit, the release, the `rc/` branches deleted.
- **`candidate-guard.yml`** on push to `rc/**`. No new rulesets; a `v*` tag ruleset stays where
  one exists.
- No `rc` branch (git cannot hold `rc` beside `rc/…`), no `release-checks.yml`, no release ruleset
  on `rc`. Auto-merge acts only on `claude/*` into `main`.
- A signed update feed: the binary carries the final version and is signed once, in Candidate;
  Promote reuses the files and their signatures and writes only the stable feed entry
  (`docs/release-flow-plan.md`, section 5a).
- The repository's rules: one line pointing here, plus where its version and notes live; its
  profile in `kade-agent/code-quality-assurance` names the flow.

Reference implementation: `kade-agent/agent-config` (`candidate.yml`, `promote.yml`,
`candidate-guard.yml`, `scripts/release.cjs`; a date tag that stamps line 1 of `AGENTS.md`).
