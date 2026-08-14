---
tracker:
  kind: jira
  provider:
    site_url: https://your-site.atlassian.net
    project_key: ENG
    context_label: ENG
    # assignee: me
    # jql: issuetype != Epic
  required_labels: []
  active_states: [To Do, In Progress, In Review]
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
  visible_states: [Backlog, To Do, In Progress, In Review]
---

Work on {{ issue.identifier }}: {{ issue.title }}.

{{ issue.description }}

Use the available Jira integration to keep the issue and its native workflow status current. Continue until the issue leaves an active state or a true external blocker prevents progress.
