import {describe,it,expect} from 'vitest'
import {conversionPreferencesSchema} from '../src/shared/textConversionModels'
import {convertContent,outputSuffix} from '../src/lib/text-conversion/conversion-core'
const prefs=conversionPreferencesSchema.parse({})
describe('简繁转换核心',()=>{
 it('双向转换并保留符号、英文与换行',()=>{
  expect(convertContent('Hello，繁體測試！\r\n下一行','txt',prefs)).toBe('Hello，繁体测试！\r\n下一行')
  expect(convertContent('简体转换','txt',{...prefs,direction:'traditional'})).toContain('簡體')
 })
 it('Markdown 不转换代码/目标 URL、保留原格式',()=>{
  const input='# 繁體標題\n[連結文字](https://host.test/繁體) **繁體** \`繁體\`\n\n\`\`\`js\nconst x="繁體"\n\`\`\`'
  const out=convertContent(input,'md',prefs)
  expect(out).toContain('# 繁体标题')
  expect(out).toContain('[连结文字](https://host.test/繁體)')
  expect(out).toContain('**繁体** \`繁體\`')
  expect(out).toContain('const x="繁體"')
 })
 it('SRT 保持时间戳与标签',()=>{
  const input='1\r\n00:00:01,000 --> 00:00:02,000\r\n<i>繁體字幕</i>\r\n'
  const out=convertContent(input,'srt',prefs)
  expect(out).toContain('00:00:01,000 --> 00:00:02,000')
  expect(out).toContain('<i>繁体字幕</i>')
 })
 it('VTT 和 LRC 保留结构',()=>{
  expect(convertContent('WEBVTT\n\ncue-x\n00:01.000 --> 00:03.000 align:start\n繁體字幕','vtt',prefs)).toContain('cue-x\n00:01.000 --> 00:03.000 align:start\n繁体字幕')
  expect(convertContent('[ar:繁體歌手]\n[00:01.20]繁體歌詞','lrc',prefs)).toBe('[ar:繁體歌手]\n[00:01.20]繁体歌词')
 })
 it('地区常用词仅在启用习惯用语时转换',()=>{
  const basic={...prefs,direction:'traditional' as const,region:'tw' as const}
  expect(convertContent('软件 鼠标 自行车','txt',basic)).toBe('軟件 鼠標 自行車')
  expect(convertContent('软件 鼠标 自行车','txt',{...basic,phraseConversion:true})).toBe('軟體 滑鼠 腳踏車')
 })
 it('Markdown YAML frontmatter 不改写',()=>{
  const input='---\ntitle: 繁體資料\n---\n# 繁體標題'
  expect(convertContent(input,'md',prefs)).toBe('---\ntitle: 繁體資料\n---\n# 繁体标题')
 })
 it('自动后缀依赖方向',()=>{
  expect(outputSuffix(prefs)).toBe('_simplify')
  expect(outputSuffix({...prefs,direction:'traditional'})).toBe('_traditional')
 })
})
