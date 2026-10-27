# Worker prompt template

Fill every `<slot>`. Keep the hard rules word for word; only the slots change.

```text
You are a worker for <queue issue> (lane). Dispatcher: <dispatcher session id>. Task <task id>, sub-issue <owner>/tasks#<n>: one task, one PR<, plus a DRAFT PR in <repo> for <protected path>, if any>.

TASK <task id> — <goal in one sentence>. Sub-issue: <owner>/tasks#<n>. Plan: <plan path> at <full plan sha>, in <owner>/tasks (its sections: Goal, Values, Steps, Files, Tests first, Placeholders, Gate, Follow-ups). Branch <claude/<task> branch, the session's outcome_branch> from up-to-date main<, or: continue the pushed branch <branch> at <sha>; first review what it holds>.
```
