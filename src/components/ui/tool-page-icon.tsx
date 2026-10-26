import {createContext,useContext,type ReactNode} from 'react'
import {Icon} from './icon'

const ToolPageIconContext=createContext('wrench')

/**
 * The page icon is driven by the selected Tool record. Editing a tool icon in
 * the manager updates both sidebar and page header without remounting the page.
 */
export function ToolPageIconProvider({name,children}:{name?:string;children:ReactNode}){
 return <ToolPageIconContext.Provider value={name||'wrench'}>{children}</ToolPageIconContext.Provider>
}
export function ToolPageIcon({size=24,className}:{size?:number;className?:string}){
 const name=useContext(ToolPageIconContext)
 return <Icon name={name} size={size} className={className}/>
}
