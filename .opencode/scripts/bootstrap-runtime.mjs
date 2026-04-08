import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const projectDir = process.cwd()
const opencodeDir = path.join(projectDir, '.opencode')
const workerDir = path.join(opencodeDir, 'worker')
const workDir = path.join(opencodeDir, 'work')
const runtimeDir = path.join(opencodeDir, 'runtime')

const workflowTemplate = `---
workflow: frontend-development
version: 4
mode: agents-team
---

# 前端开发工作流（Runtime Registry 版）

## 核心原则

- 项目经理负责建图、派发、监控、变更处理和结果汇总
- 所有子任务通过 \`task_graph\` 管理依赖关系
- \`process.md\` 只能通过 \`process_state\` 工具维护
- \`agents-runtime.json\` 通过 \`agent_runtime\` 工具维护，作为 Agents Team 运行时注册表
- 所有可并发任务都要通过 \`task(run_in_background: true)\` 后台启动
- 项目经理派发完成后应立即退出等待，不能靠长轮询阻塞当前 session
`

const processTemplate = `---
request: ""
status: "idle"
phase: "plan"
graph_version: ""
active_tasks: []
completed_tasks: []
pending_tasks: []
artifacts: {}
last_message: ""
updated_at: ""
---

## 执行日志

| 时间 | 阶段 | 动作 | 说明 |
|------|------|------|------|
| - | plan | 初始化 | 等待项目经理写入运行状态 |
`

const taskGraphTemplate = `{
  "version": "",
  "status": "idle",
  "createdAt": "",
  "updatedAt": "",
  "changeHistory": [],
  "tasks": []
}
`

const signalTemplate = `{
  "timestamp": "",
  "version": "",
  "status": "idle",
  "shouldResumeManager": false,
  "resumeReason": "",
  "readyTasks": [],
  "runningTasks": [],
  "completedTasks": []
}
`

const runtimeTemplate = `{
  "version": "1.0",
  "updatedAt": "",
  "request": "",
  "manager": {
    "role": "project-manager",
    "status": "idle",
    "sessionStrategy": "continue-last-session",
    "resumeCount": 0,
    "lastResumeAt": "",
    "lastResumeReason": "",
    "lastExitAt": "",
    "lastExitReason": ""
  },
  "graph": {
    "version": "",
    "status": "idle",
    "counts": {
      "total": 0,
      "ready": 0,
      "running": 0,
      "completed": 0,
      "failed": 0,
      "cancelled": 0,
      "superseded": 0
    }
  },
  "dispatches": [],
  "lastSignal": {
    "shouldResumeManager": false,
    "resumeReason": "",
    "timestamp": ""
  }
}
`

function log(message, quiet) {
  if (quiet) return
  process.stdout.write(`[bootstrap] ${message}\n`)
}

function ensureDir(dirPath, quiet) {
  if (fs.existsSync(dirPath)) return
  fs.mkdirSync(dirPath, { recursive: true })
  log(`创建目录 ${path.relative(projectDir, dirPath)}`, quiet)
}

function ensureFile(filePath, content, quiet) {
  ensureDir(path.dirname(filePath), quiet)
  if (fs.existsSync(filePath)) return
  fs.writeFileSync(filePath, content, 'utf8')
  log(`创建文件 ${path.relative(projectDir, filePath)}`, quiet)
}

export function ensureProjectRuntime(options = {}) {
  const quiet = options.quiet ?? false

  ensureDir(opencodeDir, quiet)
  ensureDir(workerDir, quiet)
  ensureDir(workDir, quiet)
  ensureDir(runtimeDir, quiet)

  ensureFile(path.join(workerDir, 'workflow.md'), workflowTemplate, quiet)
  ensureFile(path.join(workerDir, 'process.md'), processTemplate, quiet)
  ensureFile(path.join(workerDir, 'task-graph.json'), taskGraphTemplate, quiet)
  ensureFile(path.join(runtimeDir, 'agents-runtime.json'), runtimeTemplate, quiet)
  ensureFile(path.join(workDir, '.gitkeep'), '', quiet)
  ensureFile(path.join(workDir, 'task-status.json'), '{}\n', quiet)
  ensureFile(path.join(workDir, '.signal-ready-tasks.json'), signalTemplate, quiet)
}

const isDirectRun = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])
if (isDirectRun) {
  ensureProjectRuntime({ quiet: process.argv.includes('--quiet') })
}
