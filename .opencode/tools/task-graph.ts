import { tool } from '@opencode-ai/plugin'
import * as fs from 'fs'
import * as path from 'path'

const GRAPH_PATH = '.opencode/worker/task-graph.json'
const STATUS_PATH = '.opencode/work/task-status.json'

// 超时阈值（毫秒），可通过环境变量覆盖
const TASK_TIMEOUT_MS = parseInt(process.env.TASK_TIMEOUT_MS || '600000', 10)

function readJSON(ctx: any, filePath: string): any {
  const full = path.join(ctx.directory, filePath)
  if (!fs.existsSync(full)) return null

  try {
    return JSON.parse(fs.readFileSync(full, 'utf-8'))
  } catch {
    return null
  }
}

function writeJSON(ctx: any, filePath: string, data: any) {
  const full = path.join(ctx.directory, filePath)
  const dir = path.dirname(full)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  fs.writeFileSync(full, JSON.stringify(data, null, 2), 'utf-8')
}

function generateId(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let result = 'T-'
  for (let i = 0; i < 6; i++) result += chars[Math.floor(Math.random() * chars.length)]
  return result
}

function isTerminal(status: string) {
  return ['completed', 'cancelled', 'superseded', 'failed'].includes(status)
}

function canRun(task: any, graph: any) {
  return task.blockedBy.every((depId: string) => {
    const dep = graph.tasks.find((item: any) => item.id === depId)
    return dep && dep.status === 'completed'
  })
}

function refreshGraph(graph: any) {
  let changed = false
  const now = Date.now()

  for (const task of graph.tasks) {
    if (task.status === 'running' && task.startedAt) {
      const elapsed = now - new Date(task.startedAt).getTime()
      if (elapsed > TASK_TIMEOUT_MS) {
        task.status = 'failed'
        task.message = `任务超时（超过 ${TASK_TIMEOUT_MS / 1000} 秒未完成）`
        task.completedAt = new Date().toISOString()
        changed = true
      }
    }
  }

  for (const task of graph.tasks) {
    if (task.status === 'pending' && canRun(task, graph)) {
      task.status = 'ready'
      changed = true
    }

    if (task.status === 'ready' && !canRun(task, graph) && task.blockedBy.length > 0) {
      task.status = 'pending'
      changed = true
    }
  }

  const counts = {
    completed: graph.tasks.filter((task: any) => task.status === 'completed').length,
    running: graph.tasks.filter((task: any) => task.status === 'running').length,
    ready: graph.tasks.filter((task: any) => task.status === 'ready').length,
    pending: graph.tasks.filter((task: any) => task.status === 'pending').length
  }

  const allTerminal = graph.tasks.length > 0 && graph.tasks.every((task: any) => isTerminal(task.status))
  const nextStatus = allTerminal
    ? 'completed'
    : counts.running > 0 || counts.ready > 0 || counts.pending > 0
      ? 'running'
      : 'idle'

  if (graph.status !== nextStatus) {
    graph.status = nextStatus
    changed = true
  }

  if (changed) graph.updatedAt = new Date().toISOString()

  return graph
}

function serializeTask(task: any) {
  return {
    id: task.id,
    subject: task.subject,
    owner: task.owner,
    status: task.status,
    category: task.category,
    blockedBy: task.blockedBy,
    output: task.output,
    message: task.message
  }
}

function validateArtifactExists(ctx: any, outputPath: string): { exists: boolean, empty: boolean, error?: string } {
  const full = path.join(ctx.directory, outputPath)
  if (!fs.existsSync(full)) {
    return { exists: false, empty: true, error: `产物文件不存在: ${outputPath}` }
  }
  const stat = fs.statSync(full)
  if (stat.size === 0) {
    return { exists: true, empty: true, error: `产物文件为空: ${outputPath}` }
  }
  return { exists: true, empty: false }
}

function validateArtifactQuality(category: string, content: string): { passed: boolean, warning?: string } {
  const rules: Record<string, string[]> = {
    analysis: ['项目概述', '需求'],
    design: ['配色', '布局', '字体'],
    development: ['.vue', 'import'],
    qa: ['测试', '构建']
  }
  const keywords = rules[category]
  if (!keywords) return { passed: true }
  const found = keywords.some(kw => content.includes(kw))
  if (!found) {
    return { passed: false, warning: `产物质量警告：${category} 类任务产物未包含预期关键词（${keywords.join(' / ')}）` }
  }
  return { passed: true }
}

