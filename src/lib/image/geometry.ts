export type FitMode='contain'|'cover'|'stretch'
export type CropRect={x:number;y:number;width:number;height:number}
export type Rect={sx:number;sy:number;sw:number;sh:number;dx:number;dy:number;dw:number;dh:number}
export function fitRect(sw:number,sh:number,dw:number,dh:number,mode:FitMode):Rect{
 if(![sw,sh,dw,dh].every(n=>Number.isFinite(n)&&n>0))throw Error('图像尺寸无效')
 if(mode==='stretch')return {sx:0,sy:0,sw,sh,dx:0,dy:0,dw,dh}
 const scale=(mode==='contain'?Math.min:Math.max)(dw/sw,dh/sh)
 const w=sw*scale,h=sh*scale
 if(mode==='contain')return {sx:0,sy:0,sw,sh,dx:(dw-w)/2,dy:(dh-h)/2,dw:w,dh:h}
 const cropWidth=dw/scale,cropHeight=dh/scale
 return {sx:(sw-cropWidth)/2,sy:(sh-cropHeight)/2,sw:cropWidth,sh:cropHeight,dx:0,dy:0,dw,dh}
}
export function outputDimensions(width:number,height:number,mode:'width'|'percent'|'fixed',value:number,targetHeight=0){
 if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)throw Error('源图尺寸无效')
 let w:number,h:number
 if(mode==='width'){if(value<1)throw Error('目标宽度不正确');const ratio=Math.min(1,value/width);w=Math.round(width*ratio);h=Math.round(height*ratio)}
 else if(mode==='percent'){if(value<1||value>1000)throw Error('比例应为 1%–1000%');w=Math.round(width*value/100);h=Math.round(height*value/100)}
 else {w=value;h=targetHeight}
 if(![w,h].every(n=>Number.isFinite(n)&&n>0&&n<=8192)||w*h>40000000)throw Error('输出图片超出 8192px/4000 万像素的限制')
 return {width:Math.max(1,w),height:Math.max(1,h)}
}
