#!/usr/bin/env node
/**
 * Verify the Windows EXE embeds the exact ToolDock ICO resource.
 *
 * Usage:
 *   npm run verify:win-icon -- release/win-unpacked/ToolDock.exe
 *
 * A rendered icon returned by Windows Shell may be stale because of Explorer
 * icon cache or existing taskbar pins. Read executable resources instead.
 */
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const { Data, NtExecutable, NtExecutableResource } = require('resedit')

const root = path.resolve(__dirname, '..')
const iconPath = path.join(root, 'src', 'assets', 'tooldock-icon.ico')
const executable = path.resolve(root, process.argv[2] || 'release/win-unpacked/ToolDock.exe')
const digest = value => crypto.createHash('sha256').update(Buffer.from(value)).digest('hex')

function verifyIcon(file = executable) {
 if (!fs.existsSync(file)) throw new Error('找不到待验收的 Windows EXE：' + file)
 const source = Data.IconFile.from(fs.readFileSync(iconPath))
 const sourceIcons = source.icons.map(icon => ({
  width: icon.width || 256,
  height: icon.height || 256,
  hash: digest(icon.data.bin)
 }))
 for (const size of [16, 24, 32, 48, 64, 128, 256]) {
  if (!sourceIcons.some(icon => icon.width === size && icon.height === size)) {
   throw new Error('品牌 ICO 缺少 ' + size + 'px 图层')
  }
 }
 const executableResource = NtExecutableResource.from(NtExecutable.from(fs.readFileSync(file)))
 const groups = executableResource.entries.filter(entry => entry.type === 14)
 if (!groups.some(entry => entry.id === 1)) throw new Error('Windows EXE 缺少默认主图标组')
 const actual = executableResource.entries.filter(entry => entry.type === 3).map(entry => digest(entry.bin))
 for (const icon of sourceIcons) {
  if (!actual.includes(icon.hash)) {
   throw new Error('Windows EXE 缺少与品牌 ICO 匹配的 ' + icon.width + 'px 图标')
  }
 }
 console.log('ToolDock EXE 图标验证通过：所有 ' + sourceIcons.length + ' 个图层与 src/assets/tooldock-icon.ico 二进制一致')
 console.log('EXE：' + file)
 return true
}

try {
 verifyIcon()
} catch (error) {
 console.error(error instanceof Error ? error.message : String(error))
 process.exitCode = 1
}
