import type { Hooks, Plugin } from '@opencode-ai/plugin'
import * as fs from 'fs'
import * as path from 'path'

const GRAPH_PATH = '.opencode/worker/task-graph.json'
const SIGNAL_PATH = '.opencode/work/.signal-ready-tasks.json'
const RUNTIME_PATH = '.opencode/runtime/agents-runtime.json'
const CANCEL_SIGNAL_PATH = '.opencode/work/.cancel-signal.json'
const STATUS_PATH = '.opencode/work/task-status.json'

// 超时阈值（默认 10 分钟）
const TASK_TIMEOUT_MS = parseInt(process.env.TASK_TIMEOUT_MS || '600000', 10)
// 并发度限制（默认 5）
const CONCURRENCY_LIMIT = parseInt(process.env.CONCURRENCY_LIMIT || '5', 10)

function readJSON(dir: string, filePath: string): any {
  const full = path.join(dir, filePath)
  if (!fs.existsSync(full)) return null

  try {
    return JSON.parse(fs.readFileSync(full, 'utf-8'))
  } catch {
    return null
  }
}

function writeJSON(dir: string, filePath: string, data: any) {
  const full = path.join(dir, filePath)
  const parent = path.dirname(full)
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
  fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf-8')
}

function checkHeartbeat(directory: string) {
  const graph = readJSON(directory, GRAPH_PATH)
  if (!graph) return 'unknown'

  const now = Date.now()
  const runningTasks = graph.tasks.filter((task: any) => task.status === 'running')

  if (runningTasks.length === 0) return 'healthy'

  let hasCritical = false
  let hasWarning = false

  for (const task of runningTasks) {
    if (!task.startedAt) continue
    const startedAt = new Date(task.startedAt).getTime()
    const elapsed = now - startedAt
    const ratio = elapsed / TASK_TIMEOUT_MS

    if (ratio >= 1.0) {
      hasCritical = true
    } else if (ratio >= 0.7) {
      hasWarning = true
    }
  }

  if (hasCritical) return 'critical'
  if (hasWarning) return 'warning'
  return 'healthy'
}

function writeSignal(directory: string) {
  const graph = readJSON(directory, GRAPH_PATH)
  if (!graph) return

  const readyTasks = graph.tasks
    .filter((task: any) => task.status === 'ready')
    .map((task: any) => ({ id: task.id, subject: task.subject, owner: task.owner }))
  const runningTasks = graph.tasks
    .filter((task: any) => task.status === 'running')
    .map((task: any) => ({ id: task.id, subject: task.subject, owner: task.owner }))
  const completedTasks = graph.tasks
    .filter((task: any) => task.status === 'completed')
    .map((task: any) => ({ id: task.id, subject: task.subject, owner: task.owner }))
  const cancelledTasks = graph.tasks
    .filter((task: any) => task.status === 'cancelled')
    .map((task: any) => ({ id: task.id, subject: task.subject, reason: task.cancelReason || null }))

  writeJSON(directory, SIGNAL_PATH, {
    timestamp: new Date().toISOString(),
    version: graph.version,
    status: graph.status,
    shouldResumeManager: readyTasks.length > 0 || graph.status === 'completed',
    resumeReason: readyTasks.length > 0
      ? '检测到新的 ready 任务，项目经理可恢复编排'
      : graph.status === 'completed'
        ? '所有任务已结束，项目经理可恢复汇总'
        : '后台任务仍在运行，项目经理可继续等待下次恢复',
    readyTasks,
    runningTasks,
    completedTasks,
    cancelledTasks,
    concurrencyLimit: CONCURRENCY_LIMIT,
    shouldThrottle: runningTasks.length >= CONCURRENCY_LIMIT,
    heartbeatStatus: checkHeartbeat(directory)
  })
}

