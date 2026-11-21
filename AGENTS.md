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

- Base64/JSON/编解码工具保持纯本地处理，不在 IPC、SQLite 或日志中记录输入文本；Base64 已由密钥生成器迁移至独立「编解码」工具，AES 密钥输出的 Base64 格式仍保留。
- 内置工具身份集中于 src/shared/builtinToolRegistry.ts，新增工具须同步实现 SQLite 版本化迁移和测试；迁移不可复活用户已删除的 developer 分类。
- JSON 无损转换位于 src/lib/json，禁止直接通过 JSON.parse -> JSON.stringify 处理待格式化/排序的原文，以免数值精度和重复键丢失。
- 大 JSON 在 src/workers/json.worker.ts 解析，React UI 不做同步重量级 AST 遍历；超出限制时显示错误，保留源数据，不执行危险操作。
- 编辑器使用 src/components/json/JsonEditor.tsx，新增下拉菜单继续复用 SelectField；动效遵循 reduced/off 设置，保持 Header h-[48px] px-1。

- 新工具的下拉、日期、时间与日期时间组合选择必须使用 ToolDock 自定义 SelectField / DateField / TimeField / DateTimeField，统一 Radix 浮层、主题、焦点和键盘交互；不得使用原生 date/time/datetime-local 浮层。
- 新图片工具处理必须保持纯本地、安全 SVG 栅格化、独立 Worker 受控处理和有权限边界的保存 IPC；图片及密钥内容不得写入 SQLite/日志。
- 新增内置工具沿用 src/shared/builtinToolRegistry.ts、版本化 SQLite 迁移；不覆盖用户已修改或删除的分类与工具状态。

- 图片编码内置工具仅允许 PNG/JPEG/WebP/GIF/BMP/ICO 的二进制无损 Base64 往返；禁止把图片字节送到 src/lib/base64.ts（公开 API 的 UTF-8 文本上限为 2 MiB；编解码 Worker 允许受控内部 8 MiB 上限）。转换需在独立 image-encoding Worker 中完成，限制 20 MiB 文件和 30 MiB 文本，严格检验魔数与 Data URL MIME，不引入二维码。
- 日期/时间弹层通过 PickerPopoverContent 统一 Motion 进出动画，月份切换遵循方向；Normal/Reduced/Off 与系统无障碍设置优先。严禁新增原生 date/time 选择浮层。
- 数据库 v4 只增加 builtin-image-encoding，不更改既有内置工具 ID、不重建用户已删除的类别；确认当前 feat/image-devtools-integration 分支未提交修改后再操作。

- 二维码工具：固定内置 ID builtin-qr-code-tool，路由 qr-code-tool；依赖 SQLite v5 增量迁移，不复活已经删除的 images 分类。完整 UI 配置/Logo 不持久化或联网，始终采用 UTF-8 原始文本编码到 Byte mode 的字节序列，严禁直接把 Unicode 字符串交给 qr-code-styling Byte mode（会截断中文/Emoji）。
- 二维码 PNG/WebP/SVG 只导出经安全生成的本地结果。点阵及定位角颜色必须分别与背景达到至少 4.5:1；最终图像由本地 jsQR 扫码验证。验证失败可告知风险后选择导出，但不得当作扫码通过；SVG Logo 必须内嵌且无脚本/外链。
- 所有应用内普通/危险操作使用 DialogProvider/useDialog 或 DialogShell，禁止 window.confirm、window.alert、window.prompt。危险操作默认聚焦取消；异步 confirmAction 禁止重复触发。Electron 原生打开/保存文件窗及备份恢复主进程最终安全确认保留不替换。

