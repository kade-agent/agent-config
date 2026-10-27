---
name: session-handoff
description: Close a session in one of Kade's repositories so a fresh session can continue - finish or park the current task, record state where the repository keeps it, and give Kade a starter prompt to paste into the new session. Use when Kade asks for a handoff or says the context is getting full.
---

# Session handoff

A handoff writes nothing that git, the PR, or the repository's state store does not already
hold. Its output is a short starter prompt, not a document.

## 1. Stop new work

Finish the current step. Do not start anything new.

## 2. Finish or park the task

- **Finished:** the normal flow (repo-workflow): gate, commit, push, PR.
- **Unfinished:** commit on its own branch, never `main`, with the subject
  `WIP: <what is done so far>` and a body that names the next step and anything half-understood.
  If the repository's flow pushes branches, push it. If a PR exists, add the same to its
  description under *Wrong turns* or *NOT VERIFIED*.
- Never leave uncommitted changes of your own behind.

## 3. Record state

- **Org Project repositories** (Stella Rain, Resonance, Kade Agent): label the issue (`cmd:status-now` for the parked task,
  `cmd:verify-needs-windows`, `-macos`, `-android`, `-iphone` or `cmd:verify-not-verified` where
  it applies; a decision waiting for Kade: assign the issue to him). Create an issue for
  any follow-up discovered in this session.
- **`MEMORY.md` repositories:** update *Now* (one line per item, link the PR or branch),
  commit it with the work.
- Do not write a handoff or session file unless the repository's `AGENTS.md` (or `CLAUDE.md`)
  still asks for one.

## 4. Give Kade the starter prompt

Reply with two or three lines of summary, then a code block he can paste into the new session:

```text
Resume <repository> with the session-resume skill.
Continue: <task>, branch <branch>, PR <#n or none>.
Done so far: <one line>.
Next step: <one line>.
Watch out: <one line, or "nothing">.
```

Keep it under 8 lines. Everything else is in git, the PR, and the state store.