function writeRuntime(directory: string) {
  const graph = readJSON(directory, GRAPH_PATH)
  if (!graph) return

  const current = readJSON(directory, RUNTIME_PATH) || {
    version: '1.0',
    updatedAt: '',
    request: '',
    manager: {
      role: 'project-manager',
      status: 'idle',
      sessionStrategy: 'continue-last-session',
      resumeCount: 0,
      lastResumeAt: '',
      lastResumeReason: '',
      lastExitAt: '',
      lastExitReason: ''
    },
    graph: {
      version: '',
      status: 'idle',
      counts: {
        total: 0,
        ready: 0,
        running: 0,
        completed: 0,
        failed: 0,
        cancelled: 0,
        superseded: 0
      }
    },
    dispatches: [],
    lastSignal: {
      shouldResumeManager: false,
      resumeReason: '',
      timestamp: ''
    }
  }

  const readyTasks = graph.tasks.filter((task: any) => task.status === 'ready')
  const runningTasks = graph.tasks.filter((task: any) => task.status === 'running')
  const completedTasks = graph.tasks.filter((task: any) => task.status === 'completed')
  const failedTasks = graph.tasks.filter((task: any) => task.status === 'failed')
  const cancelledTasks = graph.tasks.filter((task: any) => task.status === 'cancelled')
  const supersededTasks = graph.tasks.filter((task: any) => task.status === 'superseded')

  current.graph = {
    version: graph.version,
    status: graph.status,
    counts: {
      total: graph.tasks.length,
      ready: readyTasks.length,
      running: runningTasks.length,
      completed: completedTasks.length,
      failed: failedTasks.length,
      cancelled: cancelledTasks.length,
      superseded: supersededTasks.length
    }
  }

  current.dispatches = graph.tasks.map((task: any) => {
    const existing = current.dispatches.find((item: any) => item.taskId === task.id) || {}
    return {
      taskId: task.id,
      owner: task.owner,
      subject: task.subject,
      status: task.status,
      category: task.category || 'unspecified',
      blockedBy: task.blockedBy || [],
      output: task.output || null,
      message: task.message || null,
      createdAt: existing.createdAt || task.createdAt || new Date().toISOString(),
      startedAt: task.startedAt || existing.startedAt || null,
      completedAt: task.completedAt || existing.completedAt || null,
      lastDispatchAt: existing.lastDispatchAt || null,
      dispatchCount: existing.dispatchCount || 0,
      notes: existing.notes || ''
    }
  })

  current.lastSignal = {
    shouldResumeManager: readyTasks.length > 0 || graph.status === 'completed',
    resumeReason: readyTasks.length > 0
      ? '检测到新的 ready 任务，项目经理可恢复编排'
      : graph.status === 'completed'
        ? '所有任务已结束，项目经理可恢复汇总'
        : '后台任务仍在运行，项目经理可继续等待下次恢复',
    timestamp: new Date().toISOString()
  }

  // 心跳状态
  current.heartbeatStatus = checkHeartbeat(directory)
  // 并发度信息
  current.concurrencyLimit = CONCURRENCY_LIMIT
  current.shouldThrottle = runningTasks.length >= CONCURRENCY_LIMIT

  current.updatedAt = new Date().toISOString()
  writeJSON(directory, RUNTIME_PATH, current)
}

function writeCancelSignal(directory: string, taskId: string, reason: string) {
  const now = new Date().toISOString()
  writeJSON(directory, CANCEL_SIGNAL_PATH, {
    taskId,
    reason: reason || '手动取消',
    timestamp: now,
    action: 'cancel'
  })

  const statusData = readJSON(directory, STATUS_PATH) || {}
  statusData[taskId] = { action: 'cancel', reason: reason || '手动取消', timestamp: now }
  writeJSON(directory, STATUS_PATH, statusData)
}

export const server: Plugin = async (input: any): Promise<Hooks> => {
  const directory = input.directory || process.cwd()

  return {
    'tool.execute.after': async (toolInput: any) => {
      // 监听 task_graph 工具
      if (toolInput.tool === 'task_graph') {
        let action: string | undefined
        let taskId: string | undefined
        let reason: string | undefined

        try {
          const args = typeof toolInput.args === 'string' ? JSON.parse(toolInput.args) : toolInput.args
          action = args?.action
          taskId = args?.taskId
          reason = args?.reason
        } catch {
          return
        }

        if (!['create_graph', 'update_task', 'complete_task', 'apply_change', 'cancel_task'].includes(action || '')) {
          return
        }

        if (action === 'cancel_task' && taskId) {
          writeCancelSignal(directory, taskId, reason)
        }

        writeSignal(directory)
        writeRuntime(directory)
      }

      // 监听 task 工具完成事件（子 session 完成）
      if (toolInput.tool === 'task') {
        writeSignal(directory)
        writeRuntime(directory)
      }
    }
  }
}