- 文本 / JSON 差异对比固定内置 ID 为 builtin-text-diff、路由 text-diff；通过 SQLite v7 增量注册，不恢复已删除的开发分类，不修改用户工具名称、位置、图标或可见性。编辑采用 CodeMirror，比较使用独立 diff.worker.ts 与虚拟行列表。输入仅在当前页内存保留，不写入数据库、IPC 或日志。JSON 对象键忽略排序使用现有无损 AST 变换，数组顺序不忽略，重复键拒绝比较；单侧限制 2 MiB / 10000 行，超高差异编辑距离安全降级整段显示。
- 命令执行工具固定内置 ID builtin-command-tool，路由 command-tool，SQLite v9 增量注册且不更改已有类别/工具配置。仅开放固定 IPC（查询本地端口、核验后结束选定 PID、选择/校验/创建 Junction 与打开目录），不可提供任意命令或脚本执行，禁止自动提权、进程树结束和未经确认的危险操作。
- 端口查询允许 TCP/UDP IPv4/IPv6，结束进程重新核验启动时间/身份/端口归属，并保护系统/ToolDock 进程；Junction 不覆盖/移动/删除既有文件夹，严格校验绝对路径和环路。输出、进程/路径信息仅驻留当前 UI 会话，不持久化或记录日志。

- 快捷启动按 plans/QUICK_LAUNCH_IMPLEMENTATION.md 在 feat/quick-launch 开发。2026-10-31 用户最新决定“实现整个计划，我来验收”，覆盖此前阶段 0 验收阻断后续开发的限制；完整实现继续推进，未实测的 UAC/跨账户/窗口等场景保留为用户验收项，禁止标记已通过。
- 快捷启动与既有命令执行工具保持独立边界；不得扩展 commands:* 为任意命令入口。快捷启动使用独立 quickLaunch:* IPC、SQLite v10 的 App/分组及独立 Windows Runner；命令、脚本和控制台输出不得进入诊断日志。
- 快捷启动托管资源在 tools/quick-launch/apps，运行身份与控制凭据在 tools/quick-launch/runtime；备份排除 runtime，恢复拒绝导入运行身份。运行中/状态未知时锁定配置，阻止迁移、恢复和旧副本清理；停止仅作用于认证 Runner 持有的 Job。
- 正式 Runner 源码在 native/quick-launch-runner，使用 .NET 10 self-contained win-x64；开发先执行 npm run build:runner，npm run dist 自动构建 Runner。构建产物不提交，通过 extraResources 打包；重建前停止仍使用该二进制的任务。运行输出只在内存保留，任务元数据轮询不重复传输 App 配置和图标；详细模块/验收说明见 docs/quick-launch.md。

- v1.0.0 品牌资源在 src/assets：WebP 供应用内展示，含 16–256px 图层的 ICO 供窗口、任务栏、托盘、安装与卸载程序使用；运行时 ICO 通过 extraResources 打包。Windows AppUserModelID 与打包 appId 保持 cn.partial.tooldock。
- 系统托盘由 electron/main/services/app-tray.ts 管理，仅提供「显示主界面」「退出」。关闭主窗口隐藏到托盘并保留页面及运行任务；点击托盘恢复窗口，退出/重启沿用文件快传与快捷启动的清理流程，重复退出不能跳过异步清理。
- Windows 使用 NSIS 向导安装（oneClick=false、allowToChangeInstallationDirectory=true），允许手动选择安装路径，创建桌面与开始菜单快捷方式。安装目录与用户数据目录相互独立。

- 视频处理固定 ID `builtin-video-processing`、路由 `video-processing`、分类 `media`；SQLite v12 增量迁移仅首次注册，不覆盖用户分类/工具配置。`src/shared/mediaModels.ts` 是受限 `media:*` IPC 契约，主进程 `services/media` 管理扫描、队列、模型与引擎，任务不依赖页面生命周期。
- 媒体始终本地处理，提取并发2、字幕串行1；只允许白名单参数构造 `shell:false` 子进程。输出暂存后原子提交，禁止覆盖源文件和既有目标；正式退出取消受控进程，异常恢复标中断，不自动重跑。SQLite 只留最近100条终态元信息，不存媒体正文。
- FFmpeg/ffprobe 使用锁定 GitHub BtbN LGPL 资产、CPU Whisper 随包、CUDA 同版本官方资产按需安装，均验证SHA-256；资源在 `resources/media/bin`（忽略提交），锁文件和获取脚本提交。禁止复制本机GPL FFmpeg。设备显示依据实际引擎初始化，强制GPU失败不降级，自动模式失败明确回退CPU。
- Whisper 模型按需获取、支持离线导入与引用；下载加速默认关闭，仅代理模型请求，失败回退直连。Range/Content-Range/版本/长度/哈希必须验证，暂存未完成文件不能作为模型。模型、CUDA与媒体缓存排除普通备份，目录迁移与媒体/下载/数据恢复互斥；详见 `docs/video-processing.md`。

