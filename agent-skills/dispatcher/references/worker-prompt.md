# Worker prompt template

Fill every `<slot>`; write `none` where a slot does not apply. The hard rules are not here: they
live in the `task-worker` skill, which the worker loads and which reads these slots by name, so
the message stays short and never restates or edits a rule. Task facts go in their slot, never into
a rule. The plan's line is last.

```text
You are a worker for <queue issue> (lane). Dispatcher: <dispatcher session id>. Task <task id>, sub-issue <owner>/tasks#<n>: one task, one PR.
First load the skill `task-worker` (Version: <its version line>) and follow its hard rules word for word; these slots fill them. If it is missing or its version differs, send `BLOCKED <task id>: task-worker missing or not <version>` to the dispatcher with send_message and stop.

- Merge path: <its own auto-merge workflow merges it when green / turn on GitHub auto-merge / a DRAFT that Kade merges (<protected path>)>
- Protected paths: <docs/adr/, AGENTS.md, CLAUDE.md, .claude/, .github/>
- Leave alone: <other queues or areas, and files other workers own>
- Read first: <skills, ADRs, decision comments, rules files>
- Approval: <Kade's approval comment on the queue issue>
- Other running workers: <who and their areas, or none>
- Generated files: <each with its regenerate command>
- Known moves since Base: <merges in the plan's files since its Base: that the dispatcher checked and the plan waits for, or none>

TASK <task id> — <goal in one sentence>. Plan: <plan path> at <full plan sha>, in <owner>/tasks. Branch <claude/<task>, the session's outcome_branch> from up-to-date main<, or: continue <branch> at <sha>; first review what it holds>.
```

For an options doc (on `decision_model`), the TASK line reads: `TASK <task id> — DESIGN OPTIONS:
<docs path>, at most <n> questions for Kade, docs gates <gates>. Branch <branch>.`
