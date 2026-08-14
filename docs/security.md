# 安全边界

## 凭据

- 配置只保存 credential reference，不保存远程 Provider token。
- 每个远程操作调用 `ctx.credentials.resolve()`；不跨操作缓存 secret。Jira 的邮箱与 API token 是两个独立引用。
- Configuration 只使用 `describe()` 的 `configured/source/writable`，不接收 credential value；Local 显示“不需要凭据”。
- RPC snapshot、事件、日志和浏览器 fixture 均不包含真实 token。
- 非 loopback Linear、GitHub、Jira、Asana 与 GitLab endpoint 必须使用 HTTPS。
- REST Agent tool 拒绝 origin、查询、fragment、反斜杠以及原始或多重百分号编码的点段，避免 URL 规范化越出已验证的 Provider 路径前缀。

## 工作区

- 相对 workspace root 只相对于当前项目 `WORKFLOW.md` 所在目录解析；`~` 仅作为完整首段展开。
- issue leaf 只允许 ASCII 字母、数字、点、下划线和横线；发生净化时附加 SHA-256 前缀以抵抗碰撞。
- root 与 issue 目录在使用和删除前检查符号链接。
- containment 要求目标是 root 的严格后代；root 本身和任何 `..` 逃逸都被拒绝。
- terminal 清理在 hook 后再次检查实际路径，避免 hook 替换目标。

## 命令与权限

- Hook 是用户在受信任 `WORKFLOW.md` 中写入的本机命令，具备 Harness 进程权限；它不是沙箱。仓库 clone/build 脚本必须由部署者审核。
- Agent permission preset 是插件必填配置，不静默选择或提升权限。
- Dashboard 的 Stop 是 Agent cancel；Pause 只停止派发新任务，已经运行的 Agent 不被自动中断。
- Provider Agent tool 可以写入远程任务，具体操作同时受路径约束、prompt、permission policy 与 token 权限约束；Board 本身不向远程 Provider 发 mutation。
- Local `+`、编辑与删除只调用 trusted-host RPC。编辑提交携带打开任务时的更新时间，Host 会拒绝覆盖 Agent 或其他编辑器产生的较新版本。Local Agent tool 不开放删除；Dashboard 删除任务记录时保留已有 workspace。

## Local 任务文件

- 本地任务保存在 Host 配置的单一 JSON 文件中，不使用浏览器 `localStorage`。
- 同一插件实例内 mutation 串行执行；写入使用同目录独占临时文件、flush 和原子 rename。
- 已存在的目标必须是普通文件，符号链接或非文件目标会被拒绝。
- JSON 损坏或 schema 版本不受支持时 fail closed，不会用空 store 覆盖原文件。

## Project Catalog

- Catalog 通过 Harness `storage-domain` 写入 profile 选择的持久化 backend，不覆盖共享路由，也不写入浏览器存储。
- 手动注册只接受绝对目录；Discovery Root 也必须是绝对真实目录，深度限制为 1–8。
- 扫描不跟随 symlink/junction，跳过依赖与构建目录，并对每个真实路径重新执行 root containment 检查。
- 扫描结果只生成十分钟有效、单次使用的进程内确认令牌；移除 root 会使其全部候选立即失效。
- Project 和 Repository 分表保存，Git 检查使用参数化 `execFile`，不经过 shell。
- Project 的 `autonomousClaims` 固定为 `false`；注册项目不等于授权 Agent 自动领取任务。

## 网络与浏览器

- 客户端使用 Harness connection 的 trusted-host RPC，不自带对外 HTTP server。
- 本地 Vite fixture 只用于开发验证，不包含真实连接或凭据。
- issue URL 作为 provider-native 外链打开，并使用 `noopener/noreferrer` 语义。

## 已知边界

- 当前 claim 仅在单个插件进程内互斥，不提供多主机分布式锁。
- Hook 和 Agent 对 workspace 内资源的影响取决于部署者选择的 permission preset。
- 远程 raw API tool 是能力较大的 Provider seam；生产部署应使用最小权限 token，并审核 WORKFLOW prompt。
- 当前未实现 webhook、审计数据库或跨重启 runtime 恢复；工作区与 Local 任务持久，但 running/retry 内存状态不持久。
