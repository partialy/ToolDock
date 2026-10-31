# 快捷启动

快捷启动是独立系统页面，不属于普通工具分类。App 和分组保存在 SQLite v10；不会改写既有工具或恢复用户删除的分类。

## 开发与构建

- 前端和 Electron：沿用 Node/npm 工程。
- Windows Runner：使用 .NET 10 SDK 构建 `native/quick-launch-runner/QuickLaunchRunner.csproj`，发布 self-contained win-x64 单文件；用户机器无需安装 .NET。
- 首次开发先执行 `npm run build:runner`，然后 `npm run dev`。`npm run dist` 会先构建 Runner，再构建并打包桌面应用。
- Runner 源码提交 Git；`bin/`、`obj/`、`publish/` 与 CLI 缓存忽略提交。发布时通过 electron-builder `extraResources` 收录，在安装版从 `process.resourcesPath` 解析。
- 若运行中的任务仍持有旧 Runner，不能直接覆盖该二进制。停止任务后再构建，或使用独立发布目录检查。

## 模块职责

- `src/shared/quickLaunchModels.ts`：输入白名单、App/分组/任务模型及预加载接口契约。
- `electron/main/database/quick-launch.ts`：事务 CRUD、revision 冲突、组内完整排序集合、运行锁。
- `electron/main/services/quick-launch-resources.ts`：原生选择、短期内存暂存、UUID 托管副本、图标 PNG 栅格化、失败回滚与清理重试。
- `electron/main/services/quick-launch-runner.ts`：运行身份、安全凭据、宿主启动与重连、状态和输出查询。
- `electron/main/services/quick-launch.ts`：串行协调启动、配置和数据管理流程；业务约束不散落在 IPC 控制层。
- `native/quick-launch-runner/`：独立 Windows 宿主、UAC、Named Pipe、Job Object、受控进程组停止及内存输出。
- `src/components/quick-launch/` 与 `useQuickLaunch`：页面、编辑器、App 库、分组管理、键盘/拖动排序及运行抽屉。

## 数据与运行边界

脚本和图标在 `tools/quick-launch/apps/{appUuid}`，导入只复制单个脚本。原始脚本、相邻依赖及用户工作目录不归 ToolDock 管理。更换脚本先创建新副本，SQLite 引用提交成功后才清理旧文件。图标最终保存 PNG，不把原 SVG 或任意本地路径交给渲染器。

运行身份和受保护控制凭据位于 `tools/quick-launch/runtime`，备份排除该目录；恢复拒绝归档中的运行身份。命令和脚本按配置存于 SQLite/托管文件，不写诊断日志；输出仅驻留当前会话内存。备份包含命令和脚本，需妥善保管。

运行中或身份未知的 App 禁止编辑、排序、隐藏、删除及替换资源。存在活动或未知任务时禁止迁移、恢复和清理旧数据副本。配置变更、启动和数据变更共用异步队列，资源写入期间也不能插入启动。每个数据环境仅允许一个 Electron 主实例。

最多八个活动任务，同一 App 单实例。普通任务不继承已提权 ToolDock 的权限；管理员任务单独触发 Windows UAC。控制通道以进程身份与随机凭据核验，不按同名进程或单独 PID 接管任务。停止先尝试中断，再终止该 Runner 持有的 Job；主动逃逸受控作业的进程不承诺可终止。

默认退出 ToolDock 后任务继续；设置页可改为退出时停止。退出清理与文件快传共用幂等协调流程，在关闭数据库前处理。崩溃、断电及 Windows 强制结束不保证退出策略执行。未知状态只允许重新检测或确认解除锁，解除不会杀进程。

## 用户验收清单

2026-10-31 用户决定完整实现后自行验收。静态/编译通过不代表以下场景已通过：

- PowerShell 5.1/7、CMD，命令文本和托管脚本；中文/Emoji、多行、空格路径、退出码、长时间输出。
- 普通/管理员、静默/原生终端；UAC 允许和取消、标准用户输入另一管理员凭据。
- 单击/双击启动、八任务并发、运行锁、分组/排序/过滤、隐藏恢复、脚本和图标替换。
- 正常退出保留任务、重启重连、退出时自动停止、未知身份重新检测及确认解除。
- 含脚本备份恢复、运行时备份不带控制凭据、活动任务阻止数据迁移及恢复。
- 安装版独立运行、无 .NET 环境、125%/150% 缩放、深浅主题和关闭/减少动画。

完整本地实施记录及已执行检查保存在忽略提交的 `plans/QUICK_LAUNCH_IMPLEMENTATION.md` 和 `plans/QUICK_LAUNCH_DELIVERY.md`。
