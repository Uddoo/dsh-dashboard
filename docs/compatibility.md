# 兼容性证据

## 已审核基线

| 组件 | 审核/验证基线 | 用途 |
| --- | --- | --- |
| DeepSeek Harness 源码 | `47f943859bef60e4160492346772ded9b24f765a`，`master` | 只读审核 bundle、client slot、trusted RPC、credential、Agent、session、permission 与 tool 合同 |
| DeepSeek Harness npm 包 | `0.1.0-rc.6` | 本仓库 TypeScript、测试和 bundle 构建依赖 |
| OpenAI Symphony 源码 | `8001b52e3062495a16e520e4ceaf8f9de868c4d0` | 核心规范、Linear GraphQL 字段、重试/续跑/工作区与 observability 语义 |

本项目没有修改 `deepseek-harness` 源码。构建依赖来自 npm，Harness checkout 只作为接口证据。

## 声明范围

`package.json` 对 Harness peer 的范围是 `>=0.1.0-rc.5 <0.2.0`。当前自动化编译和测试的实证版本是 rc.6。任何 rc.7 或后续 0.1.x 版本仍应重新执行以下检查，不能仅凭 semver 假定兼容：

1. `pnpm run typecheck`
2. `pnpm test`
3. `pnpm run build`
4. `pnpm pack`
5. 隔离 `DSH_HOME` 下 `dsh plugin --profile web add <tgz>`
6. `dsh --profile web --dump-config`
7. 浏览器加载、trusted RPC、session open 和 plugin dispose smoke test

## 使用的 Harness 合同

- `package.json#dsh.bundle.patch`
- `package.json#dsh.client`
- Cordis `ctx.effect` 与 Service 生命周期
- Host `ctx.connection.rpc.handle(..., { authority: 'trusted-host' })`
- Client `ctx.connection.rpc.call`
- Client slot `sidebar.footer.action`、`shell.overlay`
- `ctx.credentials.resolve/describe`
- `ctx.agents.create`、Agent `followup/whenIdle/cancel`
- `ctx.agentDefaultModel.currentSelection`
- `ctx.permissionPresets.resolve/set`
- 可选 `ctx.agentPresets.resolve/mount`
- `ctx.sessions.flush`
- `ctx.tools.register(defineTool(...))`

## 尚未声称

- 未声称兼容 Harness `<rc.5` 或 `>=0.2.0`。
- 未声称在 Linux/macOS 上完成 hook、symlink 和路径清理实机测试；实现保留跨平台路径逻辑，但当前开发/验证主机是 Windows。
- 未声称使用真实 GitHub、Jira、Asana、GitLab 凭据完成写入或长期无人值守 burn-in；自动化测试使用 mock API，真实凭据需要部署者单独验证。
- 未声称与上游 Symphony 的 Web UI 像素级一致；视觉基线是用户确认的本项目 Dashboard 规范。
