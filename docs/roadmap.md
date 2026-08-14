# 阶段路线

## 第一阶段：当前交付

- Symphony 核心调度规范
- Harness 原生 Agent/session/tool/permission 集成
- Linear TaskSource
- Dashboard Board / Runtime / Configuration
- 动态 tracker/project 上下文
- 运行时 Pause/Resume、Stop、Refresh
- 无 `+`、无拖拽、无 tracker-native 创建

## 第二阶段候选：多 tracker

- GitHub、Jira、Asana、GitLab adapter
- provider capability 描述与连接状态
- 各 provider 的 blocker、assignee、state 映射验证
- provider-native webhook 或增量刷新

这一阶段不能用共同字段的最低公分母抹掉 provider 差异；adapter 应保留 opaque nativeRef 和可选 native metadata。

## 后续阶段候选：本地任务源与 `+`

- 本地持久任务源
- Dashboard `+` / Create task
- 非 Linear/GitHub/Jira/Asana/GitLab 用户的纯本地工作流
- local/provider task source 切换
- 可选 provider create capability

在 capability 合同、持久化迁移、冲突策略和删除恢复策略明确前，不在第一阶段预放无效 `+` 号。

## 运维增强候选

- runtime/retry 状态跨重启恢复
- 分布式 claim/lease
- webhook + polling 混合一致性
- 审计事件持久化与导出
- rate-limit/backpressure 专用面板
- 长期 burn-in、故障注入和大项目性能基线
