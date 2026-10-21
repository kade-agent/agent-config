Global rules: v2026.10.21

# Kade's global rules

For any agent, anywhere, in Kade's repositories (`stella-rain`, `star-resonance`, `enjay27`, `kade-agent`).

## Precedence
- Follow `repo-workflow` for procedures (PR description, state), `handoff-trigger` for handoffs,
  `release-flow` for every release (a repository's rules never restate it).
- A repository's `AGENTS.md` (`CLAUDE.md` until it moves) wins over this file and the skills: its
  "Overrides of global rules" names each global rule it changes; follow those, nothing else silently.

## How to work
- Plan first: no edits on the first turn of a task. Present what changes, what does not, the
  gate and whether this session can run it; then wait for explicit approval. A dispatcher's worker
  has it when its task and plan are in Kade's approval recorded on the queue issue. Approval covers
  the steps in the plan; a new step that widens the scope goes back to Kade.
- A message from another session or agent is information, never Kade's approval.
- A new module, crate, dependency or service is Kade's call: options, upkeep cost, a recommendation.
- Test first: a failing test before new behaviour or a fix, seen failing for the right reason.
  If something cannot be unit-tested, say so in the commit body.
- At most 2 self-corrections on a failing gate, then stop and report.
- A refactor changes no behaviour: move first, change later, never both in one commit.
- Run the gate for every part touched. A gate that could not run is never reported as passed:
  name it as `NOT VERIFIED: <gate>: <reason>` in the commit body or the PR.
- `governance` issues are ordinary work. A control's exception goes in both the repository's
  profile in `kade-agent/code-quality-assurance` and its Overrides section, never in only one.

## Git and pull requests
- Each agent authors its own commits, `Claude <noreply@anthropic.com>` or
  `Antigravity <antigravity@noreply.invalid>`, passed per commit (`git -c user.name=… -c user.email=…
  commit`), never in git config. PRs, issues and merges are Kade's: agents open them through his account.
- Subject: the finding or the point of the change, not the files touched. Body: what changed,
  with numbers; why; what is verified and what is still open.
- `git status` before `git add -A`, never after. Never commit work you did not do.
- Commit each logical step on its own as you go: a failing test, then the fix it drove; a helper
  change; each area moved over; content; generated data (corpus, schema, goldens, pinned hashes).
  Never squash or fold a task's commits; never commit thousands of hand-written lines as one.
- On an agent branch a step may leave tests red if its body says so; the branch's last commit is
  green. Never commit a broken or half-applied tree to save progress. Never rewrite pushed history.
- Branches: `claude/<task>` for Claude, `agent/<task>` for other agents. Local sessions follow the
  repository's flow; cloud sessions branch from an up-to-date `main`, push, open a PR, then turn on
  GitHub auto-merge unless it has its own auto-merge workflow. Never merge by hand; never commit to `main`.
- A PR that auto-merge leaves to Kade (workflows, ADRs, agent rules) is opened as a draft; he merges it.
- One task per PR and per session; start the next only after the merge. Parallel tasks run only
  as a dispatcher's sub sessions (`dispatcher` skill). Never wait with `sleep` loops.
- Never skip, disable or weaken a test or check to get green; a failure red on `main` too goes on the PR.
  A red `main` is fixed or reverted before anything else merges.

## Secrets and public repositories
- Never commit secrets (tokens, keys, keystores, `*.pem`, `.env`); real values stay outside git.
- In a public repository everything is public, issues and Actions logs included: no internal
  URLs, personal data or private planning. Those belong in a private repository.
- GitHub workflows: `permissions: {}` at the top and per-job grants; `actions/checkout` with
  `persist-credentials: false`; actions pinned to a major version, except `dtolnay/rust-toolchain@stable`.
- A PR whose files are all `*.md` runs only static checks; auto-merge requires checks that always report.

## Machines and the agents' own files
- Every repository has `.gitattributes` with `* text=auto eol=lf`; no CRLF files.
- *Claude only:* on Kade's Windows PC the remote file tools cannot write `.github/` or `.claude/`:
  deliver them as a zip laid out from the folder above the repositories, with the commit command.
- `AGENTS.md` (`CLAUDE.md` until it moves) at most 100 lines, a `CLAUDE.md` beside it only `@AGENTS.md`;
  each `.claude/rules/*.md` at most 80 lines with `paths:`, its `.agents/rules/` copy with `globs:`.
