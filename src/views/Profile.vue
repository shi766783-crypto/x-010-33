<script setup>
import { computed, onBeforeUnmount, ref } from 'vue'
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
const pendingRestore = ref(null) // 待确认的备份 { plans, meta }
const feedback = ref(null) // { type: 'success' | 'error', text }
let feedbackTimer = null

function showFeedback(type, text) {
  feedback.value = { type, text }
  clearTimeout(feedbackTimer)
  feedbackTimer = setTimeout(() => (feedback.value = null), 4000)
}

onBeforeUnmount(() => clearTimeout(feedbackTimer))

function onExport() {
  downloadBackup(store.plans)
  showFeedback('success', `已导出 ${store.plans.length} 个出行计划，请妥善保存备份文件`)
}

function onPickFile() {
  fileInput.value?.click()
}

// 选择文件后先解析校验：失败则原数据不动；成功则弹窗等待二次确认
async function onFileChange(event) {
  const file = event.target.files?.[0]
  event.target.value = '' // 重置，允许再次选择同一文件
  if (!file) return
  try {
    const text = await file.text()
    pendingRestore.value = parseBackup(text)
  } catch (error) {
    showFeedback('error', `恢复失败：${error.message}。当前数据未受影响`)
  }
}

function onConfirmRestore() {
  if (!pendingRestore.value) return
  store.replaceAll(pendingRestore.value.plans)
  showFeedback('success', `恢复成功，已还原 ${pendingRestore.value.meta.count} 个出行计划`)
  pendingRestore.value = null
}

function onCancelRestore() {
  pendingRestore.value = null
}

// 备份时间展示：ISO -> 本地可读时间
function formatBackupTime(iso) {
  if (!iso) return '未知'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '未知' : d.toLocaleString('zh-CN')
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

    <!-- 数据备份与恢复 -->
    <div class="card mt-16">
      <h3 class="card-title">数据备份与恢复</h3>
      <p class="text-secondary backup-tip">
        所有数据仅保存在当前浏览器中，清除浏览器数据或更换设备后会丢失，建议定期导出备份。
      </p>
      <p v-if="feedback" class="backup-message" :class="`is-${feedback.type}`">{{ feedback.text }}</p>
      <div class="backup-actions">
        <button class="btn btn-primary" @click="onExport">导出备份文件</button>
        <button class="btn btn-ghost" @click="onPickFile">从备份文件恢复</button>
        <input
          ref="fileInput"
          type="file"
          accept=".json,application/json"
          class="backup-file-input"
          @change="onFileChange"
        />
      </div>
    </div>

    <!-- 恢复前二次确认：提示将覆盖当前数据 -->
    <Modal :show="!!pendingRestore" title="确认恢复备份" @close="onCancelRestore">
      <template v-if="pendingRestore">
        <p>备份导出时间：{{ formatBackupTime(pendingRestore.meta.exportedAt) }}</p>
        <p>备份内容：{{ pendingRestore.meta.count }} 个出行计划</p>
        <p class="restore-warning">
          恢复后，当前浏览器中的全部出行数据将被备份内容覆盖，且无法撤销。建议先导出当前数据备份。
        </p>
      </template>
      <template #footer>
        <button class="btn btn-ghost" @click="onCancelRestore">取消</button>
        <button class="btn btn-danger" @click="onConfirmRestore">确认覆盖并恢复</button>
      </template>
    </Modal>

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
  font-size: 13px;
  margin-bottom: 12px;
}

.backup-actions {
  display: flex;
  gap: 10px;
}

.backup-file-input {
  display: none;
}

.backup-message {
  padding: 8px 12px;
  border-radius: var(--radius-sm);
  font-size: 13px;
  margin-bottom: 12px;
}

.backup-message.is-success {
  background: var(--success-light);
  color: var(--success);
}

.backup-message.is-error {
  background: var(--danger-light);
  color: var(--danger);
}

.restore-warning {
  margin-top: 12px;
  padding: 10px 12px;
  border-radius: var(--radius-sm);
  background: var(--danger-light);
  color: var(--danger);
  font-size: 13px;
}
</style>
