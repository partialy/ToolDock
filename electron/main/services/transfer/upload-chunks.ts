export type ByteRange = [number, number]

/** 检测半开区间 [start, end) 是否与有序区间列表存在重叠。 */
export function hasRangeOverlap(ranges: readonly ByteRange[], start: number, end: number): boolean {
 for (const [left, right] of ranges) {
  if (end <= left) continue
  if (start >= right) continue
  return true
 }
 return false
}

/** 插入半开区间 [start, end) 并合并相邻区间，保持升序不重叠。 */
export function mergeRange(ranges: ByteRange[], start: number, end: number): ByteRange[] {
 const next: ByteRange[] = []
 let mergedStart = start
 let mergedEnd = end
 let inserted = false
 for (const [left, right] of ranges) {
  if (right < mergedStart) {
   next.push([left, right])
   continue
  }
  if (left > mergedEnd) {
   if (!inserted) {
    next.push([mergedStart, mergedEnd])
    inserted = true
   }
   next.push([left, right])
   continue
  }
  mergedStart = Math.min(mergedStart, left)
  mergedEnd = Math.max(mergedEnd, right)
 }
 if (!inserted) next.push([mergedStart, mergedEnd])
 return next
}

/** 从区间列表中精确移除一条在途区间。 */
export function removeExactRange(ranges: ByteRange[], start: number, end: number): void {
 const index = ranges.findIndex(([left, right]) => left === start && right === end)
 if (index >= 0) ranges.splice(index, 1)
}

/** 计算区间列表覆盖的总字节数。 */
export function sumRangeBytes(ranges: readonly ByteRange[]): number {
 let total = 0
 for (const [left, right] of ranges) total += right - left
 return total
}

/** 返回从字节 0 起连续已确认写入的前缀长度，用于兼容顺序断点语义。 */
export function contiguousOffset(ranges: readonly ByteRange[]): number {
 return ranges.length > 0 && ranges[0][0] === 0 ? ranges[0][1] : 0
}

/** 根据总大小与已完成区间计算尚需传输的缺失区间列表。 */
export function missingRanges(ranges: readonly ByteRange[], totalSize: number): ByteRange[] {
 const missing: ByteRange[] = []
 let cursor = 0
 for (const [left, right] of ranges) {
  if (left > cursor) missing.push([cursor, Math.min(left, totalSize)])
  cursor = Math.max(cursor, right)
  if (cursor >= totalSize) break
 }
 if (cursor < totalSize) missing.push([cursor, totalSize])
 return missing
}
