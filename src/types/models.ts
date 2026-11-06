export type ToolType = 'link' | 'internal' | 'local_html' | 'generated'
export interface Category { id: string; name: string; icon: string; sortOrder: number; visible: boolean; isSystem: boolean }
export interface Tool { id: string; categoryId: string; name: string; icon: string; type: ToolType; target: string; sortOrder: number; visible: boolean; isBuiltin: boolean; trayPinOrder?: number|null }
import type {NotificationPosition,TransferPreferences} from '../shared/fileTransferModels'
export interface Settings { theme: 'dark' | 'light'; motion: 'normal' | 'reduced' | 'off'; showDefaultTag: boolean; allowHttp: boolean; sidebarWidth: number;notificationPosition:NotificationPosition;fileTransferPrefs:TransferPreferences;quickLaunchTrigger:'single'|'double';quickLaunchStopOnExit:boolean }
export interface DataInfo { root: string; defaultRoot: string; oldCopies: {id: string; path: string; date: string; removed: boolean}[] }
export interface CryptoResult { publicKey?: string; privateKey?: string; secret?: string; info: string }
export type ToolPage = 'home' | 'manager' | 'settings' | 'about' | 'tool' | 'quick-launch'
