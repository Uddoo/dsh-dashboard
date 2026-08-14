# Dashboard visual specification

`dashboard-board-runtime-v1.png` is the approved Phase 1 visual baseline.

`dashboard-harness-integration-v1.jpg` is the corresponding implementation
captured at 1536 × 1024 from an actual `@deepseek-ai/dsh@0.1.0-rc.6 web`
process with the packed plugin installed. It intentionally uses a mock Linear
endpoint and an idle Agent runtime, so it demonstrates host/client/RPC/task
source integration and native-shell composition rather than a real model run.

## Locked Phase 1 decisions

- The product title is **Dashboard**.
- The entry lives in Harness's native `sidebar.footer.action` seat, above the
  native Settings row. Dashboard never renders a second navigation rail.
- The Dashboard surface preserves the live Harness sidebar and occupies only
  the center/details region; the left rail in the early image is not plugin UI.
- `Linear · ENG` is a dynamic tracker/scope context control, not a hard-coded
  brand label.
- The primary view is a read-only, Linear-style board.
- The top runtime rail summarizes running, retrying, blocked, token, and refresh
  state without replacing the task board with an analytics dashboard.
- Active, retrying, and blocked issues expose compact runtime information on the
  card.
- Selecting an issue opens the source-derived runtime inspector: session,
  workspace, worker, turns, latest agent update, token usage, recent events,
  retry/blocked state, and last error.
- Phase 1 does not create, drag, reorder, or mutate tracker issues from the
  board. Tracker links open the provider-native issue surface.
- The `Runtime` view owns full running/blocked/retry tables and rate-limit data.
- The `Configuration` view owns WORKFLOW, tracker, polling, concurrency,
  workspace, agent-preset, and permission-preset state.

## Planned extension seam

A later phase may add a local task source for users who do not use Linear,
GitHub, Jira, Asana, or GitLab. That feature may expose `+`/new-task controls,
but it must be implemented as a provider-neutral task-source capability rather
than hard-coded into the Linear adapter or the orchestrator.

The Phase 1 domain model and orchestrator therefore treat provider-native
identifiers and fields as opaque adapter data. Linear is the first provider,
not the core model.

## Rejected exploration

`rejected/operations-table-v1.png` is retained only as design-history evidence.
It was rejected because it made observability tables and metrics the primary
product surface instead of issue flow.
