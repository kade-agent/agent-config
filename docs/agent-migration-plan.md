# Plan: AGENTS.md for every agent, Claude Code and Antigravity

- **Scope:** the global rules, the account skills, the hooks and setup in this repository and
  `enjay27/claude-skills`; the drift and daily checks in `kade-agent/code-quality-assurance`;
  the instruction files of every working repository. Today all of it is written for Claude Code.
- **Status:** **accepted** (2026-10-15, by Kade, in the merge of this change). Decisions 1 to 6
  are his; nothing is open (section 6).
- **Related:** `docs/global-rules-plan.md` (how the rules reach a session), `docs/governance-plan.md`
  (its decision 10: this repository and `claude-skills` move to `kade-agent` in a task of their
  own, an inventory of everything that names them first).
- **Decided by Kade, 2026-10-14:**
  1. The second agent is **Antigravity** (CLI, IDE and app). Gemini CLI is out: it was replaced
     by Antigravity CLI on 2026-06-18 for the unpaid tier and Google One.
  2. Branches: **`claude/<task>`** for Claude (Claude Code cloud requires it), **`agent/<task>`**
     for every other agent; the commit author says which agent. A further agent needs no new
     prefix.
  3. `claude-global` and `claude-skills` are **transferred to `kade-agent`**; this one is renamed
     ("global" does not say what it is), the skills move into it and `claude-skills` is archived.
  4. Path-scoped rules: **copies plus an equality check** (section 3).
- **Decided by Kade, 2026-10-15:**
  5. This repository becomes **`kade-agent/agent-config`**.
  6. Antigravity commits are authored **`Antigravity <antigravity@noreply.invalid>`**: `.invalid`
     is a reserved domain, so no GitHub user can ever verify the address and claim the commits.

## 1. What each agent reads (official docs, read 2026-10-14)

| | Claude Code | Antigravity |
|---|---|---|
| Global rules | `~/.claude/CLAUDE.md` only; there is no user-level `AGENTS.md` | `~/.gemini/AGENTS.md` or `GEMINI.md` (also under `~/.gemini/config/`) |
| Repository rules | `CLAUDE.md`; `AGENTS.md` only when no `CLAUDE.md` is in the folder or above (v2.1.277+, and not in every session) | `AGENTS.md` / `GEMINI.md` per folder, cumulative, the more specific folder wins |
| Rules for some paths | `.claude/rules/*.md`, front matter `paths:` | `.agents/rules/*.md`, front matter `trigger: glob` and `globs:`; no valid `trigger` and the file is silently dropped |
| Including a file | `@path` | `@[label](path)` inlines (`~/` expands); a bare `@file` is only a path mention |
| Limits | Kade's rule: 100 lines | 24 KB per file after includes; 20k tokens for global and always-on rules together |
| Skills | claude.ai account; `~/.claude/skills`, `.claude/skills` | IDE and app `~/.gemini/config/skills/` (proven in step 3); CLI `~/.gemini/antigravity-cli/skills/`; repository `.agents/skills/`; same `SKILL.md` format |
| Hooks | `settings.json`; stdout text joins the context | `~/.gemini/config/hooks.json` or `.agents/hooks.json`; events `SessionStart`, `PreInvocation`, `PostInvocation`, `PreToolUse`, `PostToolUse`, `Stop`; stdin camelCase JSON with `transcriptPath`, no token count; context goes in through `injectSteps` in a JSON reply; timeout in seconds, 30 by default. The IDE 1.107.0's own docs list no `SessionStart` and inject only `ephemeralMessage`, `userMessage` or `toolCall` |

A `CLAUDE.md` holding only `@AGENTS.md` makes Claude read `AGENTS.md` in every session, never
twice. Claude Code never reads `.agents/`; Antigravity never reads `.claude/`.

### Step 3 results (2026-10-15, Kade's PC: Claude Code 2.1.296, Antigravity IDE 1.107.0)

Fixtures in temporary folders and in `~/.gemini`, each holding a canary word; all removed after.

