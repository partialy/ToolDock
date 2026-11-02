# ToolDock

Windows 桌面小工具聚合器。技术栈：Electron + React + TypeScript + electron-vite + Tailwind CSS + shadcn/ui 风格组件 + Motion + Lucide；本地数据使用 Node/Electron 内置 `node:sqlite`（无需额外 C++ SQLite 插件）。

## v1.0.1 更新（2026-11-02）

- 文件快传支持文件和文件夹混合分享、目录分级浏览、面包屑、跨目录多选及保留目录结构的 ZIP 下载；共享源撤销时关联下载中断。
- 新增 SQLite v11 分享历史，保留最近 300 条文件/文件夹路径，支持搜索、多选恢复及无效路径提示；停止文件服务器不清除历史。
- 文件快传和图片类工具统一页面级文件拖放；图片处理与 Logo / ICO 生成器调整文件队列操作和空状态文案。
- 顶栏新增文件快传状态胶囊，运行状态使用周期 SVG 和逐字透明度动画，遵从减少/关闭动效设置。
- 保留原移动端上传审批与旧下载接口，优化开发版系统托盘图标路径。
- 已通过类型检查、单元测试及隔离开发环境 Electron/Chrome 文件快传 E2E；真实 Windows 文件夹混合拖放、移动端真机与安装版体验仍建议手动验收。

## v1.0.0 发布

- 统一应用内 Logo、窗口/任务栏、系统托盘与安装/卸载程序图标，关于页随应用版本显示。
- 关闭主窗口会隐藏至系统托盘，页面状态和后台任务保留；点击托盘或选择「显示主界面」恢复窗口，选择「退出」正常退出。退出仍遵循快捷启动的「退出时自动停止任务」设置。
- Windows NSIS 安装向导支持手动选择安装路径，并创建桌面与开始菜单快捷方式；安装位置不影响独立的用户数据目录。
- 快捷启动的使用及运行安全边界见 [快捷启动说明](docs/quick-launch.md)。

## 启动

需要 Windows 10/11、Node.js 22+ 与 npm。

```powershell
npm install
npm run dev
```

开发版数据目录默认为 `%APPDATA%\ToolDock-Dev\data`，正式版为 `%APPDATA%\ToolDock\data`。数据目录可在「设置」中迁移至自选位置。开发版与正式版相互独立。

## 检查与构建

```powershell
npm run typecheck
npm test
npm run build
npm run dist
```

`npm run dist` 默认在 `release/` 下生成 Windows NSIS 安装包。**若原 release/win-unpacked 正在运行、文件被占用**，可改用独立输出目录：`npx electron-builder --win nsis '--config.directories.output=plans/release-verify'`。不要为了构建强行关闭用户正在运行的应用。

## 功能

- 48px 顶栏（`h-[48px] px-1`），前进/返回、添加、窗体控制和主题切换。
- 支持分类、工具的编辑、隐藏、拖拽排序与 SQLite 持久化。默认分类可以改名/隐藏，但不可删除；删除其他分类时工具会移动到默认分类。
- 网页工具使用独立隔离的 Electron WebContentsView；默认只允许 HTTPS 和回环地址的 HTTP。设置中可以允许普通 HTTP；不暴露 Node.js API。
- 首期预置密钥生成器（SSH Ed25519/RSA、PEM RSA、AES、安全随机字符串），默认不持久化密钥。
- 数据目录迁移、旧副本删除、备份恢复、诊断日志；主题、动效和默认分类标记可配置。

## UI 组件约定

下拉框统一使用 `src/components/ui/select-field.tsx`（卡片式选项、Radix Select 键盘操作、Motion 微动画），布尔设置统一使用 `src/components/ui/switch-field.tsx`（弹簧开关）。不要在新页面中直接添加原生 `<select>`。组件会响应标准/减少/关闭动效设置及系统减少动画偏好。

## 安全约束

外部网页不可获得 Node.js、Electron IPC 或文件系统权限；不允许通过 `eval` 执行 AI 生成的 Node.js 代码。将来导入的本地 HTML/AI 生成工具必须与主程序隔离并采用能力授权。私钥与 AES 密钥不写入 SQLite 和诊断日志。

## 文档与 Git

开发检查计划记录在本机 `plans/IMPLEMENTATION.md`，整个 `plans/` 按要求加入 `.gitignore`，**不随 Git 提交**。源项目 `E:\Projects\Base\NodeBase` 只作为布局、菜单实现的参考，不修改原仓库。

## Base64 与 JSON 工具（2026-10-25）

