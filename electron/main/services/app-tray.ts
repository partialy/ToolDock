import {app,Menu,Tray,type MenuItemConstructorOptions} from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import type {Tool} from '../../../src/types/models'

/** 与 electron-builder 的 extraResources 资源路径保持一致。 */
export function appIconPath(){
 const icon=app.isPackaged?path.join(process.resourcesPath,'tooldock-icon.ico'):path.resolve(__dirname,'../../src/assets/tooldock-icon.ico')
 if(!fs.existsSync(icon))throw Error('ToolDock Windows 图标文件不存在：'+icon)
 return icon
}
/** 使用 Windows 原生菜单，更新菜单不销毁托盘对象或改变左键行为。 */
export function updateAppTray(tray:Tray,pinned:Tool[],showWindow:()=>void,openTool:(id:string)=>void){
 const shortcuts:MenuItemConstructorOptions[]=pinned.map(tool=>({label:tool.name,click:()=>openTool(tool.id)}))
 const template:MenuItemConstructorOptions[]=[
  {label:'显示主界面',click:showWindow},
  {type:'separator'},
  {label:'快捷工具',submenu:shortcuts.length?shortcuts:[{label:'暂无固定工具',enabled:false}]},
  {type:'separator'},
  {label:'退出',click:()=>app.quit()}
 ]
 tray.setContextMenu(Menu.buildFromTemplate(template))
}
export function createAppTray(showWindow:()=>void,openTool:(id:string)=>void,pinned:Tool[]=[]){
 const tray=new Tray(appIconPath())
 tray.setToolTip('ToolDock')
 updateAppTray(tray,pinned,showWindow,openTool)
 tray.on('click',showWindow)
 tray.on('double-click',showWindow)
 return tray
}
