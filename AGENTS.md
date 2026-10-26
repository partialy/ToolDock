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

- Base64/JSON 工具保持纯本地处理，不在 IPC、SQLite 或日志中记录输入文本；Base64 不新增独立侧栏入口。
- 内置工具身份集中于 src/shared/builtinToolRegistry.ts，新增工具须同步实现 SQLite 版本化迁移和测试；迁移不可复活用户已删除的 developer 分类。
- JSON 无损转换位于 src/lib/json，禁止直接通过 JSON.parse -> JSON.stringify 处理待格式化/排序的原文，以免数值精度和重复键丢失。
- 大 JSON 在 src/workers/json.worker.ts 解析，React UI 不做同步重量级 AST 遍历；超出限制时显示错误，保留源数据，不执行危险操作。
- 编辑器使用 src/components/json/JsonEditor.tsx，新增下拉菜单继续复用 SelectField；动效遵循 reduced/off 设置，保持 Header h-[48px] px-1。

- 新工具的下拉、日期、时间与日期时间组合选择必须使用 ToolDock 自定义 SelectField / DateField / TimeField / DateTimeField，统一 Radix 浮层、主题、焦点和键盘交互；不得使用原生 date/time/datetime-local 浮层。
- 新图片工具处理必须保持纯本地、安全 SVG 栅格化、独立 Worker 受控处理和有权限边界的保存 IPC；图片及密钥内容不得写入 SQLite/日志。
- 新增内置工具沿用 src/shared/builtinToolRegistry.ts、版本化 SQLite 迁移；不覆盖用户已修改或删除的分类与工具状态。

- 图片编码内置工具仅允许 PNG/JPEG/WebP/GIF/BMP/ICO 的二进制无损 Base64 往返；禁止把图片字节送到 src/lib/base64.ts（该文件只供 2 MiB UTF-8 文本使用）。转换需在独立 image-encoding Worker 中完成，限制 20 MiB 文件和 30 MiB 文本，严格检验魔数与 Data URL MIME，不引入二维码。
- 日期/时间弹层通过 PickerPopoverContent 统一 Motion 进出动画，月份切换遵循方向；Normal/Reduced/Off 与系统无障碍设置优先。严禁新增原生 date/time 选择浮层。
- 数据库 v4 只增加 builtin-image-encoding，不更改既有内置工具 ID、不重建用户已删除的类别；确认当前 feat/image-devtools-integration 分支未提交修改后再操作。

- 二维码工具：固定内置 ID builtin-qr-code-tool，路由 qr-code-tool；依赖 SQLite v5 增量迁移，不复活已经删除的 images 分类。完整 UI 配置/Logo 不持久化或联网，始终采用 UTF-8 原始文本编码到 Byte mode 的字节序列，严禁直接把 Unicode 字符串交给 qr-code-styling Byte mode（会截断中文/Emoji）。
- 二维码 PNG/WebP/SVG 只导出经安全生成的本地结果。点阵及定位角颜色必须分别与背景达到至少 4.5:1；最终图像由本地 jsQR 扫码验证。验证失败可告知风险后选择导出，但不得当作扫码通过；SVG Logo 必须内嵌且无脚本/外链。
- 所有应用内普通/危险操作使用 DialogProvider/useDialog 或 DialogShell，禁止 window.confirm、window.alert、window.prompt。危险操作默认聚焦取消；异步 confirmAction 禁止重复触发。Electron 原生打开/保存文件窗及备份恢复主进程最终安全确认保留不替换。
