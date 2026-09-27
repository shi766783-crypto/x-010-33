<script setup>
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import { useTravelStore } from '../stores/travel'
import { formatMoney, formatDate } from '../utils/format'
import { planTotalSpend, planPackingRate } from '../services/selectors'
import { downloadBackup, parseBackup } from '../services/backup'
import StarRating from '../components/common/StarRating.vue'
import Modal from '../components/common/Modal.vue'

const store = useTravelStore()
const router = useRouter()

const stats = computed(() => store.dashboardStats)
const unlocked = computed(() => store.achievements.filter((a) => a.unlocked))
const summarized = computed(() => store.plans.filter((p) => p.summary))

// ===== 数据备份与恢复 =====
const fileInput = ref(null)
const pendingRestore = ref(null) // { plans, exportedAt, fileName }
const notice = ref(null) // { type: 'success' | 'error', text }

function showNotice(type, text) {
  notice.value = { type, text }
}

function onExport() {
  const filename = downloadBackup(store.plans)
  showNotice('success', `备份文件「${filename}」已开始下载，请妥善保存`)
}

async function onFileChange(event) {
  const file = event.target.files[0]
  event.target.value = '' // 允许再次选择同一文件
  if (!file) return
  try {
    const text = await file.text()
    const { plans, exportedAt } = parseBackup(text)
    // 校验全部通过后才进入确认流程，此时不改动任何数据
    pendingRestore.value = { plans, exportedAt, fileName: file.name }
  } catch (error) {
    showNotice('error', `恢复失败：${error.message}。当前数据未受影响`)
  }
}

function formatBackupTime(iso) {
  if (!iso) return '未知'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '未知' : d.toLocaleString('zh-CN')
}

function confirmRestore() {
  const target = pendingRestore.value
  if (!target) return
  const ok = store.replacePlans(target.plans)
  pendingRestore.value = null
  if (ok) {
    showNotice('success', `恢复成功，已载入 ${target.plans.length} 个出行计划`)
  } else {
    showNotice('error', '恢复失败：浏览器存储写入异常，当前数据保持不变')
  }
}
</script>

