import fs from 'fs'
import path from 'path'
import { spawn } from 'child_process'
import { ensureProjectRuntime } from './bootstrap-runtime.mjs'

const projectDir = process.cwd()
const workDir = path.join(projectDir, '.opencode', 'work')
const signalPath = path.join(workDir, '.signal-ready-tasks.json')
const processPath = path.join(projectDir, '.opencode', 'worker', 'process.md')
const lockPath = path.join(workDir, '.manager-resume.lock')
const statePath = path.join(workDir, '.manager-resume-state.json')
const runtimePath = path.join(projectDir, '.opencode', 'runtime', 'agents-runtime.json')

const resumePrompt = '检测到子任务状态变化，请读取 workflow.md、process.md、task-graph.json 和 .signal-ready-tasks.json，按任务图继续编排；如果仍无 ready 任务，只更新状态并退出等待。'

function log(message) {
  const time = new Date().toISOString()
  process.stdout.write(`[auto-resume] ${time} ${message}\n`)
}

function readJSON(filePath) {
  if (!fs.existsSync(filePath)) return null

  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function writeJSON(filePath, data) {
  const parent = path.dirname(filePath)
  if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true })
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8')
}

function updateRuntime(mutator) {
  const current = readJSON(runtimePath) || {
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

  mutator(current)
  current.updatedAt = new Date().toISOString()
  writeJSON(runtimePath, current)
}

function readProcessStatus() {
  if (!fs.existsSync(processPath)) return null
  const content = fs.readFileSync(processPath, 'utf8')
  const match = content.match(/^status:\s*["']?([^"'\n]+)["']?$/m)
  return match ? match[1].trim() : null
}

function isManagerWaiting(status) {
  return ['running', 'in_progress', 'waiting_subagents'].includes(status || '')
}

function hasLiveLock() {
  if (!fs.existsSync(lockPath)) return false

  try {
    const lock = JSON.parse(fs.readFileSync(lockPath, 'utf8'))
    if (!lock.pid) return false
    process.kill(lock.pid, 0)
    return true
  } catch {
    return false
  }
}

function createLock() {
  writeJSON(lockPath, {
    pid: process.pid,
    createdAt: new Date().toISOString()
  })
}

function removeLock() {
  if (fs.existsSync(lockPath)) fs.unlinkSync(lockPath)
}

function shouldResume(signal) {
  if (!signal) return { ok: false, reason: '信号文件不存在或不可解析' }

  if (!signal.shouldResumeManager) {
    return { ok: false, reason: signal.resumeReason || '当前无需恢复项目经理' }
  }

  const processStatus = readProcessStatus()
  if (!isManagerWaiting(processStatus)) {
    return { ok: false, reason: `项目状态不是等待中，当前为 ${processStatus || 'unknown'}` }
  }

  const state = readJSON(statePath) || {}
  if (state.lastHandledTimestamp && state.lastHandledTimestamp === signal.timestamp) {
    return { ok: false, reason: '该信号已处理过' }
  }

  return { ok: true, processStatus }
}

function markHandled(signal) {
  writeJSON(statePath, {
    lastHandledTimestamp: signal.timestamp,
    lastHandledVersion: signal.version || '',
    handledAt: new Date().toISOString()
  })
}

function runResume(signal) {
  if (hasLiveLock()) {
    log('检测到已有恢复进程在执行，跳过本次唤醒')
    return
  }

  ensureProjectRuntime({ quiet: true })
  createLock()
  log(`触发项目经理恢复，原因：${signal.resumeReason || '子任务状态变化'}`)
  updateRuntime((runtime) => {
    runtime.manager.status = 'resuming'
    runtime.manager.resumeCount += 1
    runtime.manager.lastResumeAt = new Date().toISOString()
    runtime.manager.lastResumeReason = signal.resumeReason || '子任务状态变化'
    runtime.lastSignal = {
      shouldResumeManager: signal.shouldResumeManager,
      resumeReason: signal.resumeReason || '',
      timestamp: signal.timestamp || new Date().toISOString()
    }
  })

  const child = spawn(
    'opencode',
    [
      'run',
      '--continue',
      '--agent',
      'project-manager',
      '--dir',
      projectDir,
      resumePrompt
    ],
    {
      cwd: projectDir,
      stdio: 'inherit'
    }
  )

  child.on('exit', (code) => {
    markHandled(signal)
    updateRuntime((runtime) => {
      const processStatus = readProcessStatus()
      runtime.manager.status = processStatus || 'idle'
      runtime.manager.lastExitAt = new Date().toISOString()
      runtime.manager.lastExitReason = `watcher 恢复执行结束，退出码 ${code}`
    })
    removeLock()
    log(`项目经理恢复执行结束，退出码 ${code}`)
  })

  child.on('error', (error) => {
    updateRuntime((runtime) => {
      runtime.manager.status = 'waiting'
      runtime.manager.lastExitAt = new Date().toISOString()
      runtime.manager.lastExitReason = `watcher 恢复执行失败：${error.message}`
    })
    removeLock()
    log(`项目经理恢复执行失败：${error.message}`)
  })
}

function checkAndResume() {
  const signal = readJSON(signalPath)
  const decision = shouldResume(signal)

  if (!decision.ok) {
    if (signal && signal.resumeReason) {
      log(`跳过恢复：${decision.reason}`)
    }
    return
  }

  runResume(signal)
}

function ensureDirs() {
  if (!fs.existsSync(workDir)) fs.mkdirSync(workDir, { recursive: true })
}

function startWatcher() {
  ensureProjectRuntime({ quiet: true })
  ensureDirs()
  log('自动唤醒监听器已启动，正在监听项目经理恢复信号')

  checkAndResume()

  if (fs.existsSync(workDir)) {
    try {
      const watcher = fs.watch(workDir, (_eventType, filename) => {
        if (!filename || filename !== '.signal-ready-tasks.json') return
        setTimeout(checkAndResume, 300)
      })
      watcher.on('error', (error) => {
        log(`文件事件监听失败，继续使用轮询模式：${error.message}`)
        try {
          watcher.close()
        } catch {
          // 忽略关闭异常
        }
      })
      log('已启用文件事件监听')
    } catch (error) {
      log(`文件事件监听不可用，已降级为轮询模式：${error.message}`)
    }
  }

  setInterval(checkAndResume, 3000)
  log('已启用 3 秒轮询兜底')
}

startWatcher()