- **编解码 → Base64 编解码**：原密钥生成器 Base64 标签已迁移到独立「编解码」工具，保留 UTF-8 标准 Base64 / Base64URL、填充开关、自动识别解码与严格 UTF-8 校验；密钥生成器中的 AES Base64 密钥输出保持不变。
- **JSON 处理**：内置 `builtin-json-tool`，默认归入「开发工具」；CodeMirror 6 原文/结果编辑器、严格 JSON 校验、重复 Key 提示、格式化/压缩/递归排序、字符串转义/反转义、JSONPath 树形搜索、完整节点复制与 JSON 文件导入导出。
- JSON 解析与转换在 Vite Worker 中执行；结果带来源修订号，取消通过终止并重建 Worker 实现。默认单个 JSON 输入限制 20 MiB，Base64 文本输入 2 MiB；所有原文仅保留在页面会话内存中。
- JSON 格式化/排序使用 AST 与原始 token 切片，**不通过 JSON.parse → JSON.stringify 重新序列化**，以保留超大整数、高精度小数和原始字符串字面量；重复 Key 阻止可能误导的变换。
- SQLite v2 迁移仅增量添加 JSON 工具，不重置旧版用户已修改的分类、工具属性和设置。系统内置工具都允许隐藏、改名、移动、排序，但不可删除。
- 测试：`npm run typecheck` / `npm test` / `npm run build`。具体执行与验收见被 Git 忽略的 `plans/BASE64_JSON_IMPLEMENTATION.md`。

## 图片工具与 DevTools Lite 整合（2026-10-26）

- 新增「图片工具」分类：图片处理（JPEG/PNG/WebP 上传、缩放、压缩、格式转换、交互式裁剪、原图/结果预览、批量处理与 ZIP 导出）；Logo / ICO 生成（SVG/PNG/JPEG/WebP 输入、9 种尺寸、PNG/JPEG/WebP、标准多帧 ICO）。
- 新增「时间转换」与「UUID 生成」工具。时间转换支持自动判定 10/13 位 Unix 时间戳、显式秒/毫秒、UTC/local/ISO、自定义日期日历及 24 小时时分秒选择面板。UUID 支持批量生成、格式选项、复制和 TXT 下载。
- 密钥生成器原有 SSH、RSA、AES 保持兼容（Base64 编解码后来已迁至独立「编解码」工具）；新增 ECDSA P-256/P-384，以及随机串自定义字符、快捷长度和每字符类别至少出现一次。
- 自定义选择器统一使用 ToolDock 现有主题变量、Radix 浮层、圆角、边框和键盘焦点设计，不使用浏览器原生日期时间弹出面板。
- 图片在本地处理：优先通过独立 Image Worker 执行缩放/编码；SVG 仅在安全校验后本地栅格化；ICO 使用 PNG 帧封装；导出经受限 IPC 在系统保存对话框指定位置流式落盘（ZIP 使用 fflate）。
- 单张文件 50 MiB、每批 100 张/300 MiB、解码不超过 4000 万像素、输出单边不超过 8192px 且最多 4000 万像素；结果暂存在页面内存中，参数变化后必须重新生成；未导出时切换页面有确认提示。
- SQLite v3 仅增量注册四个新工具、图片分类，不覆盖现有自定义配置；删除图片分类后重启不会复活。
- 自动化验证：npm run typecheck、npm test、npm run build。项目忽略的 plans/e2e-image-devtools.cjs 提供隔离 APPDATA 的 Electron 端到端脚本，测试图片 Worker、SVG/ICO、文件保存和导航守卫。
- 完整产品约束与开发验收记录见被 Git 忽略的 plans/IMAGE_DEVTOOLS_INTEGRATION.md。

## 图片编码与日期时间动效（2026-10-26）

- 图片工具新增「图片编码」：单张图片与 Base64/Data URL 双向转换，PNG、JPEG、WebP、GIF、BMP、ICO 六种图片格式。原字节无损保留，不使用 Canvas 重压缩；GIF 动画保持原始内容。
- 上传图片至多 20 MiB，粘贴编码至多 30 MiB；二进制转换在独立 Worker 中运行。默认输出 Data URL，同时可选纯 Base64。编码预览显示前 2000 字符，完整内容可复制或使用原生保存对话框导出 TXT。
- 解码时严格核验 Base64 长度、填充、尾部有效位和图片真实格式；Data URL 的 MIME 必须符合实际文件内容。
- 自定义日期、时间选择器加入统一 Motion 动画、按方向切换月份、时间选项平滑滚动，遵循 Normal / Reduced / Off 和系统减少动画选项。
- 新内置工具由 SQLite v4 增量迁移注册，保留用户已有的分类、名称、显隐和排序；不会恢复此前删除的分类。
- 本功能完全离线，图片/编码不入 SQLite 或诊断日志。本轮不提供二维码功能。

## 二维码工具与统一对话框（2026-10-26）

