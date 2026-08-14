---
tracker:
  kind: linear
  provider:
    project_slug: "your-linear-project-slug"
    context_label: "ENG"
    # assignee: "me"
  required_labels: []
  active_states:
    - Todo
    - In Progress
    - Merging
    - Rework
  terminal_states:
    - Closed
    - Cancelled
    - Canceled
    - Duplicate
    - Done
polling:
  interval_ms: 5000
workspace:
  root: ~/.dsh-dashboard/workspaces
hooks:
  timeout_ms: 60000
  after_create: |
    git clone --depth 1 https://github.com/your-org/your-repository.git .
  # before_run: |
  #   git fetch --all --prune
  # after_run: |
  #   git status --short
  # before_remove: |
  #   git status --short
agent:
  max_concurrent_agents: 6
  max_concurrent_agents_by_state:
    Merging: 1
  max_turns: 20
  max_retry_backoff_ms: 300000
dashboard:
  visible_states:
    - Backlog
    - Todo
    - In Progress
    - Human Review
---

You are working on a task from the configured tracker.

Issue context:

- Identifier: {{ issue.identifier }}
- Title: {{ issue.title }}
- Current status: {{ issue.state }}
- Labels: {{ issue.labels }}
- URL: {{ issue.url }}

{% if attempt %}
This is follow-up attempt #{{ attempt }}. Resume from the current workspace and
conversation state; do not restart completed investigation.
{% endif %}

Description:

{% if issue.description %}
{{ issue.description }}
{% else %}
No description was provided.
{% endif %}

Work only in the provided workspace. Keep the tracker workpad and state current
through the available tracker integration. Continue autonomously until the issue
leaves an active state or a true external blocker prevents progress.
