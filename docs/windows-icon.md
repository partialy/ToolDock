# Windows 任务栏图标与 EXE 品牌资源

## 配置约定

- 正式版 AppUserModelID：`cn.partial.tooldock`；开发版使用 `cn.partial.tooldock.dev`，避免两个实例被系统分配相同任务栏分组身份。
- 品牌图标来源：`src/assets/tooldock-icon.ico`，包含 16/24/32/48/64/128/256px 图层。
- `electron-builder.yml` 的 `win.icon`、`nsis.installerIcon`、`nsis.uninstallerIcon`、`nsis.installerHeaderIcon` 指向同一 ICO。
- `electron/main/index.ts` 必须在创建窗口之前设置 AppUserModelID，并在创建 Windows 窗口时使用 NativeImage 显式设置窗口图标；系统托盘仍由 `electron/main/services/app-tray.ts` 读取同一资源。
- `win.signAndEditExecutable: true` 保证打包流程修改 EXE 图标资源，不要设置为 false。

## 构建后的确定性验收

```powershell
npm run build
npx electron-builder --win dir --config.directories.output=plans/icon-check-build --publish never
npm run verify:win-icon -- plans/icon-check-build/win-unpacked/ToolDock.exe
```

`verify-win-icon.cjs` 利用 PE 资源解析而非 Windows Explorer 图标缓存判断，要求可执行文件内的 7 个 RT_ICON 与品牌 ICO 各图层二进制完全一致，并具有默认 RT_GROUP_ICON 资源。生产 `npm run dist` 完成后自动运行校验。

2026-11-06 检测：已安装的 `E:\apps\ToolDock\ToolDock.exe` 与隔离打包的 `plans/icon-check-build/win-unpacked/ToolDock.exe` 内的 7 个图层均与品牌 ICO 字节一致；但 Windows `Icon.ExtractAssociatedIcon` 返回的 Shell 图像与品牌图像不同。这表明可执行文件的资源本身已经正确，后续若任务栏仍显示旧 Electron 图标，应检查系统任务栏固定项与 Shell 缓存，而不是误判为打包器未嵌入图标。

同日只读检查发现，当前 Windows 开始菜单中仍保留 `Electron.lnk`（指向本项目 `node_modules/electron/dist/electron.exe`）、`ToolDock.lnk` 与 `ToolDock (2).lnk`（均指向安装版）；这是可能造成旧图标入口混淆的环境线索。本次代码修改不会擅自删除或替换这些用户快捷方式。

## 手动 Windows 验收与缓存处理

1. 在**独立测试目录或新安装版本**验证任务栏、Alt+Tab、窗口左上角（如有）、托盘、桌面、开始菜单、安装程序、卸载程序。不要将编译成功代替 UI 目测验收。
2. 若任务栏仅旧的固定位置显示旧图标，先从任务栏取消固定原有快捷方式；使用安装版正常启动后，再从其任务栏按钮重新固定。不需要清空整个 Windows 图标缓存，不应自动重置 Explorer 或删除用户自定义任务栏配置。
3. 如果任务栏图标依旧异常，核查当前实际启动路径、快捷方式 Target/IconLocation、是否仍启动了旧版本、Windows 任务栏分组身份；必要时由用户自行手动选择刷新图标缓存。
4. 开发模式以 `electron.exe` 启动，操作系统对于开发版程序文件图标的展示行为可能与独立安装版不同；正式安装版是完整品牌验收目标。

本阶段未自动重启、卸载或覆盖用户正在运行的 `E:\apps\ToolDock`，未修改 AppData 数据、Windows 图标缓存、固定项或注册表。
