import fs from 'fs'
import path from 'path'
import { ensureProjectRuntime } from './bootstrap-runtime.mjs'

const projectDir = process.cwd()
const runtimePath = path.join(projectDir, '.opencode', 'runtime', 'agents-runtime.json')
const graphPath = path.join(projectDir, '.opencode', 'worker', 'task-graph.json')
const processPath = path.join(projectDir, '.opencode', 'worker', 'process.md')

// ANSI 颜色码
const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m',
  white: '\x1b[37m',
  bgBlue: '\x1b[44m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgRed: '\x1b[41m',
  bgGray: '\x1b[100m'
}

// 检测终端是否支持颜色
const supportsColor = () => {
  if (process.env.FORCE_COLOR !== undefined) return process.env.FORCE_COLOR !== '0'
  if (process.env.NO_COLOR) return false
  const stream = process.stdout
  return stream && stream.isTTY && stream.getColorDepth() > 1
}

const hasColor = supportsColor()

// 带颜色的字符串（仅在终端支持时生效）
function color(text, colorCode) {
  if (!hasColor) return text
  return `${colorCode}${text}${ANSI.reset}`
}

function bold(text) {
  return color(text, ANSI.bold)
}

function dim(text) {
  return color(text, ANSI.dim)
}

// 状态映射
const STATUS_CONFIG = {
  completed: { emoji: '✅', label: '已完成', color: ANSI.green, bg: ANSI.bgGreen },
  running: { emoji: '🟡', label: '运行中', color: ANSI.yellow, bg: ANSI.bgYellow },
  ready: { emoji: '🟢', label: '就绪', color: ANSI.green, bg: ANSI.bgGreen },
  pending: { emoji: '⏳', label: '等待中', color: ANSI.gray, bg: ANSI.bgGray },
  failed: { emoji: '❌', label: '失败', color: ANSI.red, bg: ANSI.bgRed },
  cancelled: { emoji: '🚫', label: '已取消', color: ANSI.red, bg: ANSI.bgRed },
  superseded: { emoji: '⏭️', label: '已替代', color: ANSI.gray, bg: ANSI.bgGray }
}

function getStatusConfig(status) {
  return STATUS_CONFIG[status] || { emoji: '❓', label: status || '未知', color: ANSI.gray, bg: ANSI.bgGray }
}

