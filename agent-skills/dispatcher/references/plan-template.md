# Plan template

A task's plan is `plans/<lane>/<task>.md` in `<owner>/tasks`. Copy this file, fill every
`<slot>`, and commit it. Kade approves the plan at that commit's full sha; the worker reads it at
that sha. An edit after approval sends the task back to Kade. `Base:` is the task
repository's `main` when the plan was written: the dispatcher and the worker check that `main` has
not moved on in the plan's files since then.

The sections are the worker prompt's TASK slots (`references/worker-prompt.md`), so the worker
follows the plan without needing suggestions.

```markdown
# <Task ID>: <task name>

Lane: <owner>/tasks#<queue issue>. Sub-issue: <owner>/tasks#<n>. Repository: <owner>/<repo>.
Base: <owner>/<repo>@<sha>.
Branch: claude/<task> from up-to-date main<, or: continue <branch> at <sha>; first review what it holds>.
Blocked by: <#n, or none>.

## Goal

<One sentence.> Decisions: <issue comment IDs, ADR numbers>.

## Values

<Exact numbers and strings, their units and how they are stored (scale, type).>

## Steps

One commit each, pushed after each:
1. <The failing tests.>
2. <The change they drive.>
3. <Each further area, content, then the generated files, regenerated.>

## Files

- May touch: <list>.
- Must not touch: <files owned by other workers, or out of scope>.

## Tests first

- <Each a concrete assertion: input, expected output.>

## Placeholders

- <What may be a placeholder, with its default value.> A placeholder is a value, never a new
  dependency, module, service or schema.

## Gate

- <The repository's gate commands, from its Gates table; which ones CI covers if they cannot run here.>

## Follow-ups

- <What the PR body's "Follow-ups" section must list: ADR departures, placeholders taken, NOT VERIFIED, open questions. A merge is the DONE (decision 29): no DONE line.>
```
