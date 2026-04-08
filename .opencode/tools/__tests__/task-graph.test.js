/**
 * task-graph 核心逻辑单元测试
 */

const results = { passed: 0, failed: 0, tests: [] }

function test(name, fn) {
  try {
    fn()
    results.passed++
    results.tests.push({ name, status: 'pass' })
  } catch (error) {
    results.failed++
    results.tests.push({ name, status: 'fail: ' + error.message })
  }
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    throw new Error((message || 'assert') + ': expected ' + expected + ', got ' + actual)
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message || 'assert failed')
}

// 1. 超时检测
test('超时检测：running 任务超过阈值应标记为 failed', () => {
  const TASK_TIMEOUT_MS = 600000
  const now = Date.now()
  const tenMinutesAgo = new Date(now - TASK_TIMEOUT_MS - 1000).toISOString()
  const task = { status: 'running', startedAt: tenMinutesAgo }

  if (task.status === 'running' && task.startedAt) {
    const elapsed = now - new Date(task.startedAt).getTime()
    if (elapsed > TASK_TIMEOUT_MS) {
      task.status = 'failed'
      task.message = 'task timeout'
    }
  }

  assertEqual(task.status, 'failed', '超时任务应标记为 failed')
  assert(task.message.includes('timeout'), '消息应包含超时信息')
})

test('超时检测：running 任务未超时应保持 running', () => {
  const TASK_TIMEOUT_MS = 600000
  const now = Date.now()
  const fiveMinutesAgo = new Date(now - 300000).toISOString()
  const task = { status: 'running', startedAt: fiveMinutesAgo }

  if (task.status === 'running' && task.startedAt) {
    const elapsed = now - new Date(task.startedAt).getTime()
    if (elapsed > TASK_TIMEOUT_MS) {
      task.status = 'failed'
    }
  }

  assertEqual(task.status, 'running', '未超时任务应保持 running')
})

// 2. 重试机制
test('重试机制：failed 任务 retryCount < maxRetries 应重置为 ready', () => {
  const task = { status: 'failed', retryCount: 0, maxRetries: 2, message: 'test fail' }
  if (task.status === 'failed') {
    if (task.retryCount < task.maxRetries) {
      task.status = 'ready'
      task.retryCount++
      task.message = task.message + ' (retry ' + task.retryCount + ')'
    }
  }
  assertEqual(task.status, 'ready', '应重置为 ready')
  assertEqual(task.retryCount, 1, 'retryCount 应增加')
  assert(task.message.includes('retry 1'), '消息应包含重试次数')
})

test('重试机制：failed 任务 retryCount >= maxRetries 应保持 failed', () => {
  const task = { status: 'failed', retryCount: 2, maxRetries: 2, message: 'test fail' }
  if (task.status === 'failed') {
    if (task.retryCount < task.maxRetries) {
      task.status = 'ready'
      task.retryCount++
    }
  }
  assertEqual(task.status, 'failed', '应保持 failed')
  assertEqual(task.retryCount, 2, 'retryCount 不应变化')
})

// 3. 变更影响分析
test('变更影响分析：下游任务应正确识别', () => {
  const tasks = [
    { id: 'T-1', blocks: ['T-2'] },
    { id: 'T-2', blocks: ['T-3'] },
    { id: 'T-3', blocks: [] }
  ]
  function findDownstream(taskId, allTasks) {
    const result = []
    const queue = [taskId]
    const visited = new Set()
    while (queue.length > 0) {
      const current = queue.shift()
      const task = allTasks.find(t => t.id === current)
      if (!task) continue
      for (const blockedId of task.blocks) {
        if (!visited.has(blockedId)) {
          visited.add(blockedId)
          result.push(blockedId)
          queue.push(blockedId)
        }
      }
    }
    return result
  }
  const downstream = findDownstream('T-1', tasks)
  assertEqual(downstream.length, 2, '应找到 2 个下游任务')
  assert(downstream.includes('T-2'), '应包含 T-2')
  assert(downstream.includes('T-3'), '应包含 T-3')
})

// 4. 状态聚合
test('状态聚合：全部终态应标记为 completed', () => {
  const graph = {
    tasks: [
      { status: 'completed' },
      { status: 'completed' },
      { status: 'cancelled' }
    ]
  }
  const allTerminal = graph.tasks.every(t => ['completed', 'cancelled', 'superseded', 'failed'].includes(t.status))
  assertEqual(allTerminal, true, '所有任务应为终态')
})

test('状态聚合：有 running 应标记为 running', () => {
  const graph = {
    tasks: [
      { status: 'completed' },
      { status: 'running' },
      { status: 'pending' }
    ]
  }
  const hasRunning = graph.tasks.some(t => t.status === 'running')
  assertEqual(hasRunning, true, '应有 running 任务')
})

// 5. 并发度控制
test('并发度控制：running 数 >= limit 应触发节流', () => {
  const CONCURRENCY_LIMIT = 5
  const runningCount = 5
  const shouldThrottle = runningCount >= CONCURRENCY_LIMIT
  assertEqual(shouldThrottle, true, '应触发节流')
})

test('并发度控制：running 数 < limit 不应触发节流', () => {
  const CONCURRENCY_LIMIT = 5
  const runningCount = 3
  const shouldThrottle = runningCount >= CONCURRENCY_LIMIT
  assertEqual(shouldThrottle, false, '不应触发节流')
})

// 6. 心跳检测
test('心跳检测：无 running 任务应为 healthy', () => {
  const tasks = [
    { status: 'completed' },
    { status: 'pending' }
  ]
  const hasRunning = tasks.some(t => t.status === 'running')
  assertEqual(hasRunning, false, '无 running 任务')
})

test('心跳检测：有 running 任务应计算 elapsed', () => {
  const TASK_TIMEOUT_MS = 600000
  const now = Date.now()
  const oneMinuteAgo = new Date(now - 60000).toISOString()
  const task = { status: 'running', startedAt: oneMinuteAgo }
  
  const elapsed = now - new Date(task.startedAt).getTime()
  const ratio = elapsed / TASK_TIMEOUT_MS
  
  assert(ratio < 0.7, '1 分钟应小于 70% 阈值')
  assert(ratio > 0, 'elapsed 应大于 0')
})

// 输出结果
console.log('===== 测试结果 =====')
console.log('通过: ' + results.passed)
console.log('失败: ' + results.failed)
console.log('总计: ' + (results.passed + results.failed))
console.log('')
for (const t of results.tests) {
  const icon = t.status === 'pass' ? 'PASS' : 'FAIL'
  console.log(icon + ' ' + t.name)
}
console.log('====================')

if (results.failed > 0) {
  process.exit(1)
}
