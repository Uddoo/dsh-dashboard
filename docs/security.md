# 安全边界

## 凭据

- 配置只保存 `apiKeyRef`，不保存 Linear token。
- 每个 GraphQL 操作调用 `ctx.credentials.resolve()`；不跨操作缓存 secret。
- Configuration 只使用 `describe()` 的 `configured/source/writable`，不接收 credential value。
- RPC snapshot、事件、日志和浏览器 fixture 均不包含真实 token。
- 非 loopback Linear endpoint 必须使用 HTTPS。

## 工作区

- 相对 workspace root 只相对于 Harness 进程 cwd 解析；`~` 仅作为完整首段展开。
- issue leaf 只允许 ASCII 字母、数字、点、下划线和横线；发生净化时附加 SHA-256 前缀以抵抗碰撞。
- root 与 issue 目录在使用和删除前检查符号链接。
- containment 要求目标是 root 的严格后代；root 本身和任何 `..` 逃逸都被拒绝。
- terminal 清理在 hook 后再次检查实际路径，避免 hook 替换目标。

## 命令与权限

- Hook 是用户在受信任 `WORKFLOW.md` 中写入的本机命令，具备 Harness 进程权限；它不是沙箱。仓库 clone/build 脚本必须由部署者审核。
- Agent permission preset 是插件必填配置，不静默选择或提升权限。
- Dashboard 的 Stop 是 Agent cancel；Pause 只停止派发新任务，已经运行的 Agent 不被自动中断。
- `linear_graphql` 可以读写 Linear，是否允许具体 mutation 由 prompt、permission policy 和 Linear token 权限共同约束；Board 本身不发 mutation。

## 网络与浏览器

- 客户端使用 Harness connection 的 trusted-host RPC，不自带对外 HTTP server。
- 本地 Vite fixture 只用于开发验证，不包含真实连接或凭据。
- issue URL 作为 provider-native 外链打开，并使用 `noopener/noreferrer` 语义。

## 已知边界

- 当前 claim 仅在单个插件进程内互斥，不提供多主机分布式锁。
- Hook 和 Agent 对 workspace 内资源的影响取决于部署者选择的 permission preset。
- Linear raw GraphQL tool 是能力较大的 provider seam；生产部署应使用最小权限 token，并审核 WORKFLOW prompt。
- 第一阶段未实现 webhook、审计数据库或跨重启 runtime 恢复；工作区持久，但 running/retry 内存状态不持久。
