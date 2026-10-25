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
