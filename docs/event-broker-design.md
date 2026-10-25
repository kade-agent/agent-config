# Design: PR events from GitHub to the dispatcher through the NAS

- **Scope:** how the dispatcher learns, within seconds, that a worker's PR merged, closed, went red,
  got a review, or fell behind or into conflict, and how it tells that worker. It covers the GitHub
  App, the receiver and NATS JetStream on Kade's NAS, and the dispatcher's subscription.
- **Status:** **living design, edited in place.** Each change updates this file and names its date
  and PR in section 8. It is not an ADR series. The dispatcher's side is in
  `agent-skills/dispatcher/references/pr-watch.md`. The NAS side is built in the public
  `kade-agent/event-broker`.
- **Why:** a merge, a red run or a conflict does not wake a worker session, and `set_monitor` is
  often refused. Kade's rule (2026-10-24): "sessions should subscribe, when merge immediately send
  them a message, and sessions should report a message to main dispatcher". The gh poll that
  stood in for this lagged by up to 60 s, and its stray loops swallowed merge events.

## 1. Decisions (Kade, 2026-10-24)

1. **Our own small Node receiver on the NAS, with a real broker behind it: NATS JetStream.** The
   receiver checks and shapes events. The broker stores and replays them.
2. **Replay comes from the broker:** the dispatcher reads through a JetStream durable consumer,
   so a re-armed Monitor continues where it stopped. There is no state file and no `Last-Event-ID`.
3. **One JSON object per event**, with the fields in section 4.
4. **Cloud sessions subscribe too**, with the NAS details supplied by the cloud environment's
   private init script.
5. **Cloud auth is a NAS-made private key, with no token:** an NKey, which is an Ed25519 keypair.
   The broker keeps only the public key.
6. **Local sessions connect over the LAN with no key.** (Changed 2026-10-25: a key is needed now, see decision 11 and section 7.) That access comes from a
   separate listener that is not exposed, never from a source-IP check.
7. **Only the dispatcher subscribes**, and it manages the workers. Workers do not subscribe.
8. **The receiver detects behind and conflicting PRs** by asking GitHub after each trigger
   (section 5).
9. **A PR that is only behind is updated by its worker**, which merges `origin/main` and
   regenerates. Nothing on the NAS writes to GitHub.
10. **The GitHub identity is a new read-only GitHub App.** It is both the webhook source and the
    API reader.

**Added 2026-10-25 (Kade):**

11. **One NATS account per org, with a filtered consumer per org** to cut noise. Kade: "plan them,
    one account per org". Each account holds its own stream, keys and consumer (sections 6 and 7).
12. **The receiver accepts only Kade's owners:** "kade-k8s-platform, kade-agent, stella-rain,
    star-resonance". A delivery from any other owner is dropped (section 3).

