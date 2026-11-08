export type IconName='file'|'download'|'upload'|'close'|'plus'|'check'|'share'|'folder'|'message'
/** 引用 index.html 中的 SVG sprite 图标，供主页面和文件池模块共用。 */
export function icon(name:IconName){
 const svg=document.createElementNS('http://www.w3.org/2000/svg','svg')
 const use=document.createElementNS('http://www.w3.org/2000/svg','use')
 use.setAttribute('href','#i-'+name)
 svg.append(use)
 return svg
}
