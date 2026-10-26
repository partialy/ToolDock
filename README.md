# ToolDock

Windows 桌面小工具聚合器。技术栈：Electron + React + TypeScript + electron-vite + Tailwind CSS + shadcn/ui 风格组件 + Motion + Lucide；本地数据使用 Node/Electron 内置 `node:sqlite`（无需额外 C++ SQLite 插件）。

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

`npm run dist` 默认在 `release/` 下生成 Windows NSIS 安装包。**若原 release/win-unpacked 正在运行、文件被占用**，可改用独立输出目录：`npx electron-builder --win nsis -c.directories.output=plans\release-verify`。不要为了构建强行关闭用户正在运行的应用。

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

- **密钥生成器 → Base64 编解码**：UTF-8 标准 Base64 与 Base64URL、保留/移除填充、自动识别解码、严格尾部位/UTF-8 校验；左右实时转换与复制。
- **JSON 处理**：内置 `builtin-json-tool`，默认归入「开发工具」；CodeMirror 6 原文/结果编辑器、严格 JSON 校验、重复 Key 提示、格式化/压缩/递归排序、字符串转义/反转义、JSONPath 树形搜索、完整节点复制与 JSON 文件导入导出。
- JSON 解析与转换在 Vite Worker 中执行；结果带来源修订号，取消通过终止并重建 Worker 实现。默认单个 JSON 输入限制 20 MiB，Base64 文本输入 2 MiB；所有原文仅保留在页面会话内存中。
- JSON 格式化/排序使用 AST 与原始 token 切片，**不通过 JSON.parse → JSON.stringify 重新序列化**，以保留超大整数、高精度小数和原始字符串字面量；重复 Key 阻止可能误导的变换。
- SQLite v2 迁移仅增量添加 JSON 工具，不重置旧版用户已修改的分类、工具属性和设置。系统内置工具都允许隐藏、改名、移动、排序，但不可删除。
- 测试：`npm run typecheck` / `npm test` / `npm run build`。具体执行与验收见被 Git 忽略的 `plans/BASE64_JSON_IMPLEMENTATION.md`。

## 图片工具与 DevTools Lite 整合（2026-10-26）

- 新增「图片工具」分类：图片处理（JPEG/PNG/WebP 上传、缩放、压缩、格式转换、交互式裁剪、原图/结果预览、批量处理与 ZIP 导出）；Logo / ICO 生成（SVG/PNG/JPEG/WebP 输入、9 种尺寸、PNG/JPEG/WebP、标准多帧 ICO）。
- 新增「时间转换」与「UUID 生成」工具。时间转换支持自动判定 10/13 位 Unix 时间戳、显式秒/毫秒、UTC/local/ISO、自定义日期日历及 24 小时时分秒选择面板。UUID 支持批量生成、格式选项、复制和 TXT 下载。
- 密钥生成器原有 SSH、RSA、AES、Base64 不改变；新增 ECDSA P-256/P-384，以及随机串自定义字符、快捷长度和每字符类别至少出现一次。
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