**Added 2026-10-25 (Kade, v2, kade-agent/tasks#19):** Kade: "consider long term, open to extend and
I'd accept big change, since it's a starting stage"; "make a dispatcher plan for this"; Node 22+
on the PC; "Pinned clone"; "Side by side". The findings are event-broker #15 and #16; section 9
replaces their proposals.

13. **The receiver names each event's signal and publishes it to a second stream `EVENTS` (one per account, beside `GITHUB`); each
    reader profile is a server-side consumer** with a list of signals. A reader no longer carries
    a subject filter list of its own, and a new reader or a new situation is a table row.
14. **A Node client replaces `watch.sh` and natscli**, run from a clone of event-broker at a
    pinned commit (Node 22+ on the PC).
15. **Side by side, then retire:** v2 runs beside v1 (`GITHUB`, `watch.sh`) until the dispatcher
    has moved over and Kade has checked it live; then v1 is removed.

**Added 2026-10-25 (Kade):** a dispatcher reported every green workflow on `main` (20 lines in
30 minutes with no open PR). Kade approved the broker-side fix: "Approve for NAS Deploy option".

16. **`main_passed` means a workflow on main turned green:** the receiver gives it only to the
    first pass of a workflow on main after that workflow failed there, or after the receiver
    started. Every other pass is `main_still_passed`, which the `dispatcher` profile does not read
    (section 9).

**Added 2026-10-25 (Kade):** each line the watch prints is one turn of the dispatcher. Kade chose
client-only batching over a reducer in the broker ("Approve, with client-only batching", "change
to 30s of interval as a summary window length"; batch everything, nothing bypasses the window).

17. **The client prints a 30 s summary, not one line per event:** `watch.js` gathers the events of
    a 30 s window into one `SUMMARY` line and acks them after it is written. The backlog found at
    start is one summary at once. `--window 0` keeps one line per event (section 9). The broker
    and the consumers do not change.

**Added 2026-10-25 (Kade):** "currently dispatcher let sub-agents send DONE or BLOCKED message to
main, but I think it should be a fallback of event-broker. Event broker would send all info to
dispatcher"; then "A for both" (leases through the broker; a BLOCKED before any PR by message).

18. **Workers report through GitHub, and the broker carries it:** a worker posts its strict DONE
    or BLOCKED line as a comment on its own PR (`pr_comment` reaches the dispatcher), and its
    pushes are its progress: the receiver publishes `push_branch` for a push to a task branch
    (`claude/*`, `agent/*`), which the `dispatcher` profile reads in place of `LEASE` messages.
    `send_message` is the fallback: a BLOCKED before any PR exists, or a comment that cannot be
    posted. This replaces the 2026-10-24 rule quoted in Why ("sessions should report a message
    to main dispatcher") for DONE, BLOCKED and leases; the dispatcher still messages its workers.

**Added 2026-10-25 (Kade):** "Can receiver have state, so that it can send more useful data to
nats? Per Org/Repo and topics"; then "the stateful receiver (S1 to S3), proceed this". S1 is
below; S2 (the `red` list on `main_*` events) and S3 (a PR snapshot the client reads) follow it.

19. **The receiver keeps its state in NATS, stream `STATE` (S1):** the last mergeable state per PR
    and the last result per workflow on main (decision 16) live in a last-value stream per account
    instead of only in memory, so a receiver restart repeats nothing (section 9, State).

20. **Main events say which workflows are still red (S2):** the receiver keeps the list of
    workflows failing on each repository's main in `STATE`, and every v2 `main_failed`,
    `main_passed` and `main_still_passed` carries it as `red`. The client prints `red=`; the
    dispatcher lifts its "main is red" hold on a `main_passed` whose `red` is empty (section 9).

21. **A PR snapshot the dispatcher reads (S3):** the receiver keeps one snapshot per PR in `STATE`,
    updated by every v2 event on that PR, and `watch.js --state <owner>/<repo>` prints the
    repository's `red` list and its PR snapshots, then exits. The reader key may read `STATE`;
    the dispatcher's sweep reads the snapshots first and gh only for what they lack (section 9).

**Added 2026-10-25 (Kade, "1 and 2 together"):**

22. **The snapshot's head is the PR's (S3 fix):** only PR-level events (`pull_request`, `mergeable`,
    a review) and a `push_branch` to the PR's branch move a snapshot's `sha`; a check or run for
    another sha is ignored, so a late result from an older head cannot roll it back. Each time
    the mergeable check reads a PR from GitHub, it writes what it read (head, branch, draft,
    auto-merge, open/merged/closed, mergeable state) into the snapshot, which repairs drift from
    lost deliveries at no extra API call (section 9).

Decision 6 changes with decision 11: LAN access needs a key now (section 7). Decision 7 stays, with
one dispatcher per org.

## 2. Architecture

```
worker pushes / merges ─▶ GitHub ─(App webhook, HMAC)─▶ receiver (Node, NAS)
                                                     │  ├─ check signature and owner allowlist, normalize,
                                                     │  │    publish on the owner's account
                                                     │  │    (JetStream msg id = delivery GUID)
                                                     │  └─ after a push to a base branch or a PR synchronize:
                                                     │       App installation token → open PRs' mergeable_state
                                                     │       (retry past "unknown") → publish "mergeable" on change
                                                     ▼
                                   NATS JetStream, one account per allowed owner, each with
                                   stream GITHUB (github.<owner>.>, 7 days, 2-min dedupe)
                                   and, from v2, stream EVENTS (ev.<owner>.>, section 9)
                                      ├─ LAN    nats://<LAN address>:4222  reader-<owner> NKey
                                      └─ public wss://<nas domain>/nats    reader-<owner> NKey
                                                     ▼
                           dispatcher Monitor: its org's filtered consumer "dispatcher" → SendMessage the worker
```

| Part | Where | Holds |
|---|---|---|
| GitHub App | owned by kade-agent, installed on kade-agent and stella-rain so far; installable on any account | read-only permissions; webhook URL and secret |
| Receiver | NAS container, `kade-agent/event-broker` | App private key, webhook secret, the owner allowlist, one `receiver-<owner>` NKey seed per account |
| NATS server | NAS container, same compose | one account per owner, JetStream file store; public NKeys only |
| Reverse proxy | NAS | TLS for `/github` (to the receiver) and `/nats` (websocket to NATS) |
| Dispatcher | local or cloud Claude Code session, one per org | its org's `reader-<owner>` NKey seed, in a file (cloud: written by the init script) |

The router forwards only 443, to the reverse proxy. The LAN port 4222 is bound to the NAS's LAN
address and is never forwarded.

## 3. GitHub App

- **Owner and installability:** the App is owned by kade-agent and can be installed on any
  account. Read from the GitHub API on 2026-10-25: it is installed on kade-agent and stella-rain.
  The receiver's owner allowlist, not the App's visibility, keeps other accounts out.
- **Owner allowlist:** `kade-k8s-platform`, `kade-agent`, `stella-rain`, `star-resonance`. The
  receiver reads `ALLOWED_OWNERS` (comma-separated, required) and compares `repository.owner.login`
  case-insensitively. A delivery from any other owner is dropped with a log line, before it
  publishes or starts a mergeability check.
- **Permissions, all read-only:** Metadata, Pull requests, Checks, Actions, Contents, Issues.
- **Webhook events:** `pull_request`, `check_suite`, `check_run`, `workflow_run`,
  `pull_request_review`, `push`, `issues`, `issue_comment`.
- **Installed on** each `<owner>/tasks` repository as well, so the dispatcher's task sub-issues
  send `issues` and `issue_comment` (event-broker #7).
- **Headers used:** `X-Hub-Signature-256`, checked in constant time; `X-GitHub-Event`; and
  `X-GitHub-Delivery`, a GUID that becomes the JetStream message id, so a redelivery is dropped.
- **Auth for API reads:** an RS256 JWT signed with the App's private key, exchanged for an
  installation token (one hour), which is cached until shortly before it expires.
- GitHub does not retry a failed delivery on its own. Section 6 covers that gap.

## 4. Events

*v1, until EB11-retire; v2 is section 9.*

**Subjects:**
- `github.<org>.<repo>.pr.<n>.<event>`;
- `github.<org>.<repo>.branch.<branch>.<event>` for a check with no PR, such as a run on `main`;
- `github.<org>.<repo>.push.<branch>` for pushes;
- `github.<org>.<repo>.issue.<n>.<event>` for issues and their comments. GitHub counts a PR as an
  issue, so an `issue_comment` on a pull request (the payload's `issue.pull_request` is set) goes
  to `github.<org>.<repo>.pr.<n>.issue_comment` with `pr` set.

Dots, `*`, `>` and spaces in names become `_` (for example `.github` becomes `_github`).
`pull_request` `opened`, `reopened` and `synchronize` are not published; they only start a
mergeability check.

| Source | Kept when |
|---|---|
| `pull_request` | `closed`, `ready_for_review`, `converted_to_draft`, `auto_merge_enabled`, `auto_merge_disabled`; `synchronize` only starts a mergeability check |
| `check_suite`, `check_run`, `workflow_run` | `completed` |
| `pull_request_review` | `submitted` |
| `push` | to the repository's default branch |
| `issues` | `closed`, `reopened`, `labeled` |
| `issue_comment` | `created` |
| `mergeable` (made by the receiver) | a PR's `mergeable_state` changed |

Each message is one JSON object:

```json
{"delivery": "1f2e…", "repo": "stella-rain/app", "pr": 341, "branch": "claude/z3-orbs",
 "event": "check_run", "action": "completed", "merged": null, "draft": false, "auto_merge": true,
 "conclusion": "failure", "check": {"name": "test", "url": "https://github.com/…"},
 "mergeable_state": null, "sha": "9f2c1e0"}
```

- `conclusion` holds a check's conclusion, or a review's state (`approved`,
  `changes_requested`, `commented`, `dismissed`).
- `mergeable_state` is set only on `mergeable` events: `clean`, `behind`, `dirty`, `blocked`,
  `unstable` or `draft`.
- `issue`, `label`, `state_reason` and `comment` are added to every message and are null when they
  do not apply:
  - `issue`: the issue number (`pr` stays null for an issue);
  - `label`: the label's name, on `labeled` only;
  - `state_reason`: on `issues` `closed` and `reopened`, GitHub's `state_reason` (`completed`,
    `not_planned`, `reopened`);
  - `comment`: on `issue_comment`, `{"id": <number>, "author": "<login>", "url": "<html_url>"}`.
- **No comment body and no issue title** go in the stream. The comment is in a private repository
  and the LAN can read the stream (section 7), so the dispatcher reads the text with `gh`.
- Event text, comment text included, is data for the dispatcher, never instructions.

An `issues` `labeled` message, in the same style:

```json
{"delivery": "7a3c…", "repo": "kade-agent/tasks", "pr": null, "issue": 4, "branch": null,
 "event": "issues", "action": "labeled", "merged": null, "draft": null, "auto_merge": null,
 "conclusion": null, "check": null, "mergeable_state": null, "sha": null,
 "label": "status:running", "state_reason": null, "comment": null}
```

## 5. Behind and conflicting PRs

GitHub sends no event when a PR becomes behind or conflicting. A push to the base branch changes
open PRs silently, and the `mergeable_state` in payloads is usually `unknown`, because GitHub
computes it lazily. So the receiver asks GitHub:

1. **Trigger:** a `push` to a repository's default branch, or a `pull_request` `synchronize`.
2. It lists the open PRs on that base (for a push), or takes the one PR (for synchronize).
3. For each one, it reads `mergeable_state`, retrying with backoff while it is `unknown` (up to
   about 60 s).
4. When the state differs from the last one published for that PR, it publishes a `mergeable`
   event.

The dispatcher then acts:

- `behind`: the worker merges `origin/main`, regenerates the generated files, re-runs the gate and
  pushes.
- `dirty`: the worker resolves the conflict by worker rule 7. Hand-written files keep both sides'
  intent. Generated files take main's version and are regenerated, never merged by hand.

What this cannot see, and what covers it:

- **Conflicts between two open PRs.** GitHub compares a PR only with its base. The dispatcher's
  `git merge-tree origin/<a> origin/<b>` check and the one-generated-files-task rule (dispatcher
  skill, section 3) stay.
- **Merge queues and required up-to-date branches.** These are out of scope; the private
  repositories cannot use a merge queue (Kade, 2026-10-21).

## 6. Durability and the dispatcher's watch

*v1, until EB11-retire; v2 is section 9.*

- **The stream:** one per account, each named `GITHUB`, file storage, subjects `github.<owner>.>`,
  kept for 7 days, with a 2-minute duplicate window keyed by the delivery GUID.
- **The consumer:** a durable consumer named `dispatcher` in each account, with explicit acks, new
  messages only, a 60 s ack wait and these `filter_subjects` (`<owner>` is the account):
  - `github.<owner>.*.pr.*.pull_request`, `github.<owner>.*.pr.*.workflow_run`,
    `github.<owner>.*.pr.*.mergeable`, `github.<owner>.*.pr.*.pull_request_review`,
    `github.<owner>.*.pr.*.issue_comment`;
  - `github.<owner>.*.issue.>`;
  - `github.<owner>.*.branch.*.workflow_run`;
  - `github.<owner>.*.push.*`.

  The receiver still publishes every kept event (section 4 is unchanged). The filters drop
  `check_run`, `check_suite` and runs on branches with no PR other than `workflow_run`. The
  Monitor reads it with
  `nats consumer next GITHUB dispatcher --raw --count 1 --timeout 60s` (with the org's `reader-<owner>` key, EB8-watch), one message per call, and
  the CLI acks each message as it reads it. Never `--wait`: natscli 0.5.0 sleeps a random 0 to D
  before the ack (event-broker #5). When a Monitor ends (30 minutes at most), the next one
  resumes after the last ack.
- **Single instance:** the dispatcher's pidfile guard stays, so only the newest watch runs. There
  is one dispatcher per org, each reading its own org's consumer; dispatchers of different orgs no
  longer share one consumer.
- **Backstop:** on every re-arm, the dispatcher runs one gh sweep of its open PRs. This catches
  deliveries lost while the NAS was down.
- **Fallback:** when the broker cannot be reached, the 60 s gh poll runs, as in `pr-watch.md`.

## 7. Auth

| Who | Connects to | Proves itself with | May |
|---|---|---|---|
| GitHub | `https://<nas domain>/github` | HMAC with the webhook secret | send deliveries |
| Receiver | NATS, inside compose, one connection per account | `receiver-<owner>` NKey | publish `github.<owner>.>` and that stream's admin API only |
| Local dispatcher | `nats://<LAN address>:4222` | `reader-<owner>` NKey (plain TCP connections only) | read its org's consumers only |
| Cloud dispatcher | `wss://<nas domain>/nats` | `reader-<owner>` NKey (websocket connections only) | read its org's consumers only |

There is no keyless LAN user: `no_auth_user` is removed, and a local dispatcher uses the same
`reader-<owner>` key as a cloud one. An account cannot see another account's subjects or stream.

- NKeys are made on the NAS with event-broker's `node scripts/nkey.js`, which prints the seed,
  then the public key: two per allowed owner, eight in all. Only public keys go in the server
  config, through `.env`. A key is revoked by removing its public key and reloading.
- The cloud init script writes the seed to a file with `umask 077` and never echoes it. It sets
  `EVENT_BROKER_URL` and `EVENT_BROKER_NKEY_FILE`. A local session sets both too, now that the LAN
  needs a key.
- No NAS details are committed: no LAN address, domain, key or secret. agent-config and
  event-broker are both public (Kade, 2026-10-24). They use placeholders such as
  `<LAN address>` and `<nas domain>`, and the real values live only in the NAS's `.env` and
  secrets files and in the dispatcher's environment.
- Accepted risk: a device on the LAN holding a `reader-<owner>` key can read that org's event
  stream (repository names, PR numbers, branches, check results, and the `<owner>/tasks` issue
  numbers, label names and comment authors), and only that org's. Without a key a LAN device reads
  nothing. Guest and IoT devices stay on an isolated network, and a reader key is kept like the
  cloud one (Kade accepted the keyed LAN, 2026-10-25).

## 8. Build and open items

| Step | Where | State |
|---|---|---|
| The dispatcher's PR watch (gh poll, guard, re-arm, worker messages) | agent-config #110 | merged 2026-10-24 |
| SSE receiver, the first design | event-broker #1 | merged 2026-10-24; replaced by #2 |
| Receiver + NATS config + compose + CI with an integration job + README | event-broker #2 | merged 2026-10-24 |
| No LAN address in this public doc | agent-config #112 | merged 2026-10-24 |
| `pr-watch.md` on the NATS consumer, the new event rows, the init-script snippet; this doc's subjects | agent-config #113 | merged 2026-10-24 |
| Create the App (private, on stella-rain), install it, make the keys, deploy, the webhook route; install the `nats` CLI on the PC | Kade | done 2026-10-24 |
| One dispatcher at a time; cloud settings as environment variables; the live check | agent-config #114 | merged 2026-10-24 |
| `docker compose run --rm setup`: both NKeys, secrets, `.env`, file owners | event-broker #3 | merged 2026-10-24 |
| `client/watch.sh` (the cloud seed written at run time) and `client/install-nats.sh` (natscli 0.5.0, pinned) | event-broker #4 | merged 2026-10-24 |
| `pr-watch.md` runs `client/watch.sh` at a pinned event-broker commit | agent-config, `claude/pr-watch-client-script` | open |
| `--timeout 60s`, no `--wait` (event-broker #5) | agent-config #121 | open |
| Issue events (event-broker #7): this doc, then `normalize`, then the dispatcher | agent-config #122 | open |
| This doc: one account per org, the owner allowlist, keyed LAN | agent-config #124 | open |
| EB8-allow: the receiver's `ALLOWED_OWNERS` allowlist | event-broker | open |
| EB8-accounts: accounts, per-org streams, keys and filtered consumers in `nats-server.conf` and the setup | event-broker | open |
| EB8-watch: the dispatcher's watch uses its org's `reader-<owner>` key | agent-config | open |
| pr-watch, worker-prompt and this section on the 2026-10-25 live checks (EB10-docs) | agent-config #127 | open |
| New keys and redeploy | Kade | open |
| The App: Issues read, `issues` and `issue_comment` subscriptions, installed on each `<owner>/tasks`; receiver redeploy | Kade | next |
| The cloud websocket route and the cloud environment (variables, network, setup script) | Kade | next |
| v2 design: this doc's section 9 (EB11-doc) | agent-config #128 | merged 2026-10-25 |
| EB11-signals: the receiver computes each event's signal | event-broker #17 | merged 2026-10-25 |
| EB11-stream: stream `EVENTS` beside `GITHUB`, profile consumers | event-broker #18 | merged 2026-10-25 |
| EB11-client: `client/watch.js` and `src/profiles.js` | event-broker #19 | merged 2026-10-25 |
| Redeploy with `EVENTS` | Kade | done 2026-10-25 |
| EB11-switch: `pr-watch.md` on the client | agent-config #129 | open (draft) |
| Release and live check | Kade | next |
| EB11-retire: remove `GITHUB`, `watch.sh`, natscli | event-broker, agent-config | open |
| Decision 16: `main_passed` only green after red, `main_still_passed` otherwise | agent-config #132, event-broker #20 | merged 2026-10-25 |
| Redeploy the receiver with decision 16 | Kade | done 2026-10-25 |
| Decision 17: the client's 30 s summary | event-broker #21, agent-config #134 and #135 | merged 2026-10-25 |
| Decision 18: workers report through GitHub, `push_branch` | agent-config, event-broker (`claude/eloquent-pascal-2ve57u`) | open |
| Redeploy the receiver with `push_branch` | Kade | next |
| Decision 19 (S1): stream `STATE` for the receiver's state | agent-config #137, event-broker #23 | merged 2026-10-25 |
| Redeploy with `STATE` (the new `nats-server.conf` permissions) | Kade | next |
| Decision 20 (S2): `red` on main events | event-broker #24, agent-config #138 | merged 2026-10-25 |
| Decision 21 (S3): PR snapshots and `watch.js --state` | event-broker #25, agent-config #139 | merged 2026-10-25 |
| Redeploy with the reader's `STATE` permissions (S3) | Kade | next |
| Decision 22: the snapshot's head is the PR's; the mergeable read repairs it | agent-config, event-broker (`claude/eloquent-pascal-2ve57u`) | open |

**Settled:**
- The two runtime dependencies `@nats-io/transport-node` and `@nats-io/jetstream` (3.4.0, pinned)
  were approved by Kade on 2026-10-24. Their upkeep is npm updates.
- (2026-10-24, removed 2026-10-25) `no_auth_user` reached plain TCP connections only. With a key
  on the LAN it is gone (section 7); each key stays refused on the wrong connection type, as
  event-broker #2's integration job proved against nats-server 2.15.1.
- **The LAN path works end to end** (Kade, 2026-10-24). The App's ping got a 200 over the NAS
  domain. A real stella-rain/app `workflow_run` reached JetStream, and the PC read it with
  `nats consumer next GITHUB dispatcher --raw --count 1 --wait 120s`, with no key. That `--wait`
  only delayed the ack (event-broker #5); the equivalent read is `--timeout 120s`.
- Deploy lessons:
  - The certificate is a one-level wildcard, so every public hostname is one level deep.
  - The secret files must be owned by uid 1000, the container's `node` user.
  - `.env` holds public NKeys (`U…`, 56 characters), never seeds (`SU…`).
- The App is owned by kade-agent and installable on any account (read from the GitHub API,
  2026-10-25), and the receiver's owner allowlist of four keeps other accounts out. This replaces
  the earlier "private to stella-rain" reading.
- The local and the cloud dispatcher of one org share its consumer `dispatcher`, so one reads it at
  a time (`pr-watch.md`); each org has its own.
- (2026-10-25) Three checks are settled:
  - the cloud websocket route, and a cloud session through the sandbox: a cloud session ran
    `watch.sh` with the stella-rain reader key and received `issue_comment`, `issues` `closed` and a
    `workflow_run` on `main` within seconds (Kade's cloud run);
  - `mergeable` events from real pushes: seen live on stella-rain/core #358, `unstable` then `clean`;
  - a watch drains a backlog in seconds: 21 queued events printed at once with the fixed `watch.sh`.
- (2026-10-25) A cloud session reached the NAS over `wss://` from Node: `wsconnect` from
  `@nats-io/nats-core` 3.4.0 read the stream info with a reader key, with or without
  `NODE_USE_ENV_PROXY` (section 9).

**Open:**
- Whether `kade-agent/event-broker` needs a profile in `kade-agent/code-quality-assurance`.
- Cloud lessons (2026-10-24):
  - a cloud environment's setup script cannot see the environment's variables, so
    `client/watch.sh` writes the seed file when the watch starts;
  - the GitHub "latest release" API answers 403 from the sandbox, so the CLI is pinned.

## 9. v2: signals, profiles and the client

Added 2026-10-25 (decisions 13 to 15). Sections 4 and 6 stay as v1 until EB11-retire; this section
is what the code is built to. Later tasks (EB11-signals, EB11-stream, EB11-client, EB11-switch) are
pinned to it.

### Signals

The receiver computes one signal per kept event. "main" is the repository's default branch
(`repository.default_branch` in the payload). A conclusion is **failed** when it is `failure`,
`timed_out`, `action_required` or `startup_failure`; **passed** when it is `success`; **other** for
anything else (`cancelled`, `skipped`, `neutral`, `stale`, null).

| Source | When | Signal |
|---|---|---|
| `pull_request` | `closed`, merged / not merged | `pr_merged` / `pr_closed` |
| `pull_request` | `ready_for_review`, `converted_to_draft` | `pr_ready`, `pr_draft` |
| `pull_request` | `auto_merge_enabled`, `auto_merge_disabled` | `automerge_on`, `automerge_off` |
| `mergeable` | `mergeable_state` `behind`, `dirty`, `clean`, `blocked`, `unstable`, `draft`; else | `merge_<state>`; `merge_other` |
| `workflow_run` | with a PR: failed / passed / other | `ci_failed` / `ci_passed` / `ci_other` |
| `workflow_run` | no PR, on main | `main_failed` / `main_passed` or `main_still_passed` (below) / `main_other` |
| `workflow_run` | no PR, another branch | `branch_failed` / `branch_passed` / `branch_other` |
| `check_run`, `check_suite` | any branch | `check_failed` / `check_passed` / `check_other` |
| `pull_request_review` | state `changes_requested`, `commented`, `approved`, `dismissed`; else | `review_changes`, `review_comment`, `review_approved`, `review_dismissed`; `review_other` |
| `issues` | `closed`, `reopened`, `labeled` | `issue_closed`, `issue_reopened`, `issue_labeled` |
| `issue_comment` | on a PR / on an issue | `pr_comment` / `issue_comment` |
| `push` | to main | `push_main` |
| `push` | to a task branch (`claude/*`, `agent/*`), not a deletion (decision 18) | `push_branch` |

That is 38 signals. `check_run` and `check_suite` get their own signals so one red run is not three
`ci_failed`.

**Task branch pushes (decision 18).** `push_branch` is published to `EVENTS` only; v1 (`GITHUB`)
keeps dropping pushes to branches other than main. Its subject is branch scope, its `sha` the
pushed head (`after`); a branch deletion (`deleted`, as after a merge) is dropped.

**Green after red (decision 16).** A pass on main is `main_passed` only when the last completed
run of that workflow (repository and workflow name) on main that the receiver published was failed,
or when it has published none since it started; otherwise it is `main_still_passed`. `main_other`
leaves that state as it was. The state lives in the receiver's memory, like the mergeable states
(section 5): after a restart, the first pass of each workflow is `main_passed` again, so a
recovery is never lost, at the cost of one repeat per workflow. The state moves only after both
publishes succeed, so a delivery answered 503 and redelivered gets the same signal. v1 (`GITHUB`)
is unchanged.

### Stream `EVENTS`

One per account, beside `GITHUB`:

- subjects `ev.<owner>.>`, file storage, kept 7 days, discard old;
- a 2-minute duplicate window keyed by the same message id as v1;
- `max_bytes` 24 MiB (25165824) while v1 runs, 128 MiB after EB11-retire. Six orgs of `GITHUB`
  128 MiB plus `EVENTS` 24 MiB come to 956301312 bytes, which fit the 1 GB file store (sized for
  six; four owners are allowed today, section 3).

The receiver publishes to both streams for every kept event. A failure of either answers 503, so
GitHub's delivery log shows it. GitHub does not retry (section 3); a delivery redelivered by hand
within the duplicate window is deduplicated by the message id, and the dispatcher's gh sweep
(section 6) covers the rest.

### State (decision 19)

Stream `STATE`, one per account beside `GITHUB` and `EVENTS`: subjects `state.<owner>.>`, file
storage, one message kept per subject (`max_msgs_per_subject` 1), kept 30 days, 4 MiB, discard
old. Six accounts of `GITHUB`, `EVENTS` and `STATE` come to 981467136 bytes, inside the 1 GB file
store. The receiver is its only writer and reader in S1.

| Key | Value | Written |
|---|---|---|
| `state.<owner>.<repo>.pr.<n>.mergeable` | `{"mergeable_state", "sha"}` | after a `mergeable` event is published |
| `state.<owner>.<repo>.main.<workflow>` (`token()` of its name) | `{"passed": true \| false}` | after a `main_failed` or `main_passed` / `main_still_passed` is published |
| `state.<owner>.<repo>.red` (decision 20) | `{"red": [<workflow name>, …]}`, sorted | the same, adding or removing that workflow |
| `state.<owner>.<repo>.pr.<n>` (decision 21) | the PR snapshot below | after every v2 event on that PR is published |

**The PR snapshot (decision 21):** `{"repo", "pr", "branch", "sha", "state": "open" | "merged" |
"closed", "draft", "auto_merge", "mergeable_state", "checks": {<name>: <conclusion>}, "review",
"last_comment": {"author", "url"}, "updated_at"}`. Each event sets what it knows: a `pull_request`
event its fields and `state` (`pr_merged` merged, `pr_closed` closed, a reopen or anything else
open), `mergeable` the state, a check or run `checks[<name>]`, a review `review` (lower case), a
`pr_comment` `last_comment`. A new `sha` empties `checks`, so they are always the head's. Unknown
fields are null. Updates run one PR at a time; a failed write is logged, as for every key.

**Whose head (decision 22):** `sha` moves only on a `pull_request`, `mergeable` or review event,
on a `push_branch` to the snapshot's branch (found through `state.<owner>.<repo>.branch.<branch>`,
`{"pr"}`, written when a snapshot learns its branch), or on the mergeable check's read of the PR.
A check or run sets `sha` only while it is null; for any other sha it is ignored. The mergeable
check writes `sha`, `branch`, `draft`, `auto_merge`, `state` (`merged` when the PR merged,
`closed` when closed, else `open`) and `mergeable_state` from every PR it reads, even when no
`mergeable` event is published.

- **Read:** memory first, else the subject's last message (`$JS.API.STREAM.MSG.GET.STATE`); a
  missing key is unknown, as before. A failed read counts as unknown too: at worst one repeat, as
  after a restart today.
- **`red` on the event (decision 20):** every v2 `main_failed`, `main_passed` and
  `main_still_passed` carries `"red": [...]`, the list as it stands once this event counts (its
  own workflow added on a failure, removed on a pass). Two runs finishing together may each miss
  the other in their `red`; the stored list is updated one repository at a time, so it stays
  right, and the next main event carries it.
- **Write:** after both publishes of the event succeeded, so a delivery answered 503 keeps its
  signal. A failed write is logged; memory still holds the value until the next restart.
- **Kept 30 days:** a closed PR's or a removed workflow's key ages out; a workflow that has not run
  on main for 30 days is unknown again (one `main_passed`).
- **Permissions:** the receiver user of each account adds `state.<owner>.>` and the `STATE` stream
  API (`INFO`, `CREATE`, `UPDATE`, `MSG.GET`). The reader gets `INFO` and `MSG.GET` on `STATE`
  (decision 21): read only, as for `EVENTS`.

### Subjects

`ev.<owner>.<repo>.<scope>.<id>.<signal>`, always six tokens. `<scope>` is:

- `pr`: `<id>` is the PR number;
- `issue`: `<id>` is the issue number;
- `branch`: `<id>` is the branch, through `token()`; for a branch check and a `push`.

The owner is lower-cased; repo and branch go through `token()` as in v1 (section 4). `mergeable`
messages carry their message id in `delivery`, so every v2 message has one.

### Message

The v1 object (section 4) plus `"v": 2` and `"signal"`:

```json
{"v": 2, "signal": "ci_failed", "delivery": "1f2e…", "repo": "stella-rain/app", "pr": 341,
 "branch": "claude/z3-orbs", "event": "workflow_run", "action": "completed", "conclusion": "failure",
 "sha": "9f2c1e0", "check": {"name": "test", "url": "https://github.com/…"}, "…": null}
```

The elided fields are the v1 ones, null when they do not apply.

### Profiles

`src/profiles.js` in event-broker is a table of profile name to signals. Each profile becomes a
durable consumer of `EVENTS` with that name: explicit acks, new messages only, a 60 s ack wait,
`max_ack_pending` 1000, and one filter `ev.<owner>.*.*.*.<signal>` per signal.

- `dispatcher` (18 signals): `pr_merged`, `pr_closed`, `pr_ready`, `pr_draft`, `automerge_off`,
  `merge_behind`, `merge_dirty`, `ci_failed`, `main_failed`, `main_passed`, `review_changes`,
  `review_comment`, `issue_closed`, `issue_reopened`, `issue_labeled`, `pr_comment`,
  `issue_comment`, `push_branch`.
- `all`: every signal (`ev.<owner>.>`), for debugging. Nothing reads it by default.

The `dispatcher` profile leaves out `ci_passed`, `automerge_on`, `merge_clean`, `merge_blocked`,
`merge_unstable`, `merge_draft`, `merge_other`, `main_still_passed`, `review_approved`, `review_dismissed` and the
`*_other` signals. A reader that needs one is a new row.

A new reader is a new row; a new situation is a new signal row; both are a receiver redeploy.

### The client

`client/watch.js` in event-broker replaces `watch.sh` and natscli. It needs Node 22+ and runs from a
clone of event-broker at a pinned commit, after `npm ci --omit=dev`.

- **Command:** `node client/watch.js --owner <org> [--profile dispatcher] [--json] [--window <s>]`.
- **Settings:** the environment first, then `~/.claude/dispatcher/broker.env` (`KEY=value` lines):
  - `EVENT_BROKER_URL`: `nats://` on the LAN, `wss://` from the cloud;
  - `EVENT_BROKER_OWNER`: `--owner` wins;
  - `EVENT_BROKER_NKEY_FILE`: default `~/.claude/dispatcher/<owner>.nk`;
  - `EVENT_BROKER_CLOUD_SEED`: written to the key file at mode 600 when the file is missing;
  - `WATCH_PIDFILE`: default `~/.claude/dispatcher/watch-<owner>.pid`.
- **First line:** `WATCH-ARMED <owner> consumer=<profile> unprocessed=<n>`, printed after the
  stream's subjects proved to be `ev.<owner>.>`. A key for another org's account prints
  `BROKER-DOWN key is for another account`.
- **Command (decision 17):** `--window <s>`, default 30. `--window 0` prints one line per event.
- **`--state <owner>/<repo>` (decision 21):** reads `STATE` with the reader key and exits 0: first
  `STATE <owner>/<repo> red=<names, or ->`, then one line per PR snapshot, by number:
  `pr <owner>/<repo>#<n> state=<state> branch=… sha=<7> mergeable=… checks=<name>:<conclusion>,…
  review=… draft=… auto_merge=… last_comment=<author> updated_at=…` (null fields left out, values
  quoted as in an entry). `--json` prints one object `{"repo", "red", "prs": [<snapshot>, …]}`.
  An owner other than `--owner` is exit 2; `BROKER-DOWN <why>` and exit 1 when it cannot read.
- **The event entry:** `<signal> <repo>#<n>` (or `<repo>@<branch>` for branch scope), then
  `key=value` fields when not null, in this order: `branch`, `sha` (7 characters), `check`, `url`,
  `conclusion` (on `*_other` only), `red` (on `main_*`: the names joined by `,`, `-` when none;
  decision 20), `label`, `state_reason`, `author`, `delivery`. A value holding a
  space, `"` or `=` is printed as a JSON string.
- **The summary (decision 17):** the first event of a window starts it; when it is 30 s old (the
  5 s tick, so 30 to 35 s) its events are one line, `SUMMARY <n> events | <entry> | <entry> …`.
  Events with the same signal, target and check are one entry, the latest, with `count=<k>` when
  k > 1; entries keep the order of their first event. The backlog counted in `WATCH-ARMED`
  (`unprocessed=<n>`) is one summary as soon as its n messages are read. With `--window 0` each
  event is its entry alone, as before. `--json` prints `{"summary": true, "count": <n>, "events":
  [<v2 object>, …]}`, every event, ungrouped (with `--window 0`, the v2 object).
- **Ack after write:** a message is acked only after the line holding it is written; 35 s at most
  stays under the 60 s ack wait. A write failure exits 3 without acking, and the messages come
  back after the ack wait. A watch that ends with a window open prints and acks nothing of it; the
  next watch gets those messages. A message seen again (same
  stream sequence, in one process) is acked and not printed again. Across a restart delivery is
  at-least-once: a line written before a kill, with no ack, is printed again.
- **Heartbeat:** `WATCH-ALIVE <owner> consumer=<profile> unprocessed=<n>` after 600 s with no line
  printed.
- **Failure:** `BROKER-DOWN <why>` and exit 1 after two failed connects 5 s apart, a disconnect
  over 120 s, or two failed consumer reads in a row. Settings errors also print `BROKER-DOWN`, with
  exit 2. The seed is never printed.
- **Quiet end (exit 0, no line):** when a newer watch owns the pidfile, on SIGINT, SIGTERM or
  SIGHUP, and when its parent process is gone (checked every 5 s), so a stopped Monitor leaves no
  process behind.
- **Checked 2026-10-25 from a cloud session:** `wsconnect` from `@nats-io/nats-core` 3.4.0 reached
  the NAS over `wss://` with a reader key (stream info read only), with or without
  `NODE_USE_ENV_PROXY`.

### Migration, side by side

1. **EB11-stream:** the receiver adds `EVENTS` beside `GITHUB`. Both are published, and a failure
   of either answers 503.
2. **EB11-client:** `client/watch.js` and `src/profiles.js`.
3. **Kade redeploys** the receiver and NATS config with `EVENTS`.
4. **EB11-switch:** `pr-watch.md` moves to the client.
5. **Kade releases and checks it live.**
6. **EB11-retire:** removes `GITHUB`, `watch.sh` and natscli, and raises `EVENTS` to 128 MiB.

Until step 6, sections 4 and 6 are v1 and say so.