<template>
  <div>
    <!-- 概览 -->
    <div class="grid-3">
      <div class="card stat">
        <span class="stat-label">累计出行次数</span>
        <strong>{{ stats.totalTrips }}</strong>
      </div>
      <div class="card stat">
        <span class="stat-label">总花费</span>
        <strong>{{ formatMoney(stats.totalSpend) }}</strong>
      </div>
      <div class="card stat">
        <span class="stat-label">已解锁徽章</span>
        <strong>{{ unlocked.length }} / {{ store.totalAchievements }}</strong>
      </div>
    </div>

    <!-- 我的出行计划 -->
    <div class="card mt-16">
      <h3 class="card-title">我的出行计划</h3>
      <table v-if="store.plans.length" class="table">
        <thead>
          <tr><th>名称</th><th>目的地</th><th>日期</th><th>花费</th><th>打包</th></tr>
        </thead>
        <tbody>
          <tr v-for="p in store.plans" :key="p.id" class="link-row" @click="router.push(`/plans/${p.id}`)">
            <td>{{ p.name }}</td>
            <td>{{ p.destination }}</td>
            <td>{{ formatDate(p.startDate) }} - {{ formatDate(p.endDate) }}</td>
            <td>{{ formatMoney(planTotalSpend(p)) }}</td>
            <td>{{ planPackingRate(p) }}%</td>
          </tr>
        </tbody>
      </table>
      <p v-else class="empty">暂无出行计划</p>
    </div>

    <!-- 出行总结 -->
    <div class="card mt-16">
      <h3 class="card-title">出行总结</h3>
      <div v-if="summarized.length" class="summary-list">
        <div v-for="p in summarized" :key="p.id" class="summary-item">
          <div>
            <strong>{{ p.name }}</strong>
            <span class="text-muted">{{ p.destination }}</span>
          </div>
          <StarRating :model-value="p.summary.rating" readonly size="16px" />
        </div>
      </div>
      <p v-else class="empty">还没有出行总结，去出行结束后撰写吧</p>
    </div>

    <!-- 成就徽章 -->
    <div class="card mt-16">
      <h3 class="card-title">我的成就徽章</h3>
      <div v-if="unlocked.length" class="badge-list">
        <div v-for="a in unlocked" :key="a.id" class="badge">
          <div class="badge-icon" :style="{ background: a.color }">{{ a.glyph }}</div>
          <div class="badge-name">{{ a.name }}</div>
        </div>
      </div>
      <p v-else class="empty">还没有解锁徽章</p>
    </div>

    <!-- 数据备份与恢复 -->
    <div class="card mt-16">
      <h3 class="card-title">数据备份与恢复</h3>
      <p class="text-secondary backup-tip">
        所有数据仅保存在当前浏览器中，清除浏览器数据或更换设备会导致数据丢失，建议定期导出备份文件妥善保存。
      </p>
      <div class="backup-actions">
        <button class="btn btn-primary" @click="onExport">导出备份文件</button>
        <button class="btn btn-ghost" @click="fileInput.click()">从备份文件恢复</button>
        <input
          ref="fileInput"
          type="file"
          accept="application/json,.json"
          hidden
          @change="onFileChange"
        />
      </div>
      <p v-if="notice" class="backup-notice" :class="notice.type">{{ notice.text }}</p>
    </div>

    <!-- 恢复确认弹窗：明确提示覆盖风险，二次确认后才执行 -->
    <Modal
      :show="!!pendingRestore"
      title="恢复备份"
      @close="pendingRestore = null"
    >
      <template v-if="pendingRestore">
        <p class="restore-warning">
          恢复操作将用备份文件中的数据<strong>完全覆盖</strong>当前所有出行数据，且无法撤销。
        </p>
        <div class="restore-compare">
          <div class="restore-side">
            <span class="text-muted">当前数据</span>
            <strong>{{ store.plans.length }} 个出行计划</strong>
          </div>
          <div class="restore-side">
            <span class="text-muted">备份文件</span>
            <strong>{{ pendingRestore.plans.length }} 个出行计划</strong>
            <span class="text-muted restore-time">
              导出于 {{ formatBackupTime(pendingRestore.exportedAt) }}
            </span>
          </div>
        </div>
        <p class="text-secondary restore-tip">
          建议先导出当前数据作为备份，再执行恢复。
        </p>
      </template>
      <template #footer>
        <button type="button" class="btn btn-ghost" @click="pendingRestore = null">取消</button>
        <button type="button" class="btn btn-danger" @click="confirmRestore">
          确认覆盖并恢复
        </button>
      </template>
    </Modal>
  </div>
</template>

<style scoped>
.stat {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 13px;
  color: var(--text-secondary);
}

.stat strong {
  font-size: 26px;
  margin-top: 6px;
}

.link-row {
  cursor: pointer;
}

.summary-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.summary-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 12px;
  background: var(--bg);
  border-radius: var(--radius-sm);
}

.summary-item div {
  display: flex;
  flex-direction: column;
}

.summary-item .text-muted {
  font-size: 13px;
}

.backup-tip {
  margin-bottom: 14px;
}

.backup-actions {
  display: flex;
  gap: 10px;
}

.backup-notice {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
}

.backup-notice.success {
  background: var(--success-light);
  color: var(--success);
}

.backup-notice.error {
  background: var(--danger-light);
  color: var(--danger);
}

.restore-warning {
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--danger-light);
  color: var(--danger);
  margin-bottom: 14px;
}

.restore-compare {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}

.restore-side {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px;
  background: var(--bg);
  border-radius: var(--radius-sm);
}

.restore-side strong {
  font-size: 15px;
}

.restore-time {
  font-size: 12px;
}

.restore-tip {
  margin-top: 12px;
  font-size: 13px;
}
</style>
