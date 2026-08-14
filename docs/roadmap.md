# 路线图

## 已实现

- Symphony 核心调度规范
- Harness 原生 Agent/session/tool/permission 集成
- Linear、GitHub、Jira、Asana、GitLab 与 Local TaskSource
- Provider capability、凭据健康状态与动态上下文
- GitHub/GitLab 标签状态映射、Jira 原生 status、Asana section 状态
- Host 原子 JSON 本地任务存储
- Dashboard 列级 `+`、Local 任务编辑、状态维护与删除
- Board / Runtime / Projects / Configuration
- Pause/Resume、Stop、Refresh
- Harness `storage-domain` 持久化 Project Catalog，不覆盖 profile 的共享 backend/routes
- Project 与 Repository 分离建模，真实 Git worktree / 非 Git controlled-directory 工作区
- 显式项目注册、受限 Discovery Root 扫描和候选确认
- 全局默认值 + 项目策略 + Agent Profile 分层配置

Provider adapter 保留 opaque `nativeRef` 与 Provider 差异，不以共同字段的最低公分母替代原生语义。

## 可靠性与运维候选

- runtime/retry 状态跨重启恢复
- 分布式 claim/lease
- Global Broker、跨项目调度与显式 autonomous-claim 授权
- webhook + polling 混合一致性
- 审计事件持久化与导出
- rate-limit/backpressure 专用面板
- 长期 burn-in、故障注入与大项目性能基线
- 更完整的 Provider blocker 与优先级语义
- Provider-native create capability（由各 adapter 独立选择）
- 本地任务导入、导出与显式恢复机制
