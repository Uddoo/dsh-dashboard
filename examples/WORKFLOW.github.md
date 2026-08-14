---
tracker:
  kind: github
  provider:
    owner: your-org
    repo: your-repository
    context_label: ENG
    # assignee: me
    state_labels:
      Backlog: status:backlog
      Todo: status:todo
      In Progress: status:in-progress
      Human Review: status:review
      Done: status:done
  required_labels: []
  active_states: [Todo, In Progress, Human Review]
  terminal_states: [Done, Canceled]
polling:
  interval_ms: 5000
workspace:
  root: ~/.dsh-dashboard/workspaces
hooks:
  timeout_ms: 60000
  after_create: |
    git clone --depth 1 https://github.com/your-org/your-repository.git .
agent:
  max_concurrent_agents: 6
  max_concurrent_agents_by_state: {}
  max_turns: 20
  max_retry_backoff_ms: 300000
dashboard:
  visible_states: [Backlog, Todo, In Progress, Human Review]
---

Work on {{ issue.identifier }}: {{ issue.title }}.

{{ issue.description }}

Use the available GitHub integration to keep the issue workpad, labels, and state current. Continue until the issue leaves an active state or a true external blocker prevents progress.
