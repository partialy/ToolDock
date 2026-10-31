import {z} from 'zod'

export const portSchema=z.number().int().min(1).max(65535)
export const killSchema=z.strictObject({
 port:portSchema,
 pid:z.number().int().min(1).max(4294967295),
 startedAt:z.string().regex(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/).max(40),
 name:z.string().min(1).max(256)
})
export const junctionSchema=z.strictObject({
 target:z.string().trim().min(3).max(1024),
 parent:z.string().trim().min(3).max(1024),
 name:z.string().trim().min(1).max(120)
})
export type KillInput=z.infer<typeof killSchema>
export type JunctionInput=z.infer<typeof junctionSchema>
export type PortEntry={
 protocol:'TCP'|'UDP';family:'IPv4'|'IPv6';localAddress:string;localPort:number;
 remoteAddress:string|null;remotePort:number|null;state:string;pid:number;
 name:string|null;startedAt:string|null;executablePath:string|null;
 canTerminate:boolean;blockReason:string|null
}
export type PortQueryResult={port:number;rows:PortEntry[];durationMs:number;technical?:string}
export type TerminateResult={pid:number;name:string;durationMs:number}
export type JunctionPreview={valid:boolean;target:string;parent:string;name:string;linkPath:string;reason:string|null}
export type JunctionResult={target:string;linkPath:string;durationMs:number}
