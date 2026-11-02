import { app, Menu, Tray } from 'electron'
import path from 'node:path'

/** Windows 原生入口统一使用包含 16–256px 图层的 ICO。 */
export function appIconPath(){
 return app.isPackaged
  ?path.join(process.resourcesPath,'tooldock-icon.ico')
  :path.join(app.getAppPath(),'src/assets/tooldock-icon.ico')
}

export function createAppTray(showWindow:()=>void){
 const tray=new Tray(appIconPath())
 tray.setToolTip('ToolDock')
 tray.setContextMenu(Menu.buildFromTemplate([
  {label:'显示主界面',click:showWindow},
  {label:'退出',click:()=>app.quit()}
 ]))
 tray.on('click',showWindow)
 tray.on('double-click',showWindow)
 return tray
}
