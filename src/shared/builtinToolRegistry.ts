export const BUILTIN_TOOLS = [
  { id:'builtin-key-generator', target:'key-generator', name:'密钥生成器', icon:'key-round', defaultCategoryId:'developer' },
  { id:'builtin-json-tool', target:'json-tool', name:'JSON 处理', icon:'braces', defaultCategoryId:'developer' }
] as const

export const builtinById = (id:string) => BUILTIN_TOOLS.find(t=>t.id===id)
export const builtinByTarget = (target:string) => BUILTIN_TOOLS.find(t=>t.target===target)
