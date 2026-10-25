# ToolDock 工程约定

- 本项目是独立 Windows Electron 桌面工具聚合器。NodeBase 仓库只读参考，禁止直接修改。
- 开发计划和阶段验收写在 plans/IMPLEMENTATION.md；整个 plans/ 在 .gitignore 中忽略，不提交。
- 头栏尺寸固定为 Tailwind `h-[48px] px-1`。
- Electron 主进程在 electron/main/，预加载脚本在 electron/preload/，React UI 在 src/。
- 数据使用 Node/Electron 内置 node:sqlite，不依赖额外的 SQLite 原生 C++ 模块。
- SQLite 默认 userData/data，开发版和正式版必须隔离。严禁直接覆盖、删除未知用户数据目录。
- 默认分类 ID 固定 default，可改名、隐藏、改图标，但禁止删除。删除其他分类时使用事务将工具归入默认分类。
- 外部 URL 使用隔离的 WebContentsView，始终 nodeIntegration=false、contextIsolation=true、sandbox=true、webSecurity=true；默认不允许普通 HTTP；不暴露 IPC 给外部网页。
- IPC 主进程确认调用方并校验参数。严禁在 Electron 主进程 eval/Function 执行外部或 AI 生成的动态 Node.js。
- 生成私钥或随机密钥不记录到日志、SQLite，默认只在当前页内存中保留。
- UI 使用 Tailwind + shadcn/ui 风格组件、Lucide 与 Motion。统一双主题变量和减少动画设置。
- 每次修改先运行 npm run typecheck、npm test、npm run build。构建安装包时避免覆盖仍在运行的 release/win-unpacked。
- 提交信息格式：【模块】【功能】具体变更说明。不得把 node_modules/、out/、release/、plans/、用户数据提交到 Git。