function statusBadge(status) {
  const config = getStatusConfig(status)
  return color(`${config.emoji} ${config.label}`, config.color)
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function readProcessState() {
  if (!fs.existsSync(processPath)) return null

  const content = fs.readFileSync(processPath, 'utf8')
  const readField = (name) => {
    const match = content.match(new RegExp(`^${name}:\\s*["']?([^"'\\n]+)["']?$`, 'm'))
    return match ? match[1].trim() : 'unknown'
  }

  const readArray = (name) => {
    const match = content.match(new RegExp(`^${name}:\\s*(\\[[^\\n]*\\])$`, 'm'))
    if (!match) return []

    try {
      return JSON.parse(match[1])
    } catch {
      return []
    }
  }

  return {
    status: readField('status'),
    phase: readField('phase'),
    updatedAt: readField('updated_at'),
    activeTasks: readArray('active_tasks'),
    completedTasks: readArray('completed_tasks'),
    pendingTasks: readArray('pending_tasks'),
    lastMessage: readField('last_message'),
    request: readField('request')
  }
}

// 计算运行时长
function calcDuration(startDate) {
  if (!startDate) return ''

  const start = new Date(startDate)
  if (Number.isNaN(start.getTime())) return ''

  const now = new Date()
  const diffMs = now - start
  const totalMinutes = Math.floor(diffMs / 60000)
  const totalSeconds = Math.floor(diffMs / 1000)

  if (totalSeconds < 60) return `${totalSeconds} 秒`
  if (totalMinutes < 60) return `${totalMinutes} 分钟`

  const hours = Math.floor(totalMinutes / 60)
  const minutes = totalMinutes % 60

  if (hours < 24) return `${hours} 小时 ${minutes} 分钟`

  const days = Math.floor(hours / 24)
  const remainingHours = hours % 24
  return `${days} 天 ${remainingHours} 小时 ${minutes} 分钟`
}

// 格式化简短时间
function shortTime(value) {
  if (!value || value === 'unknown') return '-'

  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value

  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const hh = String(date.getHours()).padStart(2, '0')
  const mi = String(date.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

// 构建 ASCII 边框
function buildBox(lines, width = 50) {
  const topLine = `┌${'─'.repeat(width)}┐`
  const bottomLine = `└${'─'.repeat(width)}┘`
  const separator = `├${'─'.repeat(width)}┤`

  const result = [topLine]

  for (const line of lines) {
    if (line === '---SEPARATOR---') {
      result.push(separator)
      continue
    }

    // 计算实际可见字符长度（去除 ANSI 转义码）
    const visibleLength = line.replace(/\x1b\[[0-9;]*m/g, '').length
    const padding = Math.max(0, width - visibleLength)
    const paddedLine = `│${line}${' '.repeat(padding)}│`
    result.push(paddedLine)
  }

  result.push(bottomLine)
  return result.join('\n')
}

// 构建任务依赖图 ASCII 可视化
function buildTaskGraphAscii(tasks) {
  if (!tasks || tasks.length === 0) return ['  暂无任务']

  // 按依赖关系排序：先显示没有依赖的任务
  const sorted = [...tasks].sort((a, b) => {
    const aBlocked = (a.blockedBy || []).length
    const bBlocked = (b.blockedBy || []).length
    return aBlocked - bBlocked
  })

  const lines = []
  const taskIdSet = new Set(tasks.map((t) => t.id || t.taskId))

  // 找出根任务（没有 blockedBy 的任务）
  const rootTasks = sorted.filter((t) => !t.blockedBy || t.blockedBy.length === 0)
  const leafTasks = sorted.filter((t) => (t.blockedBy || []).length > 0)

  function renderTaskLine(task, prefix = '', showArrow = false) {
    const id = task.id || task.taskId || '-'
    const config = getStatusConfig(task.status)
    const statusText = color(`${config.emoji} ${config.label}`, config.color)
    const owner = (task.owner || '-').padEnd(14)
    const arrow = showArrow ? '↓ ' : ''

    const taskLine = `${prefix}${arrow}${bold(id.padEnd(10))} ${owner} ${statusText}`
    lines.push(taskLine)

    // 显示运行时长
    if (task.status === 'running' && task.startedAt) {
      const duration = calcDuration(task.startedAt)
      lines.push(`${prefix}   ${dim('(已运行 ' + duration + ')')}`)
    }
  }

  // 渲染根任务
  for (const root of rootTasks) {
    renderTaskLine(root)
  }

  // 渲染有依赖的任务，显示依赖箭头
  if (leafTasks.length > 0) {
    // 收集所有上游任务 ID
    const upstreamIds = new Set(rootTasks.map((t) => t.id || t.taskId))

    for (const leaf of leafTasks) {
      const leafId = leaf.id || leaf.taskId
      const blockedBy = (leaf.blockedBy || []).filter((id) => taskIdSet.has(id))

      if (blockedBy.length === 0) continue

      // 如果只有一个上游任务，显示简单箭头
      if (blockedBy.length === 1) {
        lines.push(dim('     ↓'))
        renderTaskLine(leaf, '', true)
      } else {
        // 多个上游任务，显示汇聚效果
        lines.push(dim('     ' + '┃'.repeat(blockedBy.length)))
        lines.push(dim('     ' + '┗'.padEnd(blockedBy.length, '━') + '▶'))
        const depsText = dim(`(依赖: ${blockedBy.join(', ')})`)
        const config = getStatusConfig(leaf.status)
        const statusText = color(`${config.emoji} ${config.label}`, config.color)
        const owner = (leaf.owner || '-').padEnd(14)
        lines.push(`       ${bold(leafId.padEnd(10))} ${owner} ${statusText} ${depsText}`)

        // 显示运行时长
        if (leaf.status === 'running' && leaf.startedAt) {
          const duration = calcDuration(leaf.startedAt)
          lines.push(`       ${dim('(已运行 ' + duration + ')')}`)
        }
      }
    }
  }

  if (lines.length === 0) return ['  暂无任务']
  return lines
}

// 构建恢复建议
function buildRecoveryAdvice(runtime, graph, processState, dispatches) {
  const ready = dispatches.filter((item) => item.status === 'ready')
  const running = dispatches.filter((item) => item.status === 'running')
  const failed = dispatches.filter((item) => item.status === 'failed')
  const completed = dispatches.filter((item) => item.status === 'completed')
  const total = dispatches.length

  // 有 ready 任务
  if (ready.length > 0) {
    return color(`🚀 检测到 ${ready.length} 个就绪任务，运行 npm run opencode:pm 恢复编排`, ANSI.green)
  }

  // 全部完成
  if (total > 0 && completed.length === total) {
    return color('🎉 所有任务已完成，可开始新需求', ANSI.green)
  }

  // 有 failed 任务
  if (failed.length > 0) {
    const failedIds = failed.map((t) => t.taskId || t.id).join(', ')
    return color(`⚠️ ${failed.length} 个任务失败 (${failedIds})，请检查后重试或修改需求`, ANSI.red)
  }

  // 等待中（有 running 任务）
  if (running.length > 0) {
    const runningIds = running.map((t) => t.taskId || t.id).join(', ')
    return color(`⏳ 后台任务仍在运行 (${runningIds})，请耐心等待或运行 npm run opencode:watch 启用自动恢复`, ANSI.yellow)
  }

  // 空状态
  if (graph?.status === 'completed' || processState?.status === 'completed') {
    return color('✅ 任务链路已完成，可查看交付产物或开启新需求', ANSI.green)
  }

  return dim('当前没有可用任务，建议检查任务图、runtime registry 和 process.md 是否已初始化')
}

function collectDispatches(runtime, graph) {
  if (runtime?.dispatches?.length) return runtime.dispatches
  if (graph?.tasks?.length) return graph.tasks
  return []
}

function buildWarnings(runtime, graph, processState, dispatches) {
  const warnings = []

  if (!runtime) warnings.push('runtime registry 不存在，主调度与子任务运行实例无法完整追踪')
  if (!graph) warnings.push('task_graph 不存在，当前无法判断任务依赖状态')
  if (!processState) warnings.push('process.md 不存在，当前无法判断主流程快照')

  if (runtime && graph && runtime.graph?.status !== graph.status) {
    warnings.push(`runtime.graph.status=${runtime.graph.status} 与 task_graph.status=${graph.status} 不一致`)
  }

  if (runtime && processState && runtime.manager?.status === 'idle' && ['in_progress', 'waiting_subagents', 'running'].includes(processState.status)) {
    warnings.push(`主调度 registry 显示 idle，但 process.md 显示 ${processState.status}`)
  }

  const runningTasks = dispatches.filter((item) => item.status === 'running')
  if (processState && runningTasks.length !== processState.activeTasks.length) {
    warnings.push(`running 任务数量 (${runningTasks.length}) 与 process.md active_tasks (${processState.activeTasks.length}) 不一致`)
  }

  return warnings
}

// 主输出函数
function main() {
  ensureProjectRuntime({ quiet: true })

  const runtime = readJSON(runtimePath)
  const graph = readJSON(graphPath)
  const processState = readProcessState()
  const dispatches = collectDispatches(runtime, graph)
  const warnings = buildWarnings(runtime, graph, processState, dispatches)

  if (!runtime && !graph && !processState) {
    process.stdout.write('当前没有可用的 runtime、任务图或流程快照\n')
    process.exit(0)
  }

  // 统计数据
  const counts = {
    total: dispatches.length,
    completed: dispatches.filter((t) => t.status === 'completed').length,
    running: dispatches.filter((t) => t.status === 'running').length,
    ready: dispatches.filter((t) => t.status === 'ready').length,
    failed: dispatches.filter((t) => t.status === 'failed').length,
    pending: dispatches.filter((t) => t.status === 'pending').length,
    cancelled: dispatches.filter((t) => t.status === 'cancelled').length
  }

  const progressPercent = counts.total > 0 ? Math.round((counts.completed / counts.total) * 100) : 0
  const graphStatus = graph?.status || runtime?.graph?.status || 'unknown'
  const graphVersion = graph?.version || runtime?.graph?.version || '-'
  const request = processState?.request || runtime?.request || '-'

  // 构建 ASCII 面板内容
  const boxLines = []

  // 标题行
  boxLines.push(bold('  📊 OpenCode Agents Team 状态报告'))

  boxLines.push('---SEPARATOR---')

  // 基本信息
  boxLines.push(`  ${bold('请求:')} ${request}`)
  const statusBadgeText = statusBadge(graphStatus)
  boxLines.push(`  ${bold('状态:')} ${statusBadgeText} | ${bold('版本:')} ${graphVersion}`)
  boxLines.push(`  ${bold('进度:')} ${counts.completed}/${counts.total} 完成 (${progressPercent}%)`)

  boxLines.push('---SEPARATOR---')

  // 任务依赖图
  boxLines.push(bold('  任务依赖图:'))
  boxLines.push('')

  const graphLines = buildTaskGraphAscii(dispatches)
  for (const line of graphLines) {
    boxLines.push(`  ${line}`)
  }

  boxLines.push('')
  boxLines.push('---SEPARATOR---')

  // 运行中任务
  const runningTasks = dispatches.filter((t) => t.status === 'running')
  if (runningTasks.length > 0) {
    const runningInfo = runningTasks.map((t) => {
      const id = t.taskId || t.id
      const duration = t.startedAt ? calcDuration(t.startedAt) : '未知'
      return `${id} (已运行 ${duration})`
    }).join(', ')
    boxLines.push(`  ${bold('运行中:')} ${runningInfo}`)
  } else {
    boxLines.push(`  ${bold('运行中:')} 无`)
  }

  boxLines.push('---SEPARATOR---')

  // 恢复建议
  const advice = buildRecoveryAdvice(runtime, graph, processState, dispatches)
  boxLines.push(`  ${bold('恢复建议:')} ${advice}`)

  // 构建并输出主面板
  const boxWidth = Math.max(50, ...boxLines.map((l) => l.replace(/\x1b\[[0-9;]*m/g, '').length))
  process.stdout.write('\n')
  process.stdout.write(buildBox(boxLines, boxWidth))
  process.stdout.write('\n')

  // 输出 Runtime 详细信息
  printSection('Runtime 信息')
  printLine('主调度状态', runtime?.manager?.status || 'unknown')
  printLine('恢复次数', runtime?.manager?.resumeCount ?? 0)
  printLine('最后恢复时间', `${shortTime(runtime?.manager?.lastResumeAt)} | ${runtime?.manager?.lastResumeReason || '-'}`)
  printLine('最后退出时间', `${shortTime(runtime?.manager?.lastExitAt)} | ${runtime?.manager?.lastExitReason || '-'}`)
  printLine('恢复策略', runtime?.manager?.sessionStrategy || 'unknown')
  printLine('建议恢复主调度', runtime?.lastSignal?.shouldResumeManager ? color('是', ANSI.green) : color('否', ANSI.gray))
  printLine('最后信号时间', shortTime(runtime?.lastSignal?.timestamp))
  printLine('最后状态更新时间', shortTime(runtime?.updatedAt || processState?.updatedAt))

  // 输出一致性检查
  printSection('一致性检查')
  if (warnings.length === 0) {
    process.stdout.write(`  ${color('✅ 无明显漂移', ANSI.green)}\n`)
  } else {
    warnings.forEach((warning) => {
      process.stdout.write(`  ${color('⚠️', ANSI.yellow)} ${warning}\n`)
    })
  }
}

function printSection(title) {
  process.stdout.write(`\n${bold(title)}\n`)
}

function printLine(label, value) {
  process.stdout.write(`  ${bold(label)}: ${value}\n`)
}

main()
