# 路线图

## 已实现

- Symphony 核心调度规范
- Harness 原生 Agent/session/tool/permission 集成
- Linear、GitHub、Jira、Asana、GitLab 与 Local TaskSource
- Provider capability、凭据健康状态与动态上下文
- GitHub/GitLab 标签状态映射、Jira 原生 status、Asana section 状态
- Host 原子 JSON 本地任务存储
- Dashboard 列级 `+`、Local 任务编辑、状态维护与删除
- Board / Runtime / Configuration
- Pause/Resume、Stop、Refresh

Provider adapter 保留 opaque `nativeRef` 与 Provider 差异，不以共同字段的最低公分母替代原生语义。

## 可靠性与运维候选

- runtime/retry 状态跨重启恢复
- 分布式 claim/lease
- webhook + polling 混合一致性
- 审计事件持久化与导出
- rate-limit/backpressure 专用面板
- 长期 burn-in、故障注入与大项目性能基线
- 更完整的 Provider blocker 与优先级语义
- Provider-native create capability（由各 adapter 独立选择）
- 本地任务导入、导出与显式恢复机制
