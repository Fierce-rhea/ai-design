import { tool } from '@opencode-ai/plugin'
import * as fs from 'fs'
import * as path from 'path'

const RUNTIME_PATH = '.opencode/runtime/agents-runtime.json'
const GRAPH_PATH = '.opencode/worker/task-graph.json'

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function readJSON(fullPath: string) {
  if (!fs.existsSync(fullPath)) return null

  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf-8'))
  } catch {
    return null
  }
}

function runtimePath(ctx: any) {
  return path.join(ctx.directory, RUNTIME_PATH)
}

function graphPath(ctx: any) {
  return path.join(ctx.directory, GRAPH_PATH)
}

function now() {
  return new Date().toISOString()
}

function defaultRuntime() {
  return {
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
}

function readRuntime(ctx: any) {
  return readJSON(runtimePath(ctx)) || defaultRuntime()
}

function writeRuntime(ctx: any, runtime: any) {
  const full = runtimePath(ctx)
  ensureDir(full)
  runtime.updatedAt = now()
  fs.writeFileSync(full, JSON.stringify(runtime, null, 2), 'utf-8')
}

function readGraph(ctx: any) {
  return readJSON(graphPath(ctx))
}

function upsertDispatch(runtime: any, task: any, extra: any = {}) {
  const existing = runtime.dispatches.find((item: any) => item.taskId === task.id)

  const next = {
    taskId: task.id,
    owner: task.owner,
    subject: task.subject,
    status: task.status,
    category: task.category || 'unspecified',
    blockedBy: task.blockedBy || [],
    output: task.output || null,
    message: task.message || null,
    createdAt: existing?.createdAt || task.createdAt || now(),
    startedAt: task.startedAt || existing?.startedAt || null,
    completedAt: task.completedAt || existing?.completedAt || null,
    lastDispatchAt: existing?.lastDispatchAt || null,
    dispatchCount: existing?.dispatchCount || 0,
    notes: existing?.notes || '',
    ...extra
  }

  if (existing) {
    Object.assign(existing, next)
  } else {
    runtime.dispatches.push(next)
  }
}

function syncFromGraph(runtime: any, graph: any) {
  runtime.graph.version = graph.version || ''
  runtime.graph.status = graph.status || 'idle'
  runtime.graph.counts = {
    total: graph.tasks.length,
    ready: graph.tasks.filter((task: any) => task.status === 'ready').length,
    running: graph.tasks.filter((task: any) => task.status === 'running').length,
    completed: graph.tasks.filter((task: any) => task.status === 'completed').length,
    failed: graph.tasks.filter((task: any) => task.status === 'failed').length,
    cancelled: graph.tasks.filter((task: any) => task.status === 'cancelled').length,
    superseded: graph.tasks.filter((task: any) => task.status === 'superseded').length
  }

  graph.tasks.forEach((task: any) => {
    upsertDispatch(runtime, task)
  })
}

export default tool({
  description: '维护 Agents Runtime Registry，跟踪主调度状态与子任务运行实例。',
  args: {
    action: tool.schema.enum(['init_runtime', 'register_dispatch', 'sync_from_graph', 'update_manager', 'record_signal', 'reset', 'get_status']).describe('操作类型'),
    request: tool.schema.string().optional().describe('用户原始需求'),
    manager_status: tool.schema.string().optional().describe('主 agent 状态'),
    session_strategy: tool.schema.string().optional().describe('主 agent 恢复策略'),
    taskId: tool.schema.string().optional().describe('任务 ID'),
    owner: tool.schema.string().optional().describe('角色名'),
    subject: tool.schema.string().optional().describe('任务主题'),
    phase: tool.schema.string().optional().describe('当前阶段'),
    note: tool.schema.string().optional().describe('备注'),
    resume_reason: tool.schema.string().optional().describe('恢复原因'),
    should_resume_manager: tool.schema.boolean().optional().describe('是否应恢复主 agent'),
    signal_timestamp: tool.schema.string().optional().describe('信号时间戳'),
    exit_reason: tool.schema.string().optional().describe('退出原因')
  },
  async execute(args: any, ctx: any) {
    if (args.action === 'reset') {
      const runtime = defaultRuntime()
      writeRuntime(ctx, runtime)
      return JSON.stringify({ success: true, runtime }, null, 2)
    }

    const runtime = readRuntime(ctx)

    if (args.action === 'init_runtime') {
      const next = defaultRuntime()
      next.request = args.request || ''
      next.manager.status = args.manager_status || 'planning'
      next.manager.sessionStrategy = args.session_strategy || 'continue-last-session'
      writeRuntime(ctx, next)
      return JSON.stringify({ success: true, runtime: next }, null, 2)
    }

    if (args.action === 'register_dispatch') {
      if (!args.taskId || !args.owner) {
        return JSON.stringify({ error: 'register_dispatch 需要 taskId 和 owner' })
      }

      upsertDispatch(runtime, {
        id: args.taskId,
        owner: args.owner,
        subject: args.subject || args.taskId,
        status: 'running',
        category: args.phase || 'unspecified',
        blockedBy: [],
        output: null,
        message: args.note || null,
        createdAt: now(),
        startedAt: now(),
        completedAt: null
      }, {
        dispatchCount: ((runtime.dispatches.find((item: any) => item.taskId === args.taskId)?.dispatchCount) || 0) + 1,
        lastDispatchAt: now(),
        notes: args.note || ''
      })

      writeRuntime(ctx, runtime)
      return JSON.stringify({ success: true, dispatches: runtime.dispatches }, null, 2)
    }

    if (args.action === 'sync_from_graph') {
      const graph = readGraph(ctx)
      if (!graph) return JSON.stringify({ error: 'Task Graph 不存在，无法同步 runtime' })

      syncFromGraph(runtime, graph)
      if (args.manager_status) runtime.manager.status = args.manager_status
      if (args.request !== undefined) runtime.request = args.request
      writeRuntime(ctx, runtime)
      return JSON.stringify({ success: true, runtime }, null, 2)
    }

    if (args.action === 'update_manager') {
      if (args.manager_status) runtime.manager.status = args.manager_status
      if (args.session_strategy) runtime.manager.sessionStrategy = args.session_strategy
      if (args.resume_reason) {
        runtime.manager.lastResumeReason = args.resume_reason
        runtime.manager.lastResumeAt = now()
        runtime.manager.resumeCount += 1
      }
      if (args.exit_reason) {
        runtime.manager.lastExitReason = args.exit_reason
        runtime.manager.lastExitAt = now()
      }
      writeRuntime(ctx, runtime)
      return JSON.stringify({ success: true, manager: runtime.manager }, null, 2)
    }

    if (args.action === 'record_signal') {
      runtime.lastSignal = {
        shouldResumeManager: args.should_resume_manager ?? runtime.lastSignal.shouldResumeManager,
        resumeReason: args.resume_reason || runtime.lastSignal.resumeReason,
        timestamp: args.signal_timestamp || now()
      }
      writeRuntime(ctx, runtime)
      return JSON.stringify({ success: true, lastSignal: runtime.lastSignal }, null, 2)
    }

    if (args.action === 'get_status') {
      return JSON.stringify({ success: true, runtime }, null, 2)
    }

    return JSON.stringify({ error: `未知操作: ${args.action}` }, null, 2)
  }
})