| Check | Result |
|---|---|
| Claude, project: `CLAUDE.md` is only `@AGENTS.md` | **Pass.** The canary in `AGENTS.md` answered |
| Claude, `AGENTS.md` alone; `CLAUDE.md` without the import | **Pass** both: read alone; not read beside a `CLAUDE.md`. So the shim loads it exactly once |
| Claude, user level (`~/.claude/CLAUDE.md` → `@AGENTS.md`) | **NOT VERIFIED:** a temporary `CLAUDE_CONFIG_DIR` is not logged in, and credentials are not copied. Step 7 proves it on a real machine |
| IDE: `~/.gemini/AGENTS.md` as one `@[label](~/...)` line | **Pass.** The canary was in the first reply, before any tool call: the include inlines and `~/` expands |
| IDE: a skill in `~/.gemini/config/skills/` | **Pass.** It loaded and was opened as a skill file |
| IDE: hooks | **Did not run, three tries.** `SessionStart` (not in the IDE's docs), then `PreInvocation` with an `ephemeralMessage`, then the same with `"enabled": true` in both `~/.gemini/config/hooks.json` and the workspace's `.agents/hooks.json`, each script logging before it reads stdin: no log, no message. IDE 1.107.0 starts no hook from either file; whether Customizations → Hooks lists them was not checked |
| IDE: token usage in `transcript.jsonl` | **None.** No token or usage field in `transcript.jsonl` or `transcript_full.jsonl` |
| `agy` CLI | Not installed then; checked on 2026-10-16, below |

Found on the way: with nothing to answer from, the IDE agent ran about 30 shell commands without
asking (all reads): it listed the home folder and searched other tools' files, Claude Code's
session transcript in `~/.claude/projects/` among them (section 6).

### Step 3, the CLI (2026-10-16, Kade's PC: Antigravity CLI 1.3.6, model `gemini-4-argon-medium`)

Kade's own four sessions, read for field names and numbers only; then a fixture workspace in a
temporary folder (`.agents/hooks.json` and a Node script), removed after. Two `agy -p` runs, no tools.

| Check | Result |
|---|---|
| CLI: token usage in the transcript | **Yes.** Every `PLANNER_RESPONSE` line of `transcript.jsonl` and `transcript_full.jsonl` has `input_tokens`, `cache_read_tokens` and `output_tokens`; `input_tokens + cache_read_tokens` is the context of that model call (13,724 cold; 2,269 + 11,677 on the next call) |
| CLI: a `PreInvocation` hook in the workspace's `.agents/hooks.json` | **Pass.** The log says `loaded 1 named hooks from 1 hooks.json file(s)`; the script logged before reading stdin; its `injectSteps` `ephemeralMessage` canary was the reply. No `"enabled"` needed |
| CLI: what the hook gets | stdin keys `artifactDirectoryPath`, `conversationId`, `initialNumSteps`, `invocationNum`, `modelName`, `transcriptPath`, `workspacePaths`. `transcriptPath` is `transcript_full.jsonl` under `~/.gemini/antigravity-cli/brain/<id>/.system_generated/logs/`, with forward slashes; `invocationNum` starts at 0 on every turn |
| CLI: the hook reading usage | **Pass.** On the second turn (`--conversation`) the hook read 13,470 from the previous call. The first call of a conversation has nothing to read |
| CLI: `~/.gemini/config/hooks.json`, `SessionStart` | Not tried. The log shows two hook loads per run (`0 from 0`, then `1 from 1`): which files each one reads is unknown |
| CLI: the model's window | Unknown: `agy models` lists names only |

Left behind: the test conversation (two turns) in `~/.gemini/antigravity-cli/` (Antigravity's own store).

## 2. Target

| | Now | After |
|---|---|---|
| Global rules | `CLAUDE.md`, line 1 the release | `AGENTS.md`, line 1 the release; `CLAUDE.md` is the one line `@AGENTS.md` |
| On disk | sparse checkout in `~/.claude` | unchanged: one copy, in `~/.claude` |
| Claude Code | `~/.claude/CLAUDE.md` | `~/.claude/CLAUDE.md` → `@AGENTS.md` → `~/.claude/AGENTS.md` |
| Antigravity | — | `~/.gemini/AGENTS.md` is the one line `@[Kade's global rules](~/.claude/AGENTS.md)`: no symlink or copy, so it works on Windows |
| Skills | `claude-skills`, saved to the claude.ai account | `agent-skills/` here (not `skills/`: inside `~/.claude` Claude would load them a second time beside the account skills); still saved to the account for Claude; copied to `~/.gemini/config/skills/` (IDE, app) and `~/.gemini/antigravity-cli/skills/` (CLI) |
| Hooks | `global-sync`, `context-guard`, Claude only | also an Antigravity `SessionStart` hook running `global-sync`, replying in JSON, where the product has the event (step 3: the IDE's docs do not); `context-guard` only if a transcript holds token usage (step 3: the IDE's does not, the CLI's does) |
| Agents | Claude assumed everywhere | `agents.json`: per agent its rules pointer, skills folder, hook file and reply format. `global-sync --install` and the setup scripts go through it; a new agent is one entry |
| Each repository | `CLAUDE.md` | `AGENTS.md` (`git mv`) and the `@AGENTS.md` shim |

Unchanged: the checkout path `~/.claude`, the `CLAUDE_GLOBAL_*` variable names (a later
move-only PR if wanted), the release flow, the hooks' behaviour in Claude, and the governance
Routines, which still run on Claude (`drift-claude.cjs`, `quality-claude.cjs` and the `claude`
controls keep their names).

## 3. Path-scoped rules

Each `.claude/rules/<part>.md` gets a copy `.agents/rules/<part>.md`: the same body, with
`trigger: glob` and `globs:` naming the same patterns as `paths:`. Copies, not symlinks: Kade
works on Windows. A new drift control checks that every pair has the same body and patterns and
that no copy is missing.

## 4. `kade-agent/code-quality-assurance`

It has to accept both files **before** the first repository moves, or the next drift run files
"no CLAUDE.md" everywhere; it requires `AGENTS.md` only after the last one.

| Where | Change |
|---|---|
| RF-01 | `AGENTS.md` at most 100 lines; later, `CLAUDE.md` exactly the shim |
| RF-02 | the Overrides section is read from `AGENTS.md`; the fix text in `drift-issues.cjs` names it |
| RF-04, the instruction and living file lists | add `AGENTS.md`, `.agents/rules/`, `.agents/skills/` |
| New control | the rules copies of section 3 |
| MG-01, MG-02, `daily-lib.cjs`, the profiles' `heads` | `heads` becomes a list, `["claude/*", "agent/*"]` |
| `daily.md`, `drift.md`, profiles naming `CLAUDE.md` | `AGENTS.md` |
| Its own `CLAUDE.md` and its line-cap test | moved like every repository |
| `controls.json` `global_rules` | raised after the release of step 8 |

## 5. Steps

Each step is one PR, merged before the next.

1. **This plan.**
2. **Inventory and transfer.** Every file, workflow, profile and setup script naming
   `enjay27/claude-global` or `enjay27/claude-skills`. Kade transfers both and renames this one
   (`gh` in a local session); the PR fixes the names found. GitHub redirects meanwhile; the
   cloud environment's setup script is pasted by Kade.
3. **Checks before building.** Done 2026-10-15 with the IDE; results in section 1. The CLI
   on 2026-10-16 (section 1): its transcript has token usage and a workspace hook runs. The IDE's
   hooks are still unproven.
4. **Skills move in** under `agent-skills/`, history kept; `claude-skills` archived.
5. **Skills accept both:** "the repository's `AGENTS.md` (or `CLAUDE.md` where not yet
   migrated)", `claude/*` or `agent/*`, and what to do without `context-guard`. Kade saves them
   to the account again.
6. **`code-quality-assurance` accepts both** (section 4).
7. **The file move, in two releases** (Kade, 2026-10-15). Every machine's sparse checkout lacks
   `/AGENTS.md`, and the old `global-sync` does the checkout of the move's release, so one release
   would leave `CLAUDE.md` the shim and no `AGENTS.md`.
   - **7a, `global-sync` learns `AGENTS.md`:** reads the stamp from `AGENTS.md`, falling back to
     `CLAUDE.md`; adds `/AGENTS.md` to the sparse checkout on every run; prints the stamped file;
     `deploy-exclude` and the three setup scripts' sparse lists; an existing `~/.claude/AGENTS.md`
     stops the local setup. Released before 7b, so machines run it when 7b arrives.
   - **7b, the move only:** `git mv CLAUDE.md AGENTS.md`, the shim, the release stamp,
     `release.yml`, `test.yml`, `repo.test.cjs`, the README. A machine that skipped 7a takes 7b
     with the old hook and no `AGENTS.md`; its next session's hook finds no stamp, checks
     `AGENTS.md` out and prints the rules (tested in 7a).
8. **The rules' wording:** `AGENTS.md` throughout, the branch and author rules of decision 2,
   Claude-only rules marked. Release; raise `global_rules` in `code-quality-assurance`.
9. **`agents.json` with Antigravity:** the include line, the skills copied to both folders, the
   hook. The hook is tested first in the product Kade uses (the IDE's did not run in step 3).
   The setup scripts stop before overwriting a file of Kade's, as they do today.
   Decided 2026-10-16 (#48): no Antigravity hook yet; Claude's `global-sync` calls
   `hooks/agent-sync.cjs` on every run, which keeps the include and the copies. Antigravity's own
   hook waits for a test on the PC that shows one running.
10. **Dropped (Kade, 2026-10-27): `context-guard` itself is removed, since Kade reads the context
    size in the UI.** It was: **`context-guard` for Antigravity** (`PreInvocation`, `injectSteps`), only if a transcript
    holds token usage. The IDE's does not (step 3); the CLI's does, and a `PreInvocation` hook
    in a workspace's `.agents/hooks.json` runs there and can read it (2026-10-16), so step 10 is
    for the CLI only. Before it is built: a user-level hook file the CLI loads (the one
    `agent-sync` would write; only the workspace file is proven) and the model's window.
11. **Each working repository, one PR each:** `git mv` to `AGENTS.md`, the shim, the
    `.agents/rules` copies, and `agent/*` in its auto-merge workflow if it has one. Pilot on
    `stella-rain/moderation` (not `stage-template`: a template's file is copied into every new
    repository), then the rest.
12. **`code-quality-assurance` requires `AGENTS.md` and the shim;** the `CLAUDE.md` fallbacks
    leave the skills and `global-sync`.

## 6. Open

1. **Antigravity running commands unasked** (step 3): before it works in Kade's repositories,
   Kade decides its terminal setting (ask before each command, or an allow list). Its reads reach
   other tools' transcripts and caches in the home folder.
2. **The CLI:** Kade installed `agy` 1.3.6 on the PC on 2026-10-16. Its `SessionStart` and a
   user-level hook file are untried (section 1).

Decisions 5 (the name, chosen over `agent-home` and `ruleset`) and 6 (the author, chosen over a
Google address) settled what this section held before. No control checks authors today.

## 7. How it is tested

| Gate | Where |
|---|---|
| `node --test` here and in `code-quality-assurance` | any session |
| The skills' scenario harness, Claude side | any session |
| One drift run and one daily run by hand after step 6, their pages read by Kade | Kade |
| Everything Antigravity | Kade's PC; `NOT VERIFIED` until then |
| Each working repository's CI | its PR |

## 8. Sources (read 2026-10-14)

- Claude Code: <https://code.claude.com/docs/en/memory> (AGENTS.md), <https://code.claude.com/docs/en/skills>
- Antigravity: <https://antigravity.google/docs/rules/>, <https://antigravity.google/docs/hooks/>,
  <https://antigravity.google/docs/cli/gcli-migration/>, <https://antigravity.google/docs/skills/>
  (read 2026-10-15); the IDE's own copy in `~/.gemini/antigravity-ide/builtin/skills/agy-customizations/docs/`
- Gemini CLI's retirement notice: <https://geminicli.com/docs/hooks/>
