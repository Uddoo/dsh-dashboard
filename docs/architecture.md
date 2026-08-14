# 架构

## 目标

第一阶段保持 Symphony 的调度合同，同时不复制其语言、OTP 监督树或 Codex App Server 传输。Harness 是运行时，Linear 只是第一个任务源，Dashboard 是观察与运行时控制面。

```mermaid
flowchart LR
  W["WORKFLOW.md\nlast-good reload"] --> O["DashboardOrchestrator"]
  R["TaskSourceRegistry"] --> O
  L["LinearTaskSource"] --> R
  O --> M["WorkspaceManager\ncontainment + hooks"]
  O --> A["HarnessAgentRunner"]
  A --> H["Harness Agent / Session / Tools"]
  O --> P["trusted-host RPC"]
  P --> D["Dashboard client\nBoard / Runtime / Configuration"]
  F["Future local/GitHub/Jira/Asana/GitLab sources"] -. register .-> R
```

## 核心边界

### TaskSource

`TaskIssue` 只要求 opaque `nativeRef`、标识符、标题、状态、标签、阻塞关系和可调度性。Orchestrator 不解析 Linear ID，也不依赖 Linear GraphQL shape。公开的 `TaskSourceRegistry` 允许以后注册其他 provider，而无需修改调度内核。

任务源负责：

- 将 provider 数据归一化为 `TaskIssue`。
- 决定 provider-specific assignee 和 blocker 是否让任务可调度。
- 提供动态 `providerLabel · projectLabel` 上下文。
- 在需要时提供 scoped raw operation；第一阶段仅 Linear 注册 `linear_graphql`。

### WorkflowStore

`WORKFLOW.md` 必须包含一个 YAML frontmatter 和非空 Markdown prompt。启动时无有效版本会明确失败；运行中修改无效时保留最后一个有效版本，并将错误投影到 Configuration。

配置承担 scheduler policy，正文承担 model input。Agent 输入日志只记录字符数和 SHA-256 指纹，不记录 prompt 内容。

### DashboardOrchestrator

一个进程内通过 `sourceKind:nativeRef` claim 防止重复运行。每次 poll 执行：

1. 拉取 board 数据。
2. 对 running/retry/blocked 状态做 reconciliation。
3. 过滤 active、非 terminal、required labels、dispatchable 和到期 retry。
4. 按 priority、createdAt、identifier 排序。
5. 应用全局和按状态并发上限。
6. 准备工作区并启动 Harness Agent。

续跑达到 `max_turns` 且 issue 仍 active 时，1 秒后进入新一次调度尝试；运行失败则按 `min(10s × 2^(attempt-1), max_retry_backoff_ms)` 重试。

当前 claim 是进程内语义，尚不是跨 Harness 主机的分布式租约；多主机同时指向同一项目会有重复领取风险，属于后续阶段边界。

### WorkspaceManager

工作区按稳定的安全 leaf 保存，不按每次 retry 创建临时目录。若 identifier 需要净化，会附加前 16 位 SHA-256，避免不同原始标识符折叠到同一路径。

创建、进入和删除前都会检查 root/issue 的 symlink 和 containment。删除只发生在 issue 确认进入 terminal 状态后，并在 `before_remove` hook 之后重新验证目标。

### HarnessAgentRunner

每个 worker attempt 创建 Harness session，并显式应用：

- Harness 当前默认模型选择；
- 可选 Agent preset；
- 必填 permission preset；
- workspace cwd；
- 当前 TaskSource 提供的 scoped tool。

同一次 attempt 的多个 turn 复用同一 session。每个 turn 后重新读取任务源状态；terminal 触发清理，active 继续，inactive 停止但保留工作区。

### RPC 与客户端

Host 只注册 `/dsh-dashboard` trusted-host RPC，端点固定为：

- `state`
- `refresh`
- `issue`
- `pause`
- `stop`

客户端每 5 秒刷新只读 projection。Pause/Stop 只改变本地 orchestrator，不等价于修改 Linear issue。Dashboard 通过 `sidebar.footer.action` 进入，通过 `shell.overlay` 显示，并可以把 inspector 的 Harness session 交还给原生 session UI。

## 状态所有权

| 状态 | 权威来源 | Dashboard 是否写入 |
| --- | --- | --- |
| issue 标题、状态、标签、关系 | TaskSource / Linear | 否 |
| running、retry、blocked、token、event | Orchestrator + Harness session | Pause/Stop 仅改运行时 |
| workspace | 本地文件系统 | Agent/hook 正常写入；Dashboard 不写 |
| workflow | `WORKFLOW.md` | 否 |
| credential | Harness credential provider | 否，只显示脱敏状态 |

## 扩展原则

以后增加 `+` 号时，创建能力必须成为 TaskSource 的显式可选 capability。UI 根据 capability 显示操作；本地任务源可以实现创建，Linear/GitHub/Jira/Asana/GitLab 是否实现由各 adapter 决定。不得让 Orchestrator 或 Board 把本地数据库模型写死成核心任务模型。