- 「图片工具」中新增二维码工具：文本与 HTTP(S) 链接、六套主题、前景/背景/定位角自定义 HEX、六种点阵和三种定位角、128–2048px、自定义 Logo 及圆角。
- 本地 PNG/JPEG/WebP Logo 最大 2 MiB，自动清除原文件元信息并内嵌到二维码。纠错等级可自动 Q/H，也可手动 L/M/Q/H；文本编码走 UTF-8 Byte 模式保留中文/Emoji/换行。
- 对最终生成图片本地扫码验证，并显示通过或风险提示；本地解码失败时需要用户确认风险才能导出。支持 PNG/WebP/SVG 原生文件保存，SVG 为无脚本、无外部引用的独立文件。
- 新增 SQLite v5 增量注册，不恢复此前删除的用户类别，不重设已修改的预置工具。
- 统一 DialogShell、DialogProvider / useDialog、ConfirmDialog、DangerDialog、FormDialog、WorkspaceDialog；ToolDock 内删除工具/分类、清理 Cookie、迁移数据、恢复备份入口与清空日志改用统一视觉。备份恢复保留主进程的最终系统级安全确认与回滚保护。
- 二维码生成完全本地、不访问链接或网络服务，图片和内容不写入数据库或诊断日志。界面遵守现有深浅色、Normal/Reduced/Off 动画。
- E2E 自动化可参考忽略于 Git 的 plans/e2e-qr-dialog.cjs；在隔离 APPDATA 内验证二维码扫码解码一致性和 Dialog 交互。

## 文本 / JSON 差异对比（2026-10-26）

- 新增独立「文本 / JSON 差异对比」内置工具，默认位于「开发工具」分类：CodeMirror 左右输入，逐行比对新增、删除、修改，并提供上一处、下一处差异及行号对齐的高亮结果。
- JSON 对比默认忽略对象 Key 顺序（可关闭），先严格解析、规范化缩进；递归对象排序但不改变数组顺序，保留高精度数字原文，重复 Key 和不合法 JSON 直接报错。
- 文件支持单侧导入、复制、交换和清空；对比结果使用 Worker 和虚拟列表。单侧最大 2 MiB / 10000 行；超多差异会保守合并为整段变化，避免冻结页面。
- 输入与结果纯内存处理，不使用 IPC 和 SQLite 保存正文；SQLite v7 仅注册工具入口，不覆盖既有分类与用户修改。
- 验收通过 npm run typecheck、npm test（89 测试）、npm run build 及隔离 APPDATA 的 Electron E2E 测试。设计与测试记录见 plans/TEXT_JSON_DIFF_IMPLEMENTATION.md。

## 独立「编解码」工具（2026-10-27）

- 新增内置「编解码」工具（`builtin-codec-tool`），提供 Base64、URL（组件/URI/Form）、Unicode（JS/ES6/U+）、Hex、HTML Entity、JSON 字符串转义及 Binary 的本地双向转换。
- 默认单步双栏模式，多步模式支持最多 20 个可独立配置的步骤，支持拖拽排序、复制、停用、失败定位、阶段结果查看与六套常用转换模板。
- 输入限制 2 MiB，单步输出限制 8 MiB，使用 Worker 运行并取消过期任务；非法 UTF-8、百分号转义和不完整 Unicode 等均按严格规则报错，不静默替换内容。
- SQLite v8 新增 `codec_pipelines` 表及 `codecPipelines` 受限 IPC，可保存最多 200 份独立流水线配置，支持命名、保存修改、另存为、复制、搜索、删除和配置 JSON 导入导出。**只持久化流程步骤和参数，不持久化用户输入、结果或中间文本。**
- 密钥生成器中的旧 Base64 Tab 已移除；AES 密钥的 Base64 / Base64URL 输出不受影响。新增工具默认位于「开发工具」，内置工具身份/用户自定义排序与显隐遵循原有规则。
- 设计及验收记录见被 Git 忽略的 `plans/CODEC_PIPELINE_IMPLEMENTATION.md`。

## 命令执行工具（2026-10-31）

- 新增「开发工具 → 命令执行」内置工具（`builtin-command-tool`，SQLite v9 增量注册），只有「端口管理」与「Junction 链接」两个固定功能，不支持自定义 PowerShell/CMD 命令。
- 端口管理：输入本机端口（1–65535），通过 Windows PowerShell 查询 TCP/UDP 的 IPv4/IPv6 占用，展示连接状态、进程名、PID、路径及结果耗时，支持协议/状态筛选、复制及刷新；结束进程需二次确认，并再次核验启动时间、PID、端口归属，保护系统和 ToolDock 关键进程。
- Junction：支持系统目录选择器或手动输入已有目标/父目录和新链接名，实时路径校验、冲突阻止、Windows Junction 创建与映射验证；可复制路径和打开链接目录，不会覆盖、移动或删除已有目录。
- 所有能力经 Electron 可信主进程的专用 IPC 执行，执行超时 15 秒且输出受限；仅使用当前用户权限。结果仅保存在页面会话中，不进入 SQLite/日志；不需要额外数据库表。
- 详细设计与验收见本地忽略的 `plans/COMMAND_EXECUTION_IMPLEMENTATION.md`。
