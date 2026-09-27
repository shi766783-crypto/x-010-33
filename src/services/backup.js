// 数据备份与恢复：备份文件的生成、下载、解析与校验
import { uid } from '../utils/id'

// 备份文件标识与版本，用于校验来源及后续格式演进
const BACKUP_APP = 'family-travel-manager'
const BACKUP_VERSION = 1

// ===== 导出 =====

// 生成备份文件名：family-travel-backup-2026-09-27_1430.json
function backupFilename() {
  const now = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}`
  return `family-travel-backup-${date}_${time}.json`
}

// 组装备份内容（含元信息，便于校验与展示）
export function buildBackup(plans) {
  return {
    app: BACKUP_APP,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { plans },
  }
}

// 导出全部出行数据为 JSON 备份文件并触发下载，返回文件名
export function downloadBackup(plans) {
  const filename = backupFilename()
  const blob = new Blob([JSON.stringify(buildBackup(plans), null, 2)], {
    type: 'application/json',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
  return filename
}

// ===== 解析与校验 =====

function toArray(value) {
  return Array.isArray(value) ? value : []
}

function toText(value) {
  return typeof value === 'string' ? value : ''
}

// 归一化单条出行计划：补齐缺失字段，保证恢复后各页面不会因缺字段而崩溃
function normalizePlan(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error(`备份数据损坏：第 ${index + 1} 条出行计划格式无效`)
  }
  if (typeof raw.id !== 'string' && typeof raw.name !== 'string') {
    throw new Error(`备份数据损坏：第 ${index + 1} 条出行计划缺少必要字段`)
  }

  const members = toArray(raw.members)
    .filter((m) => m && typeof m === 'object')
    .map((m) => ({ ...m, id: toText(m.id) || uid(), name: toText(m.name) }))

  const luggage = toArray(raw.luggage)
    .filter((l) => l && typeof l === 'object')
    .map((l) => ({
      ...l,
      memberId: toText(l.memberId),
      items: toArray(l.items)
        .filter((i) => i && typeof i === 'object')
        .map((i) => ({ ...i, id: toText(i.id) || uid(), packed: Boolean(i.packed) })),
    }))

  const todos = toArray(raw.todos)
    .filter((t) => t && typeof t === 'object')
    .map((t) => ({ ...t, id: toText(t.id) || uid(), done: Boolean(t.done) }))

  const records = toArray(raw.records)
    .filter((r) => r && typeof r === 'object')
    .map((r) => ({ ...r, id: toText(r.id) || uid() }))

  return {
    ...raw,
    id: toText(raw.id) || uid(),
    name: toText(raw.name) || '未命名行程',
    destination: toText(raw.destination),
    destinationType: toText(raw.destinationType),
    tripType: toText(raw.tripType),
    startDate: toText(raw.startDate),
    endDate: toText(raw.endDate),
    days: Number(raw.days) || 0,
    memberCount: Number(raw.memberCount) || members.length,
    transport: toText(raw.transport),
    accommodation: toText(raw.accommodation),
    budget: Number(raw.budget) || 0,
    notes: toText(raw.notes),
    photo: toText(raw.photo),
    members,
    luggage,
    todos,
    records,
    summary: raw.summary && typeof raw.summary === 'object' ? raw.summary : null,
    createdAt: toText(raw.createdAt) || new Date().toISOString(),
  }
}

// 解析备份文件文本，校验失败时抛出带中文说明的错误；
// 成功返回 { plans, exportedAt }，调用方需在全部校验通过后再落地数据
export function parseBackup(text) {
  let payload
  try {
    payload = JSON.parse(text)
  } catch {
    throw new Error('文件内容不是有效的 JSON，请选择正确的备份文件')
  }

  // 兼容三种形态：完整备份文件、仅 { plans }、纯计划数组
  const rawPlans = Array.isArray(payload)
    ? payload
    : payload?.data?.plans ?? payload?.plans

  if (!Array.isArray(rawPlans)) {
    throw new Error('备份文件格式不正确：未找到出行数据')
  }
  if (
    payload &&
    typeof payload === 'object' &&
    'app' in payload &&
    payload.app !== BACKUP_APP
  ) {
    throw new Error('该文件不是出行管家导出的备份文件')
  }

  const plans = rawPlans.map(normalizePlan)
  return {
    plans,
    exportedAt: typeof payload?.exportedAt === 'string' ? payload.exportedAt : '',
  }
}
