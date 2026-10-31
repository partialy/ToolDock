# 快捷启动 Runner

使用 .NET SDK 10.0.402（允许同功能版本补丁），构建 `win-x64` 自包含单文件，目标机不需要安装 .NET。`npm run build:runner` 输出到忽略提交的 `publish/`，当前产物约 74 MB；`npm run dist` 先构建 Runner，通过 electron-builder 的 `extraResources` 放入 `resources/quick-launch-runner`。开发环境从项目 `native/quick-launch-runner/publish` 读取，不能覆盖仍在运行的同路径 Runner。

每任务独立进程持有 Windows Job，子进程以挂起状态创建、加入 Job 后恢复。Job 的 kill-on-close 属于独立 Runner：Electron 退出不会关闭它，Runner 崩溃则回收受控成员。停止先尝试控制台中断，再限制等待并终止已验证的 Job；不根据进程名结束进程。

普通启动使用私有 stdin 传配置；管理员启动由短期启动器通过 `runas` 请求 UAC，再通过具有 SID ACL 的临时命名管道传递配置。启动器校验被授权进程 PID、映像；Runner 校验启动器 PID、映像及会话。控制端每次校验服务端 PID、创建时间、映像，并通过随机 challenge、客户端 nonce 与 HMAC 双向确认；只允许查询、附着清空输出、停止，不能再次提交命令。私密 token 不出现在命令行，Electron 使用 Windows 安全存储加密后保存在受保护 runtime 目录，备份不得包含 runtime。

执行前先落地不含命令和输出的身份元数据，避免主程序在 UAC/启动中途退出时丢锁。不可验证身份或缺少签名结束结果保持 unknown；解除 unknown 只清记录，不杀进程。认证前报文、超时、输出、响应都有上限，坏连接不会结束任务。

PowerShell 静默内联通过 stdin 的 Base64 文本解码执行，避免 OEM 编码与命令行长度限制。CMD 内联及可见内联在随机、受保护的任务专属临时目录写入脚本（PowerShell 为 UTF-8 BOM，CMD 为 UTF-8），结束后删除；异常断电或强杀可能留下这份临时脚本。不会写入 runtime、诊断日志或输出日志。托管脚本不复制相邻依赖。CMD 内联使用代码页 65001；托管 CMD 脚本通过严格 UTF-8 检测，否则按系统 ANSI 代码页运行及解码，不改写原字节。主动使用其他编码或在运行中切换编码的外部程序仍可能需要自行指定 UTF-8。

stdout/stderr 在 Runner 内存中滚动保留至多 2 MiB UTF-16 字符存储；单次传输限制 16 MiB，覆盖 JSON 最坏转义膨胀。Electron 仅保留最近 8 份完成输出与 100 条任务结果。重新附着清空历史输出，只显示本次连接后的内容。只传入有限的 Windows 标准环境变量，避免继承 ToolDock 特有凭据。

普通静默 PowerShell 中文输出、stderr、退出码，CMD 退出码，以及长期任务附着/停止已有本地固定探针验证。UAC 允许/取消、跨账户 ACL、可见窗口及无 SDK 干净目标机安装行为仍需用户实际验收；编译通过不能替代这些结果。
