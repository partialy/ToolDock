import icon64 from '@/assets/tooldock-icon_64x64.webp'
import icon128 from '@/assets/tooldock-icon_128x128.webp'
import icon256 from '@/assets/tooldock-icon_256x256.webp'

export function AppLogo({size=24}:{size?:number}){
 return <img src={icon64} srcSet={`${icon64} 64w, ${icon128} 128w, ${icon256} 256w`} sizes={`${size}px`} width={size} height={size} alt="" aria-hidden="true" draggable={false} className="shrink-0 rounded-lg object-contain"/>
}