function findDownstreamTasks(graph: any, taskId: string): string[] {
  const visited = new Set<string>()
  const queue = [taskId]
  while (queue.length > 0) {
    const current = queue.shift()!
    const task = graph.tasks.find((item: any) => item.id === current)
    if (!task) continue
    for (const blockedId of task.blocks || []) {
      if (!visited.has(blockedId)) {
        visited.add(blockedId)
        queue.push(blockedId)
      }
    }
  }
  return Array.from(visited)
}

export default tool({
  description: '管理 Task 依赖图，用于 Agents Team 并发编排和变更处理。',
  args: {
    action: tool.schema.string().describe('操作类型: create_graph / update_task / complete_task / apply_change / cancel_task / get_ready_tasks / get_status / reset_graph / auto_resolve_changes / retry_task'),
    taskId: tool.schema.string().optional().describe('任务 ID'),
    subject: tool.schema.string().optional().describe('任务主题'),
    owner: tool.schema.string().optional().describe('负责 Agent 名称'),
    blockedBy: tool.schema.array(tool.schema.string()).optional().describe('依赖任务 ID 列表'),
    category: tool.schema.string().optional().describe('任务分类'),
    status: tool.schema.string().optional().describe('任务状态: pending / ready / running / completed / failed / cancelled / superseded'),
    output: tool.schema.string().optional().describe('产出文件路径'),
    message: tool.schema.string().optional().describe('附加消息'),
    reason: tool.schema.string().optional().describe('变更或取消原因'),
    changes: tool.schema.array(tool.schema.object({
      taskId: tool.schema.string(),
      action: tool.schema.enum(['rollback', 'cancel', 'continue', 'update_deps', 'recreate']),
      newId: tool.schema.string().optional(),
      reason: tool.schema.string().optional()
    })).optional().describe('变更列表'),
    tasks: tool.schema.array(tool.schema.object({
      id: tool.schema.string().optional(),
      subject: tool.schema.string(),
      owner: tool.schema.string(),
      blockedBy: tool.schema.array(tool.schema.string()),
      category: tool.schema.string().optional(),
      input: tool.schema.array(tool.schema.string()).optional()
    })).optional().describe('创建任务图时的任务列表')
  },
  async execute(args: any, ctx: any) {
    switch (args.action) {
      case 'create_graph': {
        const now = new Date().toISOString()
        const tasks = (args.tasks || []).map((task: any) => ({
          id: task.id || generateId(),
          subject: task.subject,
          owner: task.owner,
          status: task.blockedBy.length === 0 ? 'ready' : 'pending',
          blockedBy: task.blockedBy,
          blocks: [],
          category: task.category || 'unspecified',
          input: task.input || [],
          output: null,
          message: null,
          createdAt: now,
          startedAt: null,
          completedAt: null,
          retryCount: 0,
          maxRetries: 2
        }))

        tasks.forEach((task: any) => {
          task.blockedBy.forEach((depId: string) => {
            const dep = tasks.find((item: any) => item.id === depId)
            if (dep && !dep.blocks.includes(task.id)) dep.blocks.push(task.id)
          })
        })

        const graph = refreshGraph({
          version: '1.0',
          status: 'running',
          createdAt: now,
          updatedAt: now,
          changeHistory: [{ version: '1.0', timestamp: now, reason: '初始创建' }],
          tasks
        })

        writeJSON(ctx, GRAPH_PATH, graph)
        writeJSON(ctx, STATUS_PATH, {})

        return JSON.stringify({
          success: true,
          graphVersion: graph.version,
          totalTasks: graph.tasks.length,
          readyTasks: graph.tasks.filter((task: any) => task.status === 'ready').map(serializeTask),
          pendingTasks: graph.tasks.filter((task: any) => task.status === 'pending').map(serializeTask)
        }, null, 2)
      }

      case 'update_task': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在，请先调用 create_graph' })

        const task = graph.tasks.find((item: any) => item.id === args.taskId)
        if (!task) return JSON.stringify({ error: `任务 ${args.taskId} 不存在` })

        if (args.status) {
          if (args.status === 'failed') {
            const retryCount = task.retryCount || 0
            const maxRetries = task.maxRetries ?? 2
            if (retryCount < maxRetries) {
              task.status = 'ready'
              task.retryCount = retryCount + 1
              task.message = (args.message || '') + `（第 ${task.retryCount} 次重试）`
            } else {
              task.status = 'failed'
              task.message = args.message || null
            }
          } else {
            task.status = args.status
          }
        }
        if (args.message && args.status !== 'failed') task.message = args.message
        if (args.output) task.output = args.output
        if (args.status === 'running' && !task.startedAt) task.startedAt = new Date().toISOString()
        graph.updatedAt = new Date().toISOString()

        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({ success: true, task: serializeTask(task) }, null, 2)
      }

      case 'complete_task': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在' })

        const task = graph.tasks.find((item: any) => item.id === args.taskId)
        if (!task) return JSON.stringify({ error: `任务 ${args.taskId} 不存在` })

        if (args.output) {
          const artifactCheck = validateArtifactExists(ctx, args.output)
          if (!artifactCheck.exists || artifactCheck.empty) {
            return JSON.stringify({ error: artifactCheck.error || '产物校验失败' })
          }
          const qualityResult = validateArtifactQuality(task.category, fs.readFileSync(path.join(ctx.directory, args.output), 'utf-8'))
          if (!qualityResult.passed) {
            task.message = qualityResult.warning
          }
        }

        task.status = 'completed'
        task.output = args.output || null
        if (!task.message) task.message = args.message || null
        task.completedAt = new Date().toISOString()
        graph.updatedAt = new Date().toISOString()

        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({
          success: true,
          completedTask: serializeTask(task),
          newlyReady: graph.tasks.filter((item: any) => item.status === 'ready').map(serializeTask),
          graphStatus: graph.status
        }, null, 2)
      }

      case 'apply_change': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在' })

        const now = new Date().toISOString()
        graph.changeHistory.push({
          version: graph.version,
          timestamp: now,
          reason: args.reason || '用户修改需求',
          changes: args.changes || []
        })
        graph.version = (parseFloat(graph.version) + 0.1).toFixed(1)
        graph.updatedAt = now

        const cancelled: any[] = []
        const recreated: any[] = []

        for (const change of args.changes || []) {
          const task = graph.tasks.find((item: any) => item.id === change.taskId)
          if (!task) continue

          if (change.action === 'rollback') {
            task.supersededBy = change.newId || generateId()
            task.status = 'superseded'

            const newTask = {
              id: task.supersededBy,
              subject: `${task.subject}（需求变更）`,
              owner: task.owner,
              status: 'ready',
              blockedBy: [],
              blocks: [...(task.blocks || [])],
              category: task.category,
              input: [...(task.input || [])],
              output: null,
              message: null,
              createdAt: now,
              startedAt: null,
              completedAt: null,
              retryCount: 0,
              maxRetries: 2,
              isRevision: true,
              originalTaskId: task.id
            }

            graph.tasks.push(newTask)
            recreated.push(serializeTask(newTask))
          }

          if (change.action === 'cancel') {
            task.status = 'cancelled'
            task.cancelReason = change.reason || args.reason || '需求变更'
            task.cancelledAt = now
            cancelled.push(serializeTask(task))

            const statusData = readJSON(ctx, STATUS_PATH) || {}
            statusData[task.id] = { action: 'cancel', reason: task.cancelReason, timestamp: now }
            writeJSON(ctx, STATUS_PATH, statusData)
          }

          if (change.action === 'update_deps' || change.action === 'recreate') {
            task.status = 'pending'
          }
        }

        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({
          success: true,
          newVersion: graph.version,
          cancelled,
          recreated,
          readyTasks: graph.tasks.filter((task: any) => task.status === 'ready').map(serializeTask)
        }, null, 2)
      }

      case 'cancel_task': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在' })

        const task = graph.tasks.find((item: any) => item.id === args.taskId)
        if (!task) return JSON.stringify({ error: `任务 ${args.taskId} 不存在` })

        const now = new Date().toISOString()
        task.status = 'cancelled'
        task.cancelReason = args.reason || '手动取消'
        task.cancelledAt = now

        const statusData = readJSON(ctx, STATUS_PATH) || {}
        statusData[task.id] = { action: 'cancel', reason: task.cancelReason, timestamp: now }
        writeJSON(ctx, STATUS_PATH, statusData)

        graph.updatedAt = now
        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({ success: true, cancelled: serializeTask(task) }, null, 2)
      }

      case 'get_ready_tasks': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在', readyTasks: [] })

        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({
          readyTasks: graph.tasks.filter((task: any) => task.status === 'ready').map(serializeTask)
        }, null, 2)
      }

      case 'get_status': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在，当前无运行中的任务' })

        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({
          version: graph.version,
          status: graph.status,
          totalTasks: graph.tasks.length,
          completed: graph.tasks.filter((task: any) => task.status === 'completed').length,
          running: graph.tasks.filter((task: any) => task.status === 'running').length,
          ready: graph.tasks.filter((task: any) => task.status === 'ready').length,
          pending: graph.tasks.filter((task: any) => task.status === 'pending').length,
          cancelled: graph.tasks.filter((task: any) => task.status === 'cancelled').length,
          superseded: graph.tasks.filter((task: any) => task.status === 'superseded').length,
          tasks: graph.tasks.map(serializeTask)
        }, null, 2)
      }

      case 'reset_graph': {
        const now = new Date().toISOString()
        const emptyGraph = {
          version: '1.0',
          status: 'idle',
          createdAt: now,
          updatedAt: now,
          changeHistory: [],
          tasks: []
        }
        writeJSON(ctx, GRAPH_PATH, emptyGraph)
        writeJSON(ctx, STATUS_PATH, {})
        return JSON.stringify({ success: true, message: '任务图已重置为 idle 状态' }, null, 2)
      }

      case 'auto_resolve_changes': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在' })

        const targetTask = graph.tasks.find((item: any) => item.id === args.taskId)
        if (!targetTask) return JSON.stringify({ error: `任务 ${args.taskId} 不存在` })

        const now = new Date().toISOString()
        const newId = generateId()

        targetTask.supersededBy = newId
        targetTask.status = 'superseded'

        const newTask = {
          id: newId,
          subject: `${targetTask.subject}（变更）`,
          owner: targetTask.owner,
          status: 'ready',
          blockedBy: [],
          blocks: [...(targetTask.blocks || [])],
          category: targetTask.category,
          input: [...(targetTask.input || [])],
          output: null,
          message: `变更原因：${args.reason || '未知'}`,
          createdAt: now,
          startedAt: null,
          completedAt: null,
          retryCount: 0,
          maxRetries: 2,
          isRevision: true,
          originalTaskId: targetTask.id
        }

        graph.tasks.push(newTask)

        const downstreamIds = findDownstreamTasks(graph, targetTask.id)
        for (const downId of downstreamIds) {
          const downTask = graph.tasks.find((item: any) => item.id === downId)
          if (downTask && !isTerminal(downTask.status)) {
            downTask.status = 'pending'
            downTask.message = `上游任务变更，状态重置为 pending`
          }
        }

        graph.changeHistory.push({
          version: graph.version,
          timestamp: now,
          reason: args.reason || '自动变更处理',
          changes: [{ taskId: args.taskId, action: 'rollback', newId, reason: args.reason }]
        })
        graph.version = (parseFloat(graph.version) + 0.1).toFixed(1)
        graph.updatedAt = now

        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({
          success: true,
          newVersion: graph.version,
          supersededTask: serializeTask(targetTask),
          newTask: serializeTask(newTask),
          downstreamReset: downstreamIds
        }, null, 2)
      }

      case 'retry_task': {
        const graph = readJSON(ctx, GRAPH_PATH)
        if (!graph) return JSON.stringify({ error: 'Task Graph 不存在' })

        const task = graph.tasks.find((item: any) => item.id === args.taskId)
        if (!task) return JSON.stringify({ error: `任务 ${args.taskId} 不存在` })

        task.retryCount = 0
        task.status = 'ready'
        task.message = (task.message || '') + '（手动触发重试）'
        graph.updatedAt = new Date().toISOString()

        refreshGraph(graph)
        writeJSON(ctx, GRAPH_PATH, graph)

        return JSON.stringify({ success: true, task: serializeTask(task) }, null, 2)
      }

      default:
        return JSON.stringify({
          error: `未知操作: ${args.action}。支持: create_graph, update_task, complete_task, apply_change, cancel_task, get_ready_tasks, get_status, reset_graph, auto_resolve_changes, retry_task`
        }, null, 2)
    }
  }
})