- 媒体偏好更新使用无默认值的 `mediaPreferencesPatchSchema`；禁止对含 `default()` 的完整 schema 直接 `.partial()` 解析补丁，防止 Zod 4 注入未提交字段、覆盖偏好或误触目录限制。
- 普通操作反馈统一使用 `src/components/ui/message.tsx` 的 `msg.success/error/warning/info/loading`，由 App 挂载 `MsgViewport` 顶部展示；尾部支持复制完整详情及关闭，遵循主题和动效偏好。错误展示去除 Electron IPC 外壳，复制保留诊断详情。不得新增页面内临时成功/错误条；输入验证、编辑器定位、任务历史诊断保留所属业务区域。文件快传等带操作的提醒仍由 NotificationProvider 管理。
- 数据目录迁移由 `services/data-migration.ts` 先在目标同父独立暂存目录复制、校验，再排他提交；预建目标目录本身和用户并发写入内容必须保留。失败只清理身份核验后的自有暂存目录，严禁递归删除用户选择的目标；启动定位/新数据库失败时恢复原目录，清理异常不得遮蔽提交结果。


- 视频处理第三个 Tab「简繁转换」采用独立 textConversion:* IPC、TextConversionService 与 Node Worker，不扩充 MediaKind，不污染媒体任务 SQLite。TXT/MD/SRT/VTT/LRC 仅做本地转换，保留字幕时间戳、歌词标签及 Markdown 代码/链接目标；opencc-js 转换方向/地区与编码处理须覆盖回归测试。
- 简繁文件任务默认 100 项、500 MiB 总量、单文件 50 MiB、最多并发 2；文本及文件正文不记录到日志/SQLite/备份。文件结果暂存于专属受控会话目录，退出严格校验并清理；数据目录迁移与活动转换互斥。导出必须排他不覆盖原始或已有文件，ZIP 使用 yazl 流式写入。每行仅有一个三点操作按钮（菜单中为图标+文案）。

- 手机快传页在 `src/mobile-transfer`（原生 TS + HTML/CSS，`vite.mobile.config.ts` 构建到 `out/mobile-transfer`，由 transfer 服务 `handle()` 直接提供静态文件）。页面使用底部三项导航（分享/文件池/消息池，上图标下文字），顶部不再保留标题、连接状态与设备名区域；页面内提示统一走 `src/mobile-transfer/toast.ts` 的 toast，不再使用固定错误条。
- 手机设备名由主进程 `LanAuth.authorize()` 自动分配，格式 `单词-4位后缀`（后缀字符集 `23456789ABCDEFGHJKMNPQRSTUVWXYZ`，排除易混淆的 0 O 1 I L；词表见 `electron/main/services/transfer/device-names.ts`），在当前在线设备内唯一、刷新保持、不可手动改名；文件池与消息归属均使用该名称。二级页面（目录层级、上传抽屉、文本查看器）通过 `src/mobile-transfer/navigation.ts` 压入 history，手机返回键按层级后退，一级 tab 切换不压栈。

- 系统环境变量管理工具固定内置 ID `builtin-env-manager`、路由 `env-manager`、默认分类 `developer`，通过 SQLite v15 增量注册，不复活已删除的 `developer` 分类。采用受限 `envManager:*` IPC 与 `services/env-manager` 服务，无损读取 Windows 注册表（保留 `REG_SZ` 与 `REG_EXPAND_SZ`），禁止删除或清空 `ComSpec`、`SystemRoot`、`windir` 及系统 `Path` 中的 `System32`。非管理员状态下修改 `Machine` 变量通过单次受控 UAC 提权执行并广播 `WM_SETTINGCHANGE`。版本切换预设与历史快照（自动快照最多保留 30 份）存放在 `tools/env-manager`，跟随数据目录迁移但排除在普通全局 ZIP 备份之外，变量明文不写入日志。
