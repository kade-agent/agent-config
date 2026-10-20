# kade-agent/agent-config: this repository's own notes

The root `AGENTS.md` is the global rules, deployed to every machine as `~/.claude/AGENTS.md`, and
the root `CLAUDE.md` is the one line `@AGENTS.md` that imports them, so neither holds anything
about this repository. Claude Code reads this file as well when a session opens here;
`deploy-exclude` and the sparse checkout keep it out of `~/.claude`.

## State

- Current state: the organization Project "Kade Agent" (kade-agent #1), read as `STATUS.md` on
  the `status` branch of `kade-agent/code-quality-assurance` (private):
  `gh api repos/kade-agent/code-quality-assurance/contents/STATUS.md?ref=status --jq .content | base64 -d`
  or, with a clone beside this one,
  `git -C ../code-quality-assurance fetch origin status && git -C ../code-quality-assurance show origin/status:STATUS.md`.
- Work is tracked in this repository's issues, with command labels (`cmd:status-now`,
  `cmd:verify-not-verified`, ...) applied by the bridge in `kade-agent/.github`. A decision for
  Kade: assign the issue to him.
- The plan in progress is `docs/agent-migration-plan.md`; each of its steps is an issue.

## Gates

| Part | Gate |
|---|---|
| `AGENTS.md`, `CLAUDE.md`, `hooks/`, `scripts/`, `setup/`, `settings.global.json`, `agents.json`, `deploy-exclude` | `node --test` (CI: `test.yml`) |
| `setup/local-setup.sh` | Its tests skip on Windows: NOT VERIFIED there |
| The rules reaching sessions | A release: Actions → Candidate on a `candidate/<sha>` branch, then Actions → Promote on its `rc/<rc tag>` branch (Kade; `docs/release-flow-plan.md`) |
| Antigravity reading the rules and skills (`agent-sync`) | After a release, from the second Claude session start: an Antigravity IDE session answers from them (Kade, Windows) |
| `.github/workflows/` | YAML parses; NOT VERIFIED until they have run on GitHub |

## Version control

- The global rules' flow: `claude/<task>` from an up-to-date `main`, one task per PR. Releases
  are Kade's.
