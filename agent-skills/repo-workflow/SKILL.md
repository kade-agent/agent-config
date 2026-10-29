---
name: repo-workflow
description: Kade's standing way of working in every one of his repositories (Stella Rain, resonance-stream, lakehouse-k8s and others). Use at the start of any task that edits code, config, CI or docs in a repository - plan first, test first, run the gates, commit and PR style, and recording state.
---

# Kade's workflow

The repository's `AGENTS.md` (or `CLAUDE.md` where not yet migrated) says **what** applies there:
its parts, gates, branches and where state lives. This skill says **how** to work in any of them,
whichever agent you are. The standing rules (plan first, test first, gates, commit style) are the
global rules in `~/.claude/AGENTS.md` (`~/.claude/CLAUDE.md` until it moves); this skill holds the
procedures behind them.

## 1. Plan before editing

- Locate the code first, then present an impact analysis: which files change, what logic changes,
  what does not, which gate applies, and whether this session can run that gate.
- **Read another repository at its `origin/main`**, fetched first (`git fetch origin main`),
  never from a local or older clone: a stale clone gave the 2026-10-11 audit two false findings.
- **A new module, crate or dependency is decided with Kade first**: bring the options, their
  trade-offs for long-term release maintainability (API and format stability, upgrade cost,
  tooling lock-in) and your recommendation, then build after he picks.
- **Decide before you wire.** Wiring, a new repository or a new integration comes after a written
  plan or ADR that Kade has accepted. If the plan says `proposed`, ask him to accept it first
  (or accept with changes); add no dormant caller, disabled workflow or stub for an undecided design.
- **A decision brief** is: 2 to 3 options in a table, the long-term maintenance cost of each,
  your recommendation, open questions. No code, file or dependency until he picks.
- **Outward actions** (a public repository, an issue or PR made for a test, a transfer, a secret,
  a message to others): before doing one, say what it creates, who can see it and how it is
  removed afterwards (and what permission that needs); then ask. A bare "ok?" is not enough.
- "Follow your recommendation" from Kade means: do what you recommended.

## 2. Execute

- One task at a time.
- Edit files in place. Never retype a file from earlier tool output, which may be truncated.

## 3. Verify honestly

- **A failing gate is not yet your change's fault:** run it on the unchanged checkout first
  (stash or the previous commit). A missing tool or target is installed if the host is allowed,
  otherwise `NOT VERIFIED`. Before reporting a hang, check your own time limit.
- A blocked network host is **asked for**, never worked around: name the host and what needs it.
  No mirrors, stubs or patched dependencies.

## 4. Commit and pull request

- Pre-existing changes stay untouched unless the task is about them.
- Push only a green local gate. If the repository commits locally, commit each finished task
  automatically, without being asked; `git push` to a shared branch is Kade's unless the
  repository's flow says otherwise.
- **Subject examples.** Good: `A shared log file lost 1780 of 4000 lines under rotation; one file
  per pod lost none`. Bad: `update values.yaml`, `fix bug`.
- **Body:** also says which earlier belief the change corrects.
- **PR title:** the point of the change, then the task ID when there is one:
  `The Guide body is three scene Labels (GUIDE-MSGID)`. No `feat:`/`fix:` prefixes.
- **PR description:** this template, every heading present, in this order, and no other `##`
  heading. An empty section says `None`. The PR is the session record; there are no separate
  session notes unless the repository still keeps them.

  ```markdown
  Closes <owner>/<repo>#<n>
  Task: <ID> · Plan: plans/<lane>/<task>.md@<full 40-character sha>

  ## What changed and why
  ## Verified
  - `<gate command>`: <result>
  ## NOT VERIFIED
  - NOT VERIFIED: <gate>: <reason>
  ## Kade's steps
  - [ ] <merge the draft / a device check / run X on the PC>
  ## Follow-ups
  - <one item per line; each could become an issue: ADR departures, open questions>
  ## Placeholders
  - <each value taken where none was given, with its value>
  ## Wrong turns
  <approaches tried and abandoned>
  ```

  - Line 1: `Closes` (or `Part of`) with `<owner>/<repo>#<n>`, never a bare `#<n>`; several are
    comma-separated.
  - Line 2: `Task: none` outside a dispatcher's queue. In a **public** repository it is only
    `Task: <ID>`: the task's issue in the private tasks repository links back to the PR.
  - *Kade's steps* is everything he must do before or after the merge, as a checklist; nothing
    of his goes under *Follow-ups*.
  - The Claude Code footer goes after *Wrong turns*.
- **Check it before opening the PR:** `node <this skill>/scripts/pr-body.cjs check [--public] <file>`
  (`~/.claude/agent-skills/repo-workflow/` on a machine set up from agent-config). From its
  rollout on, the reusable `pr-body.yml` in `kade-agent/.github`, called from each org's
  `.github`, runs the same script on every PR, `*.md`-only ones included, and fails it on an error; `extract` prints the sections as JSON for the dispatcher.

## 5. Record state where the repository keeps it

- **Org Project repositories** (Stella Rain in `stella-rain`, Resonance in `star-resonance`, Kade Agent in `kade-agent`): issues plus `cmd:` labels
  (`cmd:status-now`, `cmd:verify-not-verified`), never a state file. A check that needs a
  machine or a device: `cmd:verify-needs-windows`, `-macos`, `-android` or `-iphone`. A decision
  that is Kade's: assign the issue to him, no label; work a session can take stays unassigned.
- **`MEMORY.md` repositories**: update its *Now* section, one line per item, decisions by ID
  only. Detail goes where that repository's `AGENTS.md` (or `CLAUDE.md`) says.
- State changes go in the same branch or commit as the work they describe.
