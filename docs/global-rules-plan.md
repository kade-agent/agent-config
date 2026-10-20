# Plan: `claude-global`, one global rule set checked out as `~/.claude`, plus rules per repository

- **Scope:** where Kade's coding and workflow conventions live, how they reach local and cloud
  sessions, and what each repository keeps for itself.
- **Status:** **closed 2026-10-09 (Kade)**: every step is done. Still open, outside the plan:
  stella-rain/app#5 (context-guard and path-scoped rules in a live session) and whether `paths:`
  rules work at user level (section 9). Accepted 2026-10-09 (decisions below). Steps 0 to 5
  done the same day; release `v2026.10.09.2` carries decision 5 and `v2026.10.09.3` moves
  context-guard to user level.
  Step 6 is done for every repository's `CLAUDE.md` (the four Stella Rain repositories, whose
  "Author: Kade" lines are gone, and `resonance-stream` and `resonance-lab`). Both Resonance
  files are also deduplicated, and `resonance-lab`'s is under the 100-line limit. The
  `kade-workflow` duplicates are cut too (enjay27/claude-skills#6, 103 to 65 lines), the context
  budget is its own skill, `handoff-trigger` (enjay27/claude-skills#5), and the Precedence line
  points at it (enjay27/claude-global#17, release `v2026.10.09.4`). `graft-kade` is kept in
  `claude-skills` (enjay27/claude-skills#7) and runs Graft only through its `g` function
  (enjay27/claude-skills#8, Kade's option B: no Graft hooks, MCP server or repository wiring).
  **Steps 0 to 6 are done.** Open: stella-rain/app#5 (steps 5 and 6). The cloud setup script's
  `ref` never needs bumping: `--install` and the hook move to the latest release.
  On 2026-10-09 `kade-workflow` became `repo-workflow` and `graft-kade` became `code-graph`
  (stella-rain/app#66, enjay27/claude-skills#10); text above and below written earlier keeps the
  old names.
- **Related:** `docs/refactor-plan.md` (the current setup), `claude-skills/docs/skills-improvement-plan.md`
  (what the account skills should say).
- **Decisions (Kade, 2026-10-09):**
  1. Two public repositories: `claude-skills` holds the account skills, `claude-global` everything
     global (section 4).
  2. A pushed `v*` tag is a release; every session moves to it at its next start; only Kade can
     create one (section 6).
  3. `~/.claude/settings.json` is not tracked; `global-sync` merges only its own hook entries
     (section 5).
  4. Cloud sessions merge through GitHub's own auto-merge: Claude turns it on for each PR it
     opens, and the `main` ruleset's required check decides. Only people with write access can
     turn it on, and PRs from Kade's Claude sessions are authored by `enjay27`. Repositories with
     an auto-merge workflow (Stella Rain, Resonance) keep it for now.
  5. Commits Claude makes are authored by Claude, in cloud and local sessions: the cloud platform
     already sets that identity and signs with it, and a local session passes it per commit.
     Kade authors the PRs, issues and merges, which Claude opens through his account. The
     "Author: Kade" lines in `app`, `core`, `moderation` and `.github` are removed in step 6.
- **Done:** step 0, 2026-10-09: this repository created; `hooks/` and the plans moved from
  `claude-skills` at `8a227ca`; secret scanning with push protection on; rulesets `main` (PR
  required, no bypass) and `release-tags` (`v*`, only the repository admin creates, nobody updates
  or deletes).
- **Home:** `enjay27/claude-global`, moved from `enjay27/claude-skills` in step 0 (2026-10-09).

## 1. The question

Kade wants one place for conventions that apply to every repository (coding and workflow), and
repository files that hold only what is specific to that repository: which file to open first,
which directory a new kind of file goes in, repo-only hard rules.

The constraint that shapes the answer: **a cloud session cannot read the home folder of Kade's
PC or Mac**, so a user-level `~/.claude/CLAUDE.md` alone reaches only local sessions.

## 2. The current setup

| Piece | Carries | Reaches |
|---|---|---|
| Account skills (`kade-workflow`, `session-resume`, `session-handoff`, `graft-kade`) | Workflow procedures, loaded when their description matches | Local and cloud |
| Each repository's `CLAUDE.md` | Repo facts, gates, one line "follow `kade-workflow`" | That repository |
| `.claude/rules/*.md` per repository | Path-scoped rules, loaded when a matching file is read | That repository |
| `.claude/hooks/context-guard.cjs`, vendored copy | Context warnings | That repository |

Gaps: no always-on global text (a skill that does not trigger is a rule that is missed); the hook
is copied by hand into each repository, so copies can drift; nothing checks that the account copy
of a skill equals the file in this repository.

## 3. The options

| | A. Today | B. A global repository checked out as `~/.claude` | C. Plugin from a git marketplace | D. CI opens sync PRs into every repository |
|---|---|---|---|---|
| Always-on global text | No | Yes, `~/.claude/CLAUDE.md` and `~/.claude/rules/` | Locally only, through a plugin `SessionStart` hook (plugins cannot ship `CLAUDE.md`). **Cloud sessions do not install plugins a repository enables** | Yes, as a file in each repository |
| Hook | Copied into each repository | Once, in `~/.claude/hooks/`, registered at user level | Yes, but not in the cloud | Copies in each repository |
| Cloud and local identical | Partly | Yes, same tag on PC, Mac and cloud | No | Yes |
| Update path | Upload skills by hand; edit hook copies | Push a tag; every session moves to it at its next start (section 6) | Bump the plugin version | Merge one PR per repository |
| Context cost | ~270 tokens of skill descriptions always; skill bodies when used | A + ~1,000 tokens for a 60-line `CLAUDE.md`, offset by what moves out of `kade-workflow` and repository files | Same as A | Same as B |
| New moving parts | None | The sync hook; tag protection; `github.com` in the cloud network allowlist | Marketplace entry in each repository's `settings.json` | A sync workflow and a token that can open PRs |
| Failure mode | Silent drift | Fetch fails: the session keeps the tag it has and says so; a bad tag reaches every session | Plugin not installed in a session | PR left unmerged, so a repository lags |
| Review of a change | Per repository | One place, one release (the tag) | Same as B | Per repository |

Context cost in numbers: the always-on text is cached after the first turn, so it occupies about
0.5% of a 200k window rather than being paid in full each turn. `kade-workflow` (~1,650 tokens)
already loads in most sessions; moving its short rules into the global `CLAUDE.md` can make B
cost close to nothing net. The real cost is attention, hence the 60-line cap.

Rejected:

- A git submodule, or a nested clone in each repository's `.claude/`: the outer repository cannot
  track files inside a nested repository, so repository-specific rules lose their home, and cloud
  checkouts do not bring the nested clone along.
- The global text pasted into the cloud setup script: no fetch at all, but the text then lives in
  the app's settings, where it cannot be diffed or reviewed.
- A `SessionStart` hook committed to each repository that fetches the text: one copy per
  repository (the problem of D). Kept only as the fallback in
  section 8 if user-level hooks do not run in the cloud.
- Managed policy `CLAUDE.md` or server-managed settings: the only documented route that reaches
  cloud sessions with plugins, but it is for organisations, not one person's account.

## 4. Recommendation: two repositories

Adopt **B** with a new repository.

| Repository | Holds | Reaches sessions through |
|---|---|---|
| `claude-skills` (this one) | Account skills only: `skills/`, the scenario harness in `scripts/`, the skill docs (`skill-scenarios.md`, `skill-scenario-report.md`, `skills-improvement-plan.md`, `skill-candidate-after.diff`) | Uploaded as account skills (unchanged) |
| `claude-global` (new) | Everything that applies to every repository: the global `CLAUDE.md`, `rules/`, `hooks/` (`context-guard.cjs`, the new `global-sync.cjs`, their tests), the settings fragment, the cloud setup script, this plan and `refactor-plan.md` | Checked out as `~/.claude` on the PC, the Mac and in the cloud |

Name: `claude-global` names what the repository is for, pairs with `claude-skills`, and avoids
`dot-claude` or `.claude`, which read like a project's `.claude/` folder.

Each repository's `CLAUDE.md` keeps repo facts only, plus a short section **"Overrides of global
rules"** that names each global rule it changes. Claude Code does not enforce "the repository
wins"; both files are simply in context, so an unstated conflict is a guess.

Skills stay out of `~/.claude/skills/`: they reach every surface as account skills, and a second
copy of the same name would clash.

**Both repositories are public.** Neither holds private data (the history of `claude-skills` was
scanned on 2026-10-09: no keys, tokens, emails or hostnames; it does name Kade's other
repositories and one issue, so publishing it reveals those names, nothing inside them). A public `claude-global` needs no login to fetch, so the
cloud setup and `global-sync` carry no token at all. Public means anyone can read it, not change
it: who can change the rules is still decided by tag protection and the PR rule on `main`
(section 6). Two consequences:

- A secret committed by mistake is public at once. GitHub secret scanning with push protection is
  on, on top of the allowlist and its test (section 5).
- The global `CLAUDE.md` is written for strangers to read: no hostnames, account IDs or facts
  about private repositories. Those belong in the repository they concern.

## 5. The `claude-global` repository

```
claude-global/
  .gitignore              ordinary ignores, plus rules/local*.md
  .gitattributes          * text=auto eol=lf   (Windows checkouts keep LF in .cjs and .md)
  deploy-exclude          the allowlist, below; copied to ~/.claude/.git/info/exclude
  CLAUDE.md               line 1: "Global rules: v<tag>"; under 60 lines
  rules/*.md              global path-scoped rules, only if needed
  hooks/
    context-guard.cjs     moved from claude-skills; path now $HOME/.claude/hooks/
    global-sync.cjs       new: update to the latest tag, merge the settings fragment
    *.test.cjs
  settings.global.json    the hook entries that global-sync merges into ~/.claude/settings.json
  setup/cloud-setup.sh    the text pasted into the cloud environment's setup script
  scripts/release.cjs     next / stamp / latest, called by the Release workflow
  scripts/*.test.cjs      release tests; repository checks (allowlist, sparse list, stamp)
  docs/                   this plan, refactor-plan.md
  README.md
```

**Only some paths are deployed.** `~/.claude` is a sparse checkout of
`/CLAUDE.md /rules/ /hooks/ /settings.global.json /.gitignore /.gitattributes`. `setup/`,
`scripts/`, `docs/` and the README exist only in the development clone.

**Two clones on each local machine:**

- `~/src/claude-global` (or wherever Kade keeps repositories): the development clone. Edits,
  tests and pull requests happen here.
- `~/.claude`: the deployed checkout, detached at a tag, sparse, never edited by hand. An edit
  made here would apply to every session at once, before any review.

**The deployed checkout ignores everything but the allowlist.** `~/.claude` also holds session
transcripts (`projects/`), history, caches and, on Linux, the login credentials
(`.credentials.json`). A normal ignore list is one forgotten line from pushing those. The
allowlist lives in `deploy-exclude` and is copied to `~/.claude/.git/info/exclude`, which applies
to that checkout only. (Not as the tracked `.gitignore`: there, `*` would also hide `docs/`,
`setup/` and `scripts/` in the development clone.)

```gitignore
*
!.gitignore
!.gitattributes
!CLAUDE.md
!rules/
!rules/**
rules/local*.md
!hooks/
!hooks/**
!settings.global.json
```

A test fails when a tracked path is neither in that list nor in the development-only paths
(`setup/`, `scripts/`, `docs/`, `README.md`, `deploy-exclude`). Machine-only text goes in
`~/.claude/rules/local.md`, which is loaded as a user rule and never tracked.

**`settings.json` is not tracked.** Claude Code writes it itself (an "always allow" at user
level, `/config`, a plugin enable), so a tracked copy would differ on every machine and pulls
would conflict. `global-sync.cjs` merges the entries in `settings.global.json` into it instead:
it owns only hook entries whose command points into `$HOME/.claude/hooks/`, replaces those, and
leaves every other key alone. Changed hook settings apply from the next session, because a
session reads its hooks at start.

## 6. Updates: `global-sync.cjs`

Registered as a user-level `SessionStart` hook (matcher `startup`), timeout 30 seconds (each git
call stops after 6, so a slow network cannot leave a half-done checkout). It never
fails a session: every path exits 0. Built in step 2 (`hooks/global-sync.cjs`, 12 tests against
real git repositories).

A release is a tag `vYYYY.MM.DD`, or `vYYYY.MM.DD.N` for a second one on the same day. The version
in use is line 1 of `~/.claude/CLAUDE.md`, `Global rules: <tag>`; a line without a release (the
step 1 probe's `v0-probe`, or none) counts as older than every release.

1. `git ls-remote --tags --refs origin 'v*'`: one small request; the highest release tag wins, and
   other tags (`v0.0.0-probe`, anything not numeric) are ignored.
2. If it is not newer than the version in use: nothing to do, nothing printed. It never moves
   backwards.
3. Otherwise: `git fetch --depth 1 origin tag <new>`, `git checkout -f --detach <new>`, rewrite
   `.git/info/exclude` from `deploy-exclude`, merge `settings.global.json`, and print
   `Global rules updated <old> -> <new> at session start. The text below replaces the <old> global
   rules loaded earlier in this session; ...` followed by the new `CLAUDE.md`. Claude Code adds a
   `SessionStart` hook's stdout to the context, so the session runs on the new rules at once.
   Still unverified: whether Claude Code also reloads the changed file; if it does, that one
   session carries the text twice (~1,000 tokens), and the print can be dropped later.
4. If anything fails: print `Global rules: could not check for updates; using <current>.` and stop.

`--install` (setup) does the same update without printing to the session, and rewrites the exclude
file and the settings even when nothing changed. Merging removes every hook entry whose command
points into `~/.claude/hooks/`, from every event, then adds the ones in `settings.global.json`; it
leaves every other key and hook alone, and an unreadable `settings.json` untouched.

**A tag is a release.** Pushing `v2026.10.12` reaches every session at its next start, on every
machine. So:

- **Since 2026-10-20 a release is Candidate, then Promote** (`docs/release-flow-plan.md`): an
  agent pushes `candidate/<sha>` at a commit on `main`; Kade runs Candidate there (stamp, tests,
  `vYYYY.MM.DD-rc.N`, a prerelease, a branch `rc/<rc tag>`), then Promote on that branch (the
  final tag on the same stamped commit). `rc` and `release.yml` are gone. The rest of this list
  is the history it replaced, and the guarantees it keeps: the stamp equals the tag, tags are
  never moved or deleted, `global-sync` takes only numeric tags.
- From 2026-10-11 to 2026-10-20 a release was the **Release** workflow
  (`.github/workflows/release.yml`), which Kade started on `rc` after merging a PR from `main` into `rc`. It picks the next tag from the UTC
  date (`scripts/release.cjs next`, which refuses an `rc` commit already released), writes it into
  line 1 of `CLAUDE.md` (`stamp`), runs all tests on that tree, and creates one commit with the
  stamp whose parent is the `rc` commit, the tag on it and a GitHub release. `rc` and `main` are
  never written, so the stamped commit is reachable only from its tag. The stamp and the tag
  therefore cannot differ. The earlier two-phase `release.cjs prepare` / `tag` on `main` was
  removed after the first workflow release, `v2026.10.11`.
- A tag ruleset on GitHub lets only Kade and GitHub Actions create `v*` tags and nobody move or
  delete them; `main` requires a PR (`rc` did too, until it was deleted on 2026-10-20).
- `global-sync.cjs` is the one file whose bug could stop updates everywhere, since it updates
  itself. It stays small, has the most tests, and every release is first tried in one session
  before Kade relies on it. Tags cannot be moved or deleted, so a bad release is fixed by a newer
  one. If the bad one broke `global-sync` itself: locally, `git -C ~/.claude fetch --depth 1 origin
  tag <fixed>` and `checkout -f --detach <fixed>` by hand; in the cloud, any edit to the setup
  script reruns it, and it starts from `ref` with that release's working `global-sync`, which
  moves to the fixed release.

**Cloud caching.** The cloud caches the setup script's result and reruns it only when the script
or the allowed hosts change, or after about seven days. Every cloud session therefore starts from
the cached tag and `global-sync` moves it forward, about a second or two per session, and the
first turn holds both the old and the new text (~1,000 extra tokens) until the cache refreshes.
Bumping the tag in the setup script after a release refreshes the cache; it is optional.

## 7. Setup

**Local, once per machine:** `setup/local-setup.ps1` on Windows, from PowerShell
(`powershell -ExecutionPolicy Bypass -File local-setup.ps1`); `setup/local-setup.sh` on macOS and
Linux. Both need `git` and `node` on the PATH, and both:

- stop before changing anything if `~/.claude` is already a git repository, if `settings.json`
  has hook entries in `~/.claude/hooks/` (global-sync would replace them), or if a file is in the
  way of the checkout;
- keep an existing `~/.claude/CLAUDE.md` as `~/.claude/rules/local.md`, loaded but never tracked;
- check out any release, then `global-sync --install` moves to the latest one, writes
  `.git/info/exclude` and registers the hook; they end by printing the version line and checking
  that `git status` in `~/.claude` is empty.

Not from Git Bash on Windows: it rewrites arguments that start with `/` into Windows paths, so
`git sparse-checkout set /CLAUDE.md` would receive `C:/Program Files/Git/CLAUDE.md`. And the
scripts look for files in the way themselves, because a sparse checkout **overwrites** untracked
files at its paths and exits 0, with only a warning (git 2.43); plain checkout refuses.

**Cloud, in the environment's setup script** (`setup/cloud-setup.sh`):

The file is the source; paste it as it is. It starts from `ref` (the first release, set once in
step 4), and `global-sync --install` then moves to the latest release, so later releases need no
edit here. Its core:

```bash
if git fetch -q --depth 1 origin "$ref" && git checkout -q -f --detach FETCH_HEAD; then
  git show HEAD:deploy-exclude > .git/info/exclude
  node hooks/global-sync.cjs --install
else
  echo "GLOBAL RULES FAILED TO LOAD ($ref). Tell Kade before doing anything else." > CLAUDE.md
fi
exit 0
```

- No token: the repository is public, so the fetch is anonymous. (The setup script runs before
  the session connects to the GitHub proxy, so a private repository would have needed a token
  stored in the environment, readable by every session.) The environment must allow
  `github.com` in its network settings.
- The script fails soft: with `set -e`, a GitHub outage would stop every session in the
  environment from starting. The fallback file makes the failure the first thing the session
  says.
- The cloud `~/.claude` is not empty: the platform keeps `skills/`, `plugins/`, `projects/`,
  policy files and its own hook scripts there (seen in a cloud session on 2026-10-09). The
  sparse, allowlisted checkout leaves all of them untracked and untouched.

## 8. Steps

0. **Create `claude-global`** (Kade creates the empty public repository, then turns on secret scanning with push protection and the tag ruleset). Move `hooks/`,
   `docs/global-rules-plan.md` and `docs/refactor-plan.md` from here, with a commit that names
   the source commit. Split the README. `claude-skills` keeps `skills/`, `scripts/` and the skill
   docs.
1. **Prove the cloud** in a throwaway environment, before anything else depends on it.
   **Done 2026-10-09** on Stella Rain `core`: all checks passed (section 9); `git -C ~/.claude
   status --short` printed nothing, so the platform's files stayed untracked. Checks:
   - the setup script above, with a test `CLAUDE.md`: `/context` lists `/root/.claude/CLAUDE.md`;
   - the platform's files in `~/.claude` are untouched, and `git status` there is clean;
   - a user-level `settings.json` written by the script is honoured: a test `SessionStart` hook
     in it runs;
   - a hook can reach `github.com`, so `global-sync` can fetch;
   - `github.com` is allowed in the network settings.

   If user-level hooks do not run in the cloud, the fallback is one line in each repository's
   `.claude/settings.json` that runs `node "$HOME/.claude/hooks/global-sync.cjs"`: a copy per
   repository, but one that never changes.
2. **Write `global-sync.cjs` test-first**, in the style of `context-guard.test.cjs`: same tag, new
   tag, fetch failure, settings merge keeps foreign keys, settings merge is
   idempotent, `--install` on an empty and on an existing `settings.json`. Plus the allowlist test
   and the stamp test. **Done 2026-10-09:** `hooks/global-sync.cjs` (12 tests),
   `scripts/release.cjs` (5), `scripts/repo.test.cjs` (3: allowlist, sparse list, stamp),
   `settings.global.json` (global-sync only; context-guard joins in step 5), and the setup script
   switched from the probe to `global-sync`. All 34 tests in the repository pass.
3. **Draft the global `CLAUDE.md`**: the few rules that must always apply (coding conventions;
   the order plan, test, gate, commit; where state is recorded; the Windows shell traps), and a
   note on what each line replaced. List the candidates from repository `CLAUDE.md` files and
   `kade-workflow` first and let Kade confirm each. Under 60 lines. **Done 2026-10-09:**
   `CLAUDE.md` (57 lines, stamp `v0` until the first release), the sources in
   `docs/global-claude-md-sources.md`, read from the `stella-rain` and `star-resonance`
   repositories only. A check keeps it within 60 lines, and another holds this repository's
   workflows to the new workflow rule.
4. **First release** with `scripts/release.cjs`; set `ref` in the cloud setup script to it; set up
   the PC, then the Mac (section 7). **Done 2026-10-09:** `v2026.10.09`; the cloud, the Windows PC
   and the Mac each quote it, and on both machines a stamp set back to `v0` was moved forward by
   the hook at the next session start. Setup scripts for both added afterwards, with 8 tests.
5. **Move context-guard to user level.** Change its paths from `$CLAUDE_PROJECT_DIR/.claude/hooks`
   to `$HOME/.claude/hooks`, then remove the vendored copy and its settings entry from each
   repository in the same PR, so it never fires twice. One PR per repository. **Done
   2026-10-09:** the entries are in `settings.global.json` (enjay27/claude-global#12),
   released as `v2026.10.09.3`; the vendored copies are gone from `app`
   (stella-rain/app#65), `core` (stella-rain/core#38) and `resonance-stream`
   (star-resonance/resonance-stream#289, which also dropped the CI step that ran the vendored
   test: the same test runs here). `moderation`, `.github`, `resonance-lab` and
   `stage-template` never had a copy. The hook fires at user level in a cloud session: its
   warning arrived at 214k tokens on 2026-10-09 (`UserPromptSubmit`). Open: the same on the PC
   and the Mac (stella-rain/app#5).
6. **Cut the duplicates** from repository `CLAUDE.md` files and `kade-workflow` once the global
   text is verified in a live cloud session, and add the "Overrides of global rules" section where
   needed. One PR per repository. **Done 2026-10-09 for the Stella Rain repositories:**
   `app` (stella-rain/app#64, 99 to 87 lines), `core` (stella-rain/core#37, 100 to 87) and
   `moderation` (stella-rain/moderation#3, 67 to 68, with its override: no auto-merge) and
   `.github` (56 to 54 lines, same override; delivered as a zip, Kade pushed it to `main` as
   `cc7fff0`). **Done for the Resonance repositories:** `resonance-stream`
   (star-resonance/resonance-stream#290, 93 to 87 lines, with its override: test first does not
   apply to `runbook/`) and `resonance-lab` (star-resonance/resonance-lab#85, 252 to 202 lines,
   no override). Then a dedupe pass on both: `resonance-lab` (star-resonance/resonance-lab#86,
   202 to 88 lines: five restatements removed, then the layout moved to
   `docs/repository-layout.md` and the tech stack and conventions to path-scoped rules, each
   move byte for byte) and `resonance-stream` (star-resonance/resonance-stream#291, 87 to 81
   lines: five restatements removed, no section moved). **Done 2026-10-09 for `kade-workflow`:**
   103 to 65 lines (enjay27/claude-skills#6; scenarios S3, S4, S5 and S8 pass 8 of 8 before and
   after, with the global file loaded). Open: the path-scoped rules loading in a real session
   (stella-rain/app#5).

## 9. Open questions

| Question | How to check | Status |
|---|---|---|
| Can the setup script fetch the repository? | Step 1 | **Yes** (2026-10-09): anonymous fetch of `claude/step1-cloud-probe` at `2dffd91` |
| Does the cloud environment allow `github.com`? | Step 1 | **Yes**, with `github.com` allowed in the environment's network settings |
| Is `~/.claude/CLAUDE.md` read in a cloud session started after the script? | Step 1 | **Yes**: the session quoted `Global rules: v0-probe` and named the file as the user's global instructions, next to the project's `CLAUDE.md`. `/context` is not available in cloud sessions, so the stamp is the check |
| Do user-level `settings.json` hooks run in the cloud, next to the platform's own hooks? | Step 1 | **Yes**: the probe's `SessionStart` hook ran (`source=startup`); the per-repository fallback is not needed |
| Can a hook reach `github.com` in the cloud? | Step 1 | **Yes**: `git ls-remote` in 811 ms |
| Is a `CLAUDE.md` changed by a `SessionStart` hook reloaded in that session? | Stamp set to `v0`, then a new session | **No** (2026-10-09, Windows and Mac): the session kept the `v0` text it loaded; the printed copy is what carries the update, so the print stays |
| Do `paths:` rules work at user level? | One test rule in `rules/` | Open; the docs show `paths:` for project rules only |
| How do `$HOME` hook commands run on Windows? | The PC in step 4 | **They run**: `global-sync` updated `v0` to `v2026.10.09` at session start |

## 10. How it is tested

Same bar as the skills: write the checks first. Each check asks the session to quote the version
stamp, `Global rules: v<tag>`, so the answer is exact and also shows a stale checkout.

- A fresh cloud session on `app` quotes the stamp of the latest tag (fails today).
- A fresh local session on the PC and one on the Mac do the same.
- After a new tag is pushed, the next session on each machine quotes the new stamp without any
  manual step.
- A broken setup (wrong tag) starts the session and makes it report "GLOBAL RULES FAILED TO LOAD"
  first. With `github.com` unreachable, `global-sync` reports "could not check for updates".
- `git status` in `~/.claude` is clean after a week of normal use on each machine (the allowlist
  holds, nothing Claude Code writes is tracked).
- After step 6, the same sessions still work with the duplicates removed.

## 11. Risks

- **One tag reaches every session.** Mitigation: `main` needs a PR, only Kade can create `v*`
  tags, `release.cjs` runs the tests, and each release is tried in one session first.
- **A bad `global-sync.cjs` cannot repair itself.** Mitigation: small file, most tests, the manual
  recovery in section 6, and the setup script's tag as a floor in the cloud.
- **Private files from `~/.claude` pushed to a public repository.** Mitigation: the allowlist, the
  test on it, secret scanning with push protection, and `~/.claude` is never a working copy:
  commits happen only in the development clone.
- **Other tools write into `~/.claude`.** `global-sync` merges only its own hook entries and
  keeps the rest, so wiring another tool installs stays and fires in every repository. Found
  2026-10-09: `graft init` had left five Graft hooks, `~/.claude/helpers/graft-hooks.cjs` and a
  user-wide `graft` MCP server on the Mac, on top of the project copies (each message twice).
  Mitigation: `code-graph` names such leftovers and offers their removal; a one-off cleanup
  script for the Mac was delivered on 2026-10-09 (Kade confirmed its run the same day).
  Nothing here checks for foreign entries.
- **Always-on text costs attention.** Mitigation: the 60-line cap and a review of each line
  against "would a missed rule cost a failed command or a wrong PR".

## 12. Sources (Claude Code docs, read 2026-10-09)

| Fact used above | Page |
|---|---|
| Plugins cannot ship `CLAUDE.md`; a plugin `SessionStart` hook can add text to context and refires on `compact` | `code.claude.com/docs/en/plugins/components`, `/hooks` |
| A `SessionStart` hook's plain-text stdout is added to Claude's context | `/hooks` |
| Cloud sessions do not install plugins a repository enables, nor its extra marketplaces | `/cloud-environments` ("What carries over"), `/plugins/loading` |
| Setup script runs before Claude Code launches; writing `~/.claude/CLAUDE.md` there loads it; check with `/context` | `/cloud-environments` ("Setup scripts") |
| Setup script is cached; reruns when the script or allowed hosts change, or after about seven days; must exit 0 | `/cloud-environments` |
| The agent proxy connects after the setup script (why a private repository would need a stored token) | `/cloud-environments` |
| `~/.claude/rules/*.md` exists and loads before project rules; `@~/…` imports are allowed | `/memory` |
