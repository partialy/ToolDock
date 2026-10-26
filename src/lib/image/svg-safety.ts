/** Fail closed: only static inline vector primitives; SVG is never inserted into application DOM. */
export function sanitizeSvg(svg:string):string{
 if(svg.length>5*1024*1024)throw Error('SVG 文本过大')
 if(/<!DOCTYPE|<!ENTITY/i.test(svg))throw Error('SVG 不允许 DOCTYPE 或 XML 实体声明')
 const doc=new DOMParser().parseFromString(svg,'image/svg+xml')
 if(doc.getElementsByTagName('parsererror').length)throw Error('SVG XML 结构无效')
 const root=doc.documentElement
 if(root.localName!=='svg'||root.namespaceURI!=='http://www.w3.org/2000/svg')throw Error('无效 SVG 根元素')
 const allowed=new Set(['svg','g','path','rect','circle','ellipse','line','polygon','polyline','defs','linearGradient','radialGradient','stop','clipPath','mask','text','tspan','title','desc'])
 const attrs=new Set(['xmlns','viewBox','width','height','x','y','x1','x2','y1','y2','cx','cy','r','rx','ry','d','points','fill','fill-opacity','stroke','stroke-opacity','stroke-width','stroke-linecap','stroke-linejoin','stroke-dasharray','opacity','transform','gradientUnits','gradientTransform','offset','stop-color','stop-opacity','id','clip-path','mask','font-size','font-family','font-weight','text-anchor','preserveAspectRatio'])
 const nodes=[root,...Array.from(root.getElementsByTagName('*'))]
 if(nodes.length>10000)throw Error('SVG 节点过多')
 for(const el of nodes){
  if(!allowed.has(el.localName))throw Error('SVG 包含不允许的元素：'+el.localName)
  for(const attr of Array.from(el.attributes)){
   if(attr.name==='xmlns'&&attr.value==='http://www.w3.org/2000/svg')continue
   if(!attrs.has(attr.name)||Boolean(attr.namespaceURI))throw Error('SVG 包含不允许的属性：'+attr.name)
   if(/url\s*\(/i.test(attr.value)&&!/^url\(\s*#[\w-]+\s*\)$/.test(attr.value))throw Error('SVG 不允许外部资源引用')
   if(/(?:javascript:|data:|https?:|file:|@import|expression\s*\()/i.test(attr.value))throw Error('SVG 不允许脚本或外链')
  }
 }
 return new XMLSerializer().serializeToString(root)
}
