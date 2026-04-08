import { tool } from '@opencode-ai/plugin'
import * as fs from 'fs'
import * as path from 'path'

const PROCESS_PATH = '.opencode/worker/process.md'
const GRAPH_PATH = '.opencode/worker/task-graph.json'

type ProcessState = {
  request: string
  status: string
  phase: string
  graph_version: string
  active_tasks: string[]
  completed_tasks: string[]
  pending_tasks: string[]
  artifacts: Record<string, string>
  last_message: string
  updated_at: string
}

type ProcessLog = {
  time: string
  phase: string
  action: string
  detail: string
}

function ensureDir(filePath: string) {
  const dir = path.dirname(filePath)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
}

function escapeString(value: string) {
  return JSON.stringify(value || '')
}

function parseInlineValue(raw: string) {
  const value = raw.trim()
  if (!value) return ''

  try {
    return JSON.parse(value)
  } catch {
    return value.replace(/^['"]|['"]$/g, '')
  }
}

function defaultState(): ProcessState {
  return {
    request: '',
    status: 'idle',
    phase: 'plan',
    graph_version: '',
    active_tasks: [],
    completed_tasks: [],
    pending_tasks: [],
    artifacts: {},
    last_message: '',
    updated_at: ''
  }
}

function readProcess(ctx: any) {
  const full = path.join(ctx.directory, PROCESS_PATH)
  if (!fs.existsSync(full)) {
    return {
      state: defaultState(),
      logs: [] as ProcessLog[]
    }
  }

  const content = fs.readFileSync(full, 'utf-8')
  const match = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) {
    return {
      state: defaultState(),
      logs: [] as ProcessLog[]
    }
  }

  const frontmatter = match[1]
  const body = match[2]
  const state = defaultState()

  frontmatter.split('\n').forEach((line) => {
    const separator = line.indexOf(':')
    if (separator === -1) return
    const key = line.slice(0, separator).trim()
    const raw = line.slice(separator + 1).trim()
    ;(state as any)[key] = parseInlineValue(raw)
  })

  const logs: ProcessLog[] = []
  body.split('\n').forEach((line) => {
    if (!line.startsWith('|') || line.includes('------') || line.includes(' 时间 ')) return
    const cells = line.split('|').map((item) => item.trim()).filter(Boolean)
    if (cells.length !== 4) return
    logs.push({
      time: cells[0],
      phase: cells[1],
      action: cells[2],
      detail: cells[3]
    })
  })

  return { state, logs }
}

function readGraph(ctx: any) {
  const full = path.join(ctx.directory, GRAPH_PATH)
  if (!fs.existsSync(full)) return null

  try {
    return JSON.parse(fs.readFileSync(full, 'utf-8'))
  } catch {
    return null
  }
}

function deriveStatus(graph: any) {
  const readyTasks = graph.tasks.filter((task: any) => task.status === 'ready')
  const runningTasks = graph.tasks.filter((task: any) => task.status === 'running')
  const failedTasks = graph.tasks.filter((task: any) => task.status === 'failed')

  if (failedTasks.length > 0) return 'failed'
  if (graph.status === 'completed') return 'completed'
  if (runningTasks.length > 0 && readyTasks.length === 0) return 'waiting_subagents'
  if (graph.status === 'running') return 'in_progress'
  return 'idle'
}

function writeProcess(ctx: any, state: ProcessState, logs: ProcessLog[]) {
  const full = path.join(ctx.directory, PROCESS_PATH)
  ensureDir(full)

  const normalizedLogs = logs.length > 0
    ? logs
    : [{ time: '-', phase: 'plan', action: '初始化', detail: '等待项目经理写入运行状态' }]

  const content = [
    '---',
    `request: ${escapeString(state.request)}`,
    `status: ${escapeString(state.status)}`,
    `phase: ${escapeString(state.phase)}`,
    `graph_version: ${escapeString(state.graph_version)}`,
    `active_tasks: ${JSON.stringify(state.active_tasks)}`,
    `completed_tasks: ${JSON.stringify(state.completed_tasks)}`,
    `pending_tasks: ${JSON.stringify(state.pending_tasks)}`,
    `artifacts: ${JSON.stringify(state.artifacts)}`,
    `last_message: ${escapeString(state.last_message)}`,
    `updated_at: ${escapeString(state.updated_at)}`,
    '---',
    '',
    '## 执行日志',
    '',
    '| 时间 | 阶段 | 动作 | 说明 |',
    '|------|------|------|------|',
    ...normalizedLogs.map((log) => `| ${log.time} | ${log.phase} | ${log.action} | ${log.detail} |`),
    ''
  ].join('\n')

  fs.writeFileSync(full, content, 'utf-8')
}

function normalizeArtifacts(items: Array<{ key: string, value: string }> | undefined, current: Record<string, string>) {
  if (!items) return current
  return items.reduce((result, item) => {
    result[item.key] = item.value
    return result
  }, { ...current })
}

export default tool({
  description: '统一维护 .opencode/worker/process.md，避免项目经理手写状态文件。',
  args: {
    action: tool.schema.enum(['update', 'sync_from_graph', 'reset']).describe('操作类型'),
    request: tool.schema.string().optional().describe('用户原始需求'),
    status: tool.schema.string().optional().describe('运行状态'),
    phase: tool.schema.string().optional().describe('当前阶段'),
    graph_version: tool.schema.string().optional().describe('任务图版本'),
    active_tasks: tool.schema.array(tool.schema.string()).optional().describe('运行中的任务 ID 列表'),
    completed_tasks: tool.schema.array(tool.schema.string()).optional().describe('已完成任务 ID 列表'),
    pending_tasks: tool.schema.array(tool.schema.string()).optional().describe('待处理任务 ID 列表'),
    artifacts: tool.schema.array(tool.schema.object({
      key: tool.schema.string(),
      value: tool.schema.string()
    })).optional().describe('产出物映射'),
    last_message: tool.schema.string().optional().describe('最新状态说明'),
    updated_at: tool.schema.string().optional().describe('更新时间'),
    log_time: tool.schema.string().optional().describe('日志时间'),
    log_phase: tool.schema.string().optional().describe('日志阶段'),
    log_action: tool.schema.string().optional().describe('日志动作'),
    log_detail: tool.schema.string().optional().describe('日志说明'),
    replace_logs: tool.schema.boolean().optional().describe('是否清空现有日志')
  },
  async execute(args: any, ctx: any) {
    const { state: currentState, logs: currentLogs } = readProcess(ctx)

    if (args.action === 'reset') {
      const state = defaultState()
      writeProcess(ctx, state, [])
      return JSON.stringify({ success: true, state }, null, 2)
    }

    const nextState: ProcessState = {
      ...currentState,
      updated_at: args.updated_at || new Date().toISOString()
    }

    if (args.action === 'sync_from_graph') {
      const graph = readGraph(ctx)
      if (!graph) return JSON.stringify({ error: 'Task Graph 不存在，无法同步 process.md' })

      nextState.graph_version = graph.version || ''
      nextState.active_tasks = graph.tasks.filter((task: any) => task.status === 'running').map((task: any) => task.id)
      nextState.completed_tasks = graph.tasks
        .filter((task: any) => ['completed', 'cancelled', 'superseded'].includes(task.status))
        .map((task: any) => task.id)
      nextState.pending_tasks = graph.tasks
        .filter((task: any) => !['completed', 'cancelled', 'superseded'].includes(task.status))
        .map((task: any) => task.id)
      nextState.status = args.status || deriveStatus(graph)
    }

    if (args.request !== undefined) nextState.request = args.request
    if (args.status !== undefined) nextState.status = args.status
    if (args.phase !== undefined) nextState.phase = args.phase
    if (args.graph_version !== undefined) nextState.graph_version = args.graph_version
    if (args.active_tasks !== undefined) nextState.active_tasks = args.active_tasks
    if (args.completed_tasks !== undefined) nextState.completed_tasks = args.completed_tasks
    if (args.pending_tasks !== undefined) nextState.pending_tasks = args.pending_tasks
    if (args.last_message !== undefined) nextState.last_message = args.last_message
    nextState.artifacts = normalizeArtifacts(args.artifacts, nextState.artifacts)

    const logs = args.replace_logs ? [] : [...currentLogs]
    if (args.log_phase || args.log_action || args.log_detail) {
      logs.push({
        time: args.log_time || new Date().toISOString(),
        phase: args.log_phase || nextState.phase,
        action: args.log_action || '更新',
        detail: args.log_detail || nextState.last_message || '状态已更新'
      })
    }

    writeProcess(ctx, nextState, logs)

    return JSON.stringify({
      success: true,
      state: nextState,
      logCount: logs.length
    }, null, 2)
  }
})
