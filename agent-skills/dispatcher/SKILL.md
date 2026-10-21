---
name: dispatcher
description: Run a work queue as a dispatcher - pick the tasks that need nothing from Kade, start one sub session per task with a detailed plan, watch every session until it reports DONE and its PR is merged, and bring Kade only the decisions. Use when Kade asks to dispatch tasks to sub sessions, to act as the dispatcher for a queue issue, to run a queue in parallel, or invokes /dispatcher.
---

# Dispatcher

You run a queue: sub sessions build, you plan, watch and report. You never build a task yourself.

## Parameters

Kade may set these when he starts the dispatcher. If he does not, use the defaults:

| Parameter | Default | Meaning |
|---|---|---|
| `non_blocked` | on | Dispatch only tasks that need nothing from Kade. Tell each worker that Kade has already agreed to everything in the accepted ADRs and the recorded decisions. A worker fills a gap with a placeholder, lists it in the PR, and never asks Kade or waits for him. |
| `task_model` | `claude-sonnet-5-5` | The model for every task session. |
| `decision_model` | `claude-opus-5-5` | The model only for sessions that prepare Kade's decisions (options docs with A/B/C picks). Never use it to build. |

Other rules always hold: `repo-workflow`, each repository's `AGENTS.md`/`CLAUDE.md`, and `release-flow` for releases.

## 1. Start

1. Name this session `[Dispatcher] <Org name> Tasks`, for example `[Dispatcher] Stella Rain Tasks`. Use `set_session_title` with no other session ID; `get_session` with no ID gives this session's ID.
2. Read the state with `session-resume`, then read the queue issue and its newest comments (decisions, handoffs).
3. List the tasks in two groups. Show non-blocked tasks first:
   - **Non-blocked**: needs no decision, task, merge or release from Kade, and no unmerged output of another task.
   - **Blocked**: give the blocker for each (Kade's decision, his task, his merge, a release tag, task X).
4. For each non-blocked task, say whether it can run beside the others (see 3. Concurrency), then dispatch.

## 2. Sizing a task

- One task makes one PR. If a task needs more, split it into tasks.
- A worker commits each logical step on its own and pushes after each commit. Typical steps: the failing test, the change it drove, each area moved over, content, and generated files (schema, corpus, goldens, pinned hashes). Never one big commit.
- A task that touches a path Kade merges by hand (ADRs, `AGENTS.md`/`CLAUDE.md`, `.claude/`, workflows) is a separate, small task whose PR is a draft for him.

## 3. Concurrency

- Run tasks in parallel only when their hand-written files do not overlap. Name each worker's files: what it may touch and what belongs to other workers.
- Generated files shared by every task (schema, content packs, corpus, goldens, fixture hashes) are never resolved by hand. The worker takes main's version and regenerates them (see the worker prompt).
- Keep at most about 4 sessions running, so the account's usage limit does not stop them all at once.
- Hold a task that overlaps a running one. Dispatch it when that one reports DONE.

## 4. Dispatching a task

Create the session with `create_session`:
- `title` is `[<Task ID>] <Task name>`, for example `[E1] No announce for enemy big patterns`. A worker that replaces a stopped one keeps the same title.
- `model` is `task_model`, or `decision_model` for an options doc.
- `source_url` is the task's repository.
- `permission_mode` is `auto`.
- `tags` are `dispatcher:<your session id>`, `issue:<queue issue>` and `task:<id>`.

The prompt is `references/worker-prompt.md` with every slot filled. The **plan** slot is a detailed plan the worker follows without needing suggestions:
- The goal in one sentence, and the decision references (issue comment IDs, ADR numbers).
- Exact values and numbers, and how they are stored (units and scales).
- The files the worker may touch, and the files it must not touch because another worker owns them.
- Ordered steps, one commit each.
- The tests to write first, each a concrete assertion.
- The gate commands, from the repository's Gates table.
- What counts as a placeholder, with a sensible default value.
- The DONE line it sends.

For a worker that takes over a branch, set `source_revision` to that branch. Its plan starts with a review of what the branch already holds.

## 5. Watching: no session is left stuck

Keep a table of open tasks: task, session, branch, PR, and state.

**When a task is finished.** Only when its DONE has arrived **and** its PR is merged. A draft PR for Kade is finished when its CI is green.

**On every wake.** A wake is a worker's message, Kade's message, or a check-in:
1. Read the notifications. Act on each DONE or BLOCKED.
2. For every open task, check:
   - the session's status and its last summary (`get_session`);
   - its PR's `mergeable_state` and CI.

   Merge conflicts and other people's merges do not wake a subscribed worker, so you check for it.
3. Nudge with `send_message` (priority `now`). Give the exact steps:
   - **Idle, no DONE, no PR:** continue, push, and open the PR.
   - **PR dirty or behind:** merge `origin/main`, regenerate the generated files, and push.
   - **Stopped by the usage limit:** wait for the reset time in its status, then tell it to continue.
   - **Asks for scope (BLOCKED for files):** widen the file list yourself when the change stays small. That is your call, not Kade's.
4. Two nudges without progress: stop the session (tell it not to push), and start a new one on the branch head (`source_revision`). Tell the new worker what is done and what is left.
5. After any merge, check every other open PR in that repository, because the merge often puts them behind.

**Check-ins.** While any task is open, keep one self check-in with `send_later`, about 40 minutes ahead, so you can catch a worker that went silent. When it fires, run the wake routine. Never poll with `sleep`.

When a task is DONE, dispatch whatever it unblocked.

## 6. Decisions

1. Collect the follow-ups workers report: ADR departures, placeholder numbers, open design questions.
2. Design work with no options yet gets an **options doc** task, on `decision_model`. The doc gives A/B/C per question with one recommended option, and its DONE lists "Questions for Kade".
3. Put decisions to Kade in this session:
   - use `AskUserQuestion`, at most 4 questions per card, with the recommended option first;
   - when he asks to review together, walk through one topic at a time and show the doc's details first.
4. Read his answers literally. A free-text answer may change the question; restate your reading and act on it.
5. Record each decision set as a comment on the queue issue, with his words quoted where he wrote them. Then dispatch the tasks it unblocks, and tell any running worker whose task it changes.

## 7. Reporting

- After each event, report briefly: what merged (PR, the key numbers, what was NOT VERIFIED), what is running, what waits on Kade.
- Never report a gate a worker could not run as passed. Relay its `NOT VERIFIED` lines.

## 8. Stopping

When Kade says stop, or the context nears its limit (`handoff-trigger`):
1. Dispatch nothing new.
2. Comment on the queue issue with:
   - what merged;
   - what is still running (session, branch, PR);
   - what waits on Kade;
   - what to dispatch next, and in what order;
   - the decision comment IDs.
3. Give Kade a starter prompt for the next dispatcher.

Running workers keep reporting to this session, so the next dispatcher checks their PRs directly.
