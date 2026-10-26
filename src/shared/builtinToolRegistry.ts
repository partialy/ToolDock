export const BUILTIN_TOOLS = [
  { id:'builtin-key-generator', target:'key-generator', name:'密钥生成器', icon:'key-round', defaultCategoryId:'developer' },
  { id:'builtin-json-tool', target:'json-tool', name:'JSON 处理', icon:'braces', defaultCategoryId:'developer' },
  { id:'builtin-image-processor', target:'image-processor', name:'图片处理', icon:'images', defaultCategoryId:'images' },
  { id:'builtin-logo-icon-generator', target:'logo-icon-generator', name:'Logo / ICO 生成', icon:'app-window', defaultCategoryId:'images' },
  { id:'builtin-image-encoding', target:'image-encoding', name:'图片编码', icon:'file-code-2', defaultCategoryId:'images' },
  { id:'builtin-time-converter', target:'time-converter', name:'时间转换', icon:'clock-3', defaultCategoryId:'developer' },
  { id:'builtin-uuid-generator', target:'uuid-generator', name:'UUID 生成', icon:'fingerprint', defaultCategoryId:'developer' }
] as const

export const builtinById = (id:string) => BUILTIN_TOOLS.find(t=>t.id===id)
export const builtinByTarget = (target:string) => BUILTIN_TOOLS.find(t=>t.target===target)
