---
name: task-worker
description: The hard rules for a worker session a dispatcher started on one task of a queue - read the plan at its pinned sha, test first, push after every commit, open the PR, subscribe to it, and report only a BLOCKED line. Use when a session's first message says it is a worker for a queue issue, or names the task-worker skill.
---

# Task worker

Version: 2026-10-27

A dispatcher started you on one task. Its message (the dispatcher skill's
`references/worker-prompt.md`) names your task id, sub-issue, dispatcher session and branch, fills
the slots `Merge path:`, `Protected paths:`, `Leave alone:`, `Read first:`, `Approval:`,
`Other running workers:`, `Generated files:` and `Known moves since Base:`, and ends with your
plan's line. The rules below read those slots by name. If the message names another version than
the one above, the rules you hold are not the ones it dispatched: do as the message says.

```text
HARD RULES
1. YOU MUST NOT NEED ANY DECISION OR APPROVAL FROM KADE. Kade has already agreed to everything in the accepted ADRs and in the decisions this plan cites. Never ask him, never wait for him. Where a value is unspecified, take the simplest placeholder that satisfies the task and list it in the PR under "Decisions taken (placeholders)". A placeholder is a value (a number, a string, a default), never a new dependency, module, service, schema or stub for an undecided design: those are `BLOCKED <task id>: <what is undecided>`. If the plan's steps need a file outside your list, touch it with the smallest change and say so in the PR. A new step or a new behaviour the plan does not hold, or a technical impossibility, is `BLOCKED <task id>: <why>` (rule 10).
2. Do NOT edit the `Protected paths:` unless the plan says so (then as a DRAFT PR). ADR changes the work needs go in the PR body's "Follow-ups" section.
3. Do not touch the `Leave alone:` list.
4. Read first: the global rules, the repository's AGENTS.md/CLAUDE.md, skill `repo-workflow`, and everything in `Read first:`.
5. Plan first: Kade approved this plan before you were started (`Approval:`). Read your sub-issue, and your plan at the pinned sha, never a newer version: attach `<owner>/tasks` read-only (add_repo, access `read`), clone it as add_repo says, then `git -C <clone> fetch --depth 1 origin <full plan sha> && git -C <clone> show <full plan sha>:<plan path>`. The `Known moves since Base:` are merges the dispatcher already checked and the plan waits for: do not block on them, and re-read every line number the plan gives on current main. If `main` moved on in your files since the plan's `Base:` commit in any other way, stop: `BLOCKED <task id>: main moved on in <files>`. Your first output is your reading of it (what changes, what does not, the gate, what you can run here); then proceed without waiting. Anything beyond the plan is rule 1's BLOCKED.
6. Test first: write the failing test and see it fail for the right reason, then implement. Commit each logical step separately and PUSH after every commit (`git push -u origin <branch>`), so the work survives a stopped session. Never one big commit. Your pushes are your progress: send no lease or progress messages; the dispatcher checks your session, and an idle session with an open PR and no merge gets a nudge. Author: `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`; every message ends with `Co-Authored-By: <Claude model name> <noreply@anthropic.com>`. Never squash, never rewrite pushed history, never commit to main. At most 2 self-corrections on a failing gate, then BLOCKED.
7. MERGE CONFLICTS (`Other running workers:` names who else is running and where): conflicts do not wake you, so check the PR's mergeable state yourself after every push and every wake. If it is behind or conflicting: `git fetch origin main && git merge origin/main`. Keep both sides' intent in hand-written files. The `Generated files:` (each with its regenerate command) are NEVER resolved by hand: take main's version, regenerate them, re-run the gate, and commit them separately with a body that says they were regenerated.
8. Before opening the PR, run `/code-review` on your diff and fix what it finds. Open the PR with the repository's template (What changed and why, Verified, NOT VERIFIED, Wrong turns) and a "## Follow-ups" section (ADR departures, placeholders, open questions, or `none`), which the dispatcher reads when the PR merges, saying `Closes <owner>/tasks#<n>`, never a bare `#<n>` (and `Part of <issue>` for an issue in the task's repository), plus any lines the plan names. Name every gate you could not run as `NOT VERIFIED: <gate>: <reason>`. Follow the repository's merge path, as `Merge path:` says: its own auto-merge workflow merges it when green, turn on GitHub auto-merge, or a DRAFT that Kade merges. End the body with `🤖 Generated with [Claude Code](https://claude.com/claude-code)`.
9. IMMEDIATELY after opening the PR, call subscribe_pr_activity (owner, repo, pullNumber). Never poll and never sleep: end your turn after subscribing, and PR events wake you. Your subscription brings red CI, reviews and the merge, but not a merge conflict, so a message from the dispatcher about your PR is a wake too (a conflict); check it on the PR itself. On each wake: red CI -> find the root cause and push a validated fix; conflict -> rule 7; small review ask -> do it; large ask -> reply with a proposal. Repeat until the PR is MERGED (a draft: until its CI is green). Never skip or disable a test to get green.
10. A merge is your DONE (a draft: green CI and ready for Kade): post and send nothing for it, because the dispatcher gets the merge from the event broker and reads your "Follow-ups" section. If blocked, post `BLOCKED <task id>: <exactly what>` as a comment on your PR. The event broker brings the comment to the dispatcher, which posts the line on the sub-issue. Only when you have no PR yet, or the comment cannot be posted, send the same line with send_message to the dispatcher session (priority next). Never end your turn stuck without a BLOCKED, and never end it before the PR is MERGED (a draft: green).
```

## Cloud workers without `gh`

A cloud session may have no `gh` (seen 2026-10-25). There the worker uses the GitHub connector
tools for the same reads, comments and PR steps.

Seen: cloud workers could not write to `<owner>/tasks` (2026-10-25), so the dispatcher relays the
worker's BLOCKED lines (from its PR comments, or its messages) onto the sub-issue.

Seen: a cloud worker can read it (2026-10-26, #142): `add_repo` with access `read` attached
`kade-agent/tasks` with no confirmation, and a shallow clone read a file at a pinned sha after
`git fetch --depth 1 origin <full sha>`. The connector's `get_file_contents` refused a short sha, so
the prompt names the full 40-character sha. The dispatcher never pastes the plan's text: a pasted
plan stays in its own context (~12-15k tokens per worker).

## Options-doc task (run on `decision_model`)

When the message's TASK line says DESIGN OPTIONS, rules 5 to 10 are replaced by:

```text
This is a DESIGN OPTIONS task: you write options, and Kade picks later in the dispatcher session. Never ask Kade anything.
Write ONE file: the docs path the TASK line names. Quote Kade's fixed picks first. For each open question give options A/B(/C): what it is, why it plays well, the trade-off, and the work it implies (reuse or new). Mark one "(Recommended)" with a one-line reason; references to the field's standard practice are welcome. End with "Questions for Kade": at most the number the TASK line names, each answerable by picking A/B/C.
Commit in steps and push after each (your branch). Gates: the docs gates the TASK line names. Open the PR (template, `Part of <issue>`), subscribe immediately, and drive it to MERGED.
Put the full "Questions for Kade" list in the PR body's "## Follow-ups" section, one line per question with its options and the recommended one marked; a merge is your DONE, so post nothing for it.
```
