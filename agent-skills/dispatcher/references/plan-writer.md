# Plan-writer prompt

The dispatcher starts one plan-writing subagent (`Agent` with `model: "sonnet"`) per task (SKILL.md,
1. Start, step 5). Its message is the block below with every `<slot>` filled (`none` where one does
not apply); the rules are in this file, which the subagent reads by path, so the message never
restates them. Fill `<skill dir>` with the dispatcher's skill directory, the base directory this
skill was loaded from: never a path copied from an earlier session.

```text
You write one task plan for Kade's dispatcher queue <owner>/tasks#<queue issue> and commit it; you build nothing.
First read <skill dir>/references/plan-writer.md and follow its rules; these slots fill them.

- Task: <task id> (sub-issue <owner>/tasks#<n>): <goal in one sentence>.
- Plan path: plans/<lane>/<task>.md in the clone <path of the <owner>/tasks clone>.
- Precedent plans: <plans/... it mirrors, and why, or none>
- Clones: <the repository the task changes, to shallow-clone into your scratchpad; any other it reads>
- Inputs: <the sub-issue, PRs, decisions (comment IDs), ADRs, rules files to read>
- Must cover: <each item the plan's steps must hold>
- Files owned: <what the worker may touch>
- Must not touch: <files other workers own, and their tasks>
- Investigate: <a question the plan must answer with facts and file:line, and the section it goes in, or none>
- Questions allowed: <0, 1 or 2>
```

## Rules

1. **You build nothing.** The clones of the product repositories are read-only: read, fetch and
   run read-only commands there, never edit, commit or push. Only the plan file is written.
2. **Read first:** shallow-clone each repository in `Clones:` into your scratchpad
   (`git clone --depth 1`); the dispatcher holds none. Then read the global rules, the task
   repository's `AGENTS.md`/`CLAUDE.md` (its Gates table and its `.claude/rules/` for the paths the
   task touches: a manual clone does not load them), and every item in `Inputs:`. Load the
   GitHub tools you need with `ToolSearch` (`select:mcp__github__issue_read,mcp__github__pull_request_read,mcp__github__get_file_contents`)
   where there is no `gh`.
3. **The plan:** copy `<skill dir>/references/plan-template.md`, fill every slot, and mirror the
   `Precedent plans:`. `Base:` is the task repository's `main` sha you read. Cover exactly the
   `Must cover:` items: nothing left out, nothing added; a needed step the list does not hold goes
   under Follow-ups as an open question. One commit per step; a failing test first wherever
   behaviour changes, each a concrete assertion; a fix never weakens a test's intent. Name the exact
   gate commands from the Gates table, and which only CI can run. Put `Files owned:` and
   `Must not touch:` in the plan's Files section, adding any file your reading shows the steps need.
4. **Size:** if the `Must cover:` items would take one worker past ~200k context (a refactor across
   many files, long engine or performance test runs, many regenerations of generated files), write
   no plan: return `SPLIT` instead of a sha, and in the summary the split into tasks of one PR each,
   in order, with each task's goal and its share of `Must cover:`. The dispatcher puts the split to
   Kade, and each part gets its own plan writer.
5. **Investigate:** state facts with `file:line`, then the order of steps and which of them are
   Kade's (a merge, a release, a decision). Never guess what code does: read it.
6. **Questions for Kade:** only when a choice is his, and at most 2 (`Questions allowed:` may set
   fewer). Each gives options A/B(/C): what it is and its trade-off, one marked "(Recommended)" with a
   one-line reason. Kade prefers the long-term option, standard practice, and the optimized one even
   if it is a big change. They go in the plan's `## Questions for Kade` section.
7. **Commit:** in the `<owner>/tasks` clone, `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`
   with the subject `Plan <task id> (tasks#<n>): <goal, short>`, ending with
   `Co-Authored-By: <Claude model name> <noreply@anthropic.com>` and the `Claude-Session:` line your
   session gives. Plans go straight to `main` in `<owner>/tasks`: Kade's exception (2026-10-27) to the
   global rule "never commit to main", for plan files only, because his approval pins each plan
   at its sha. `git pull --rebase origin main`, then `git push origin main`; on a rejected push,
   pull again and retry once.
8. **Return only:** the full 40-character commit sha (or `SPLIT`, rule 4), and a summary of at most
   10 lines: the goal, the number of steps, the key fixes, the facts and order from `Investigate:`,
   and each question for Kade with its options and the recommended one.
