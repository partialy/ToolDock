export type Crumb={id:string;name:string}
export type MobileTab='download'|'pool'|'messages'
export type PoolUiState={trail:Crumb[];upload:boolean;viewer:string|null}
export type NavState={tab:MobileTab;shares:Crumb[];pool:PoolUiState}
export const defaultNav=():NavState=>({tab:'download',shares:[],pool:{trail:[],upload:false,viewer:null}})
/** 一级 tab 的切换只覆盖当前历史项，二级页面（目录、上传抽屉、文本查看器）才压栈。 */
export function initNavigation(restore:(state:NavState)=>void){
 history.replaceState(defaultNav(),'')
 window.addEventListener('popstate',event=>restore((event.state as NavState|null)||defaultNav()))
}
export const recordNavigation=(state:NavState)=>history.pushState(state,'')
export const anchorNavigation=(state:NavState)=>history.replaceState(state,'')
export const backNavigation=(steps=1)=>history.go(-steps)
