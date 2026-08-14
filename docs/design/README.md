# Dashboard visual specification

`dashboard-board-runtime-v1.png` is the approved visual baseline.

`dashboard-harness-integration-v1.jpg` is the corresponding implementation
captured at 1536 × 1024 from an actual `@deepseek-ai/dsh@0.1.0-rc.6 web`
process with the packed plugin installed. It intentionally uses a mock Linear
endpoint and an idle Agent runtime, so it demonstrates host/client/RPC/task
source integration and native-shell composition rather than a real model run.

`project-catalog-v1.png` and `project-catalog-scan-v1.png` extend that baseline
with the Projects view and the bounded-scan confirmation flow. They preserve
the same Harness shell, header rhythm, restrained table styling, and dynamic
tracker context.

`../images/dashboard-project-catalog-desktop.png` and
`../images/dashboard-project-scan-desktop.png` are the corresponding desktop
implementation captures from the packed plugin running in the real Harness Web
profile. `../images/dashboard-project-catalog-mobile.png` records the narrow
responsive surface after fixing tab overflow and the compact mode-control icon.

## Locked decisions

- The product title is **Dashboard**.
- The entry lives in Harness's native `sidebar.footer.action` seat, above the
  native Settings row. Dashboard never renders a second navigation rail.
- The Dashboard surface preserves the live Harness sidebar and occupies only
  the center/details region; the left rail in the early image is not plugin UI.
- `Linear · ENG` is a dynamic tracker/scope context control, not a hard-coded
  brand label.
- The primary view is a Linear-style board. Remote providers remain read-only in
  the board; Local exposes capability-gated task controls.
- The top runtime rail summarizes running, retrying, blocked, token, and refresh
  state without replacing the task board with an analytics dashboard.
- Active, retrying, and blocked issues expose compact runtime information on the
  card.
- Selecting an issue opens the source-derived runtime inspector: session,
  workspace, worker, turns, latest agent update, token usage, recent events,
  retry/blocked state, and last error.
- Remote tracker links open the provider-native issue surface. The Local source
  adds a `+` beside the existing column overflow action, plus edit/delete in the
  inspector. Dragging and reordering remain outside the current interaction set.
- The `Runtime` view owns full running/blocked/retry tables and rate-limit data.
- The `Projects` view owns registered Project and Repository metadata,
  worktree/controlled-directory strategy, discovery roots, manual registration,
  and scan confirmation. It does not introduce a plugin-owned sidebar.
- Project discovery is informational until the user confirms registration;
  registration does not enable a Global Broker or autonomous cross-project claims.
- The `Configuration` view owns WORKFLOW, tracker, polling, concurrency,
  workspace, agent-preset, and permission-preset state.

## Provider capability seam

Local task creation, update, and deletion are exposed through provider-neutral
TaskSource capabilities rather than hard-coded into the board or orchestrator.
The domain model continues to treat provider-native identifiers and fields as
opaque adapter data. No remote provider is the core model.

## Rejected exploration

`rejected/operations-table-v1.png` is retained only as design-history evidence.
It was rejected because it made observability tables and metrics the primary
product surface instead of issue flow.
