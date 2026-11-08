import {randomInt} from 'node:crypto'
// 内置词表：常见水果、动物与日用品，全小写、唯一且语义友好，已排除保留词与敏感词
export const DEVICE_WORDS=[
 // 水果
 'apple','banana','cherry','grape','lemon','mango','melon','olive','orange','peach',
 'pear','plum','berry','coconut','apricot','avocado','fig','guava','kiwi','papaya',
 // 动物
 'ant','badger','bear','beaver','bison','camel','cat','cheetah','cobra','crane',
 'deer','dolphin','donkey','eagle','falcon','ferret','fox','frog','gecko','giraffe',
 'goat','goose','hamster','heron','horse','koala','leopard','llama','lizard','lynx',
 'moose','otter','owl','panda','parrot','penguin','pigeon','pony','rabbit','raccoon',
 // 日用品
 'anchor','apron','arrow','bagel','balloon','basket','battery','blanket','bottle','bucket',
 'button','candle','carpet','chair','clock','comb','compass','crayon','fork','hammer',
 'helmet','kettle','keyboard','ladder','lantern','mirror','mug','needle','notebook','pencil',
 'pillow','plate','ribbon','ruler','scissors','spoon','teapot','towel','umbrella','wallet',
]
// 后缀字符集：排除易混淆的 0 O 1 I L，共 31 个字符
const SUFFIX='23456789ABCDEFGHJKMNPQRSTUVWXYZ'
// 生成「单词-4 位大写后缀」设备名；完整名与当前在线设备撞名时最多重试 64 次
export function nextDeviceName(taken:ReadonlySet<string>):string{
 for(let i=0;i<64;i++){
  let name=DEVICE_WORDS[randomInt(DEVICE_WORDS.length)]+'-'
  for(let j=0;j<4;j++)name+=SUFFIX[randomInt(SUFFIX.length)]
  if(!taken.has(name))return name
 }
 throw Error('设备名称生成失败')
}
