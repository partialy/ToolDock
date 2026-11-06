import {parentPort,workerData} from 'node:worker_threads'
import fs from 'node:fs/promises'
import path from 'node:path'
import {decodeInput,encodeOutput} from './encoding'
import {convertContent} from '../../../../src/lib/text-conversion/conversion-core'
import {conversionPreferencesSchema,conversionFormatSchema,conversionEncodingSchema} from '../../../../src/shared/textConversionModels'

interface Input {inputPath:string;outputPath:string;settings:unknown;encoding:unknown}
async function run(){
 const data=workerData as Input
 const settings=conversionPreferencesSchema.parse(data.settings),encoding=conversionEncodingSchema.parse(data.encoding)
 const format=conversionFormatSchema.parse(path.extname(data.inputPath).slice(1).toLowerCase())
 const bytes=await fs.readFile(data.inputPath)
 if(bytes.length>50*1024*1024)throw Error('文件超过 50 MiB 限制')
 parentPort?.postMessage({percent:25})
 const decoded=decodeInput(bytes,encoding)
 parentPort?.postMessage({percent:50})
 const result=convertContent(decoded.text,format,settings)
 parentPort?.postMessage({percent:75})
 const output=encodeOutput(result,decoded,settings.outputEncoding)
 const handle=await fs.open(data.outputPath,'wx',0o600)
 try{await handle.writeFile(output);await handle.sync()}finally{await handle.close()}
 parentPort?.postMessage({percent:100,done:true,encoding:decoded.encoding,bytes:output.byteLength})
}
void run().catch(error=>{parentPort?.postMessage({error:error instanceof Error?error.message:'文件转换失败'})})
