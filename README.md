# agent-config

Kade's Claude configuration for every repository: the global rules, the hooks, the account
skills, and the plans that move each repository onto them. Public. This repository was
`claude-global` under Kade's own account until 2026-10-15 (`docs/agent-migration-plan.md`, step 2);
the skills moved in from `kade-agent/claude-skills` with their history (step 4).

| Path | What | How it is used |
|---|---|---|
| `AGENTS.md` | The global rules, deployed as `~/.claude/AGENTS.md`; line 1 is the release | Released by the Release workflow |
| `CLAUDE.md` | The one line `@AGENTS.md`: Claude Code loads `~/.claude/CLAUDE.md` in every session, and it imports the rules | Deployed with them |
| `hooks/context-guard.cjs` | Shows the context number at 300k tokens, recommends (never forces) a handoff at 400k (never later than 40% / 60% of the window), and after a compaction | User-level `UserPromptSubmit` and `SessionStart` (compact) hooks, registered from `settings.global.json`; repositories no longer vendor a copy |
| `hooks/global-sync.cjs` | Keeps `~/.claude` on the latest release tag; prints the new rules into the session that moved; then runs `agent-sync` | User-level `SessionStart` hook, registered from `settings.global.json` |
| `hooks/agent-sync.cjs` | Keeps the other agents' copies: the one-line rules include and the skills, for each agent in `agents.json` whose folder exists; touches nothing it did not write | Called by `global-sync` on every run; no hook of its own |
| `agents.json` | Antigravity: the rules include `~/.gemini/AGENTS.md`, the skills folders `~/.gemini/config/skills/` (IDE, app) and `~/.gemini/antigravity-cli/skills/` (CLI) | Read by `agent-sync` |
| `settings.global.json` | The hook entries merged into `~/.claude/settings.json` (only entries pointing into `~/.claude/hooks/`) | Read by `global-sync` |
| `deploy-exclude` | The allowlist for `~/.claude`: nothing else there can be tracked | Copied to `~/.claude/.git/info/exclude` |
| `setup/cloud-setup.sh` | Checks this repository out into `~/.claude` in a cloud session | Pasted into the cloud environment's setup script |
| `setup/local-setup.ps1`, `setup/local-setup.sh` | The same on a Windows PC (PowerShell, not Git Bash) and on macOS or Linux, once per machine | Run by Kade; they stop before overwriting anything |
| `.github/workflows/release.yml` | Release: on `rc`, tags `vYYYY.MM.DD` (`.2` later the same day) on a commit that stamps line 1 of `AGENTS.md`, with a GitHub release | Started by Kade (Actions → Release → Run on `rc`) after a PR from `main` into `rc` |
| `.github/workflows/candidate.yml` | Candidate: on `candidate/<12-character sha>` at a commit on `main`, tags `vYYYY.MM.DD-rc.N` on a commit that stamps line 1 of `AGENTS.md`, with a prerelease; deletes the branch whatever happens (`docs/release-flow-plan.md`) | Started by Kade (Actions → Candidate → Run on the branch) after an agent pushes it |
| `.github/workflows/promote.yml` | Promote: from a `-rc.N` tag, tags the same commit `vYYYY.MM.DD` and makes the release, nothing rebuilt | Started by Kade (Actions → Promote → Run on the rc tag) after trying the candidate |
| `.github/workflows/candidate-guard.yml` | Deletes a `candidate/*` branch pushed a second time or not at a commit on `main` | Runs on every push to `candidate/*` |
| `.github/workflows/project-sync.yml` | Adds issues to the Project "Kade Agent" and applies their `cmd:` labels, through the bridge in `kade-agent/.github` | Runs on issue events |
| `.claude/CLAUDE.md` | This repository's own notes: where its state is, its gates | Read by sessions opened here; never deployed |
| `agent-skills/repo-workflow/` | The procedures behind the global rules for any of Kade's repositories: plan, gates, commit and PR style, state | Saved as a claude.ai account skill; every skill here is also copied to Antigravity by `agent-sync` |
| `agent-skills/release-flow/` | Every release: a version PR into `main`, a PR from `main` into `rc` that the agent opens, then Kade's manual Release run on `rc`; what a repository needs for it | Account skill |
| `agent-skills/handoff-trigger/` | When to ask about or recommend a handoff and a new session, from the context size and the next task | Account skill |
| `agent-skills/session-resume/`, `session-handoff/` | Start a session from the recorded state; close one with a starter prompt | Account skills |
| `scripts/skills/` | Scenario harness and fixtures for testing the skills | Run by the session changing a skill |
| `docs/skills/` | The skills' scenarios, their results, and the improvement plan | Read by the session changing a skill |
| `scripts/release.cjs` | `next`, `rc <tag>`, `stamp <tag>`, `latest`, `check-candidate <branch>`, `checks-passed <run id>`, `check-promote <rc tag>` | Called by the Candidate, Promote and Release workflows |
| `docs/release-flow-plan.md` | Accepted 2026-10-20: releases from an immutable candidate branch, tagged `-rc.N`, then promoted without a rebuild | Built step by step (section 6) |
| `docs/global-rules-plan.md` | One global rule set checked out as `~/.claude` on every machine and in the cloud, plus rules per repository | Closed 2026-10-09; every step done |
| `docs/refactor-plan.md` | Moving `CLAUDE.md`, `MEMORY.md`, skills and rules to this setup, per repository | Read by the session doing the work |
| `docs/governance-plan.md` | Accepted: two daily reports over the working repositories, drift (rules and workflows, filed as issues) and daily results (per owner), built in `kade-agent/code-quality-assurance` | Built step by step (section 9) |
| `docs/repo-rules-review.html` | 2026-10-11 audit: each repository's rules and workflows against the global rules, with advice and proposed global changes | Read as an Artifact page (the Mermaid diagrams render there); its actions become their own PRs |

Each repository's `CLAUDE.md` keeps its own gates, paths and branch rules and names what it
overrides of the global rules; nothing here holds repository-specific facts.

## Changing a skill

Edit `agent-skills/<name>/SKILL.md` here, merge, then ask Claude to propose the updated skill and
save it from the card. The file here is the source; the account copy follows it. Account skills
apply in Claude Code (terminal and cloud) and Cowork sessions. `agent-skills/` is deployed as
`~/.claude/agent-skills/`, which Claude does not load (only `~/.claude/skills/`, where it would load
them a second time); `agent-sync` copies it to Antigravity's skills folders from the release on.

`repo-workflow` was `kade-workflow` until 2026-10-09. The code graph skill (`graft-kade` until
2026-10-09) and its bundle were removed on 2026-10-16. The
dated records in `docs/skills/` were written in `claude-skills` and keep its paths: there,
`skills/` is `agent-skills/` here, `scripts/` is `scripts/skills/`, `docs/` is `docs/skills/`.

## Tests

```bash
node --test        # every *.test.cjs: hooks, release script, repository checks
```

## The context hook

The hook assumes a 1M window (the default of Opus 4.7+, Sonnet 5+ and the Fable models). Set
`CLAUDE_CONTEXT_WINDOW=200000` for a 200k-window model; the lines then fall to 80k and 120k.
