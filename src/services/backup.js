// 数据备份与恢复：导出为 JSON 文件、解析并校验备份文件
// 恢复的原子性约定：parseBackup 在内存中完成全部解析与校验，
// 任何一步失败都抛错、不产出部分数据；调用方拿到完整结果后才允许整体替换现有数据。
const APP_ID = 'family-travel-manager'
const BACKUP_VERSION = 1

// 生成备份对象（带应用标识与版本号，便于校验与日后兼容）
export function buildBackup(plans) {
  return {
    app: APP_ID,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { plans },
  }
}

// 导出全部数据并触发浏览器下载
export function downloadBackup(plans) {
  const backup = buildBackup(plans)
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `出行管家备份-${localDate()}.json`
  a.click()
  URL.revokeObjectURL(url)
}

// 解析并校验备份文件，返回 { plans, meta }；校验失败抛出用户可读的 Error
export function parseBackup(text) {
  let backup
  try {
    backup = JSON.parse(text)
  } catch {
    throw new Error('文件不是有效的 JSON，请选择正确的备份文件')
  }
  if (!backup || typeof backup !== 'object' || backup.app !== APP_ID) {
    throw new Error('该文件不是本应用的备份文件')
  }
  if (!Array.isArray(backup.data?.plans)) {
    throw new Error('备份文件结构不完整，缺少出行数据')
  }
  // 逐个校验并归一化；任何一个计划损坏都整体失败，避免恢复出残缺数据
  const plans = backup.data.plans.map((plan, index) => normalizePlan(plan, index))
  return {
    plans,
    meta: {
      exportedAt: backup.exportedAt || '',
      version: backup.version,
      count: plans.length,
    },
  }
}

// 校验单个计划的关键字段，数组字段缺失时归一化为空数组
function normalizePlan(plan, index) {
  if (!plan || typeof plan !== 'object' || Array.isArray(plan) || !plan.id) {
    throw new Error(`备份数据已损坏（第 ${index + 1} 个出行计划无效）`)
  }
  return {
    ...plan,
    name: typeof plan.name === 'string' && plan.name.trim() ? plan.name : '未命名行程',
    members: Array.isArray(plan.members) ? plan.members : [],
    luggage: Array.isArray(plan.luggage) ? plan.luggage : [],
    todos: Array.isArray(plan.todos) ? plan.todos : [],
    records: Array.isArray(plan.records) ? plan.records : [],
    summary: plan.summary ?? null,
  }
}

// 本地日期：YYYY-MM-DD（用于备份文件名）
function localDate() {
  const d = new Date()
  const pad = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}
