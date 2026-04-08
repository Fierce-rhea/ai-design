> **🚨 强制指令：所有输出必须使用中文**
> 
> - 所有回复、解释、说明必须使用中文
> - 代码注释必须使用中文
> - 提交信息、日志必须使用中文
> - 与用户的所有交互默认中文，除非用户明确要求其他语言
> - **此规则优先级最高，不可忽略**

---

# AI Agent Team - ClawTeam + OpenCode

本项目使用 **ClawTeam + OpenCode** 作为 AI Agent 协作框架。

## 🦞 ClawTeam 架构

```
┌─────────────────────────────────────────────────────┐
│                    ClawTeam                          │
├─────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐ │
│  │  SOUL.md    │  │  SOUL.md    │  │  SOUL.md    │ │
│  │ (人格定义)  │  │ (人格定义)  │  │ (人格定义)  │ │
│  ├─────────────┤  ├─────────────┤  ├─────────────┤ │
│  │ memory.md   │  │ memory.md   │  │ memory.md   │ │
│  │ (独立记忆)  │  │ (独立记忆)  │  │ (独立记忆)  │ │
│  └─────────────┘  └─────────────┘  └─────────────┘ │
│                                                     │
│  ┌─────────────────────────────────────────────┐   │
│  │         shared/project-context.md           │   │
│  │              (共享上下文)                   │   │
│  └─────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
```

## 🚀 启动方式

### 方式一：使用 npm scripts（推荐）

```bash
# 首次使用：配置 OpenClaw
npm run clawteam:setup

# 启动编排者（主编排器，与用户交互）
npm run clawteam:start

# 启动所有 agent
npm run clawteam:start:all

# 查看 agent 状态
npm run clawteam:status
```

### 方式二：直接使用 openclaw CLI

```bash
openclaw start --agent orchestrator
```

---

## 👥 Agent 团队

| Agent | 角色 | SOUL.md | 职责 |
|-------|------|---------|------|
| **orchestrator** | 编排者 | `.clawteam/agents/orchestrator/SOUL.md` | 项目经理，调度中枢 |
| **product-manager** | 产品经理 | `.clawteam/agents/product-manager/SOUL.md` | 需求分析、PRD 输出 |
| **ui-designer** | UI设计师 | `.clawteam/agents/ui-designer/SOUL.md` | 视觉设计、布局规范 |
| **frontend-expert** | 前端专家 | `.clawteam/agents/frontend-expert/SOUL.md` | Vue 2 组件开发 |
| **qa-engineer** | 测试专家 | `.clawteam/agents/qa-engineer/SOUL.md` | 构建验证、质量检查 |

## 📁 目录结构

```
.clawteam/
├── openclaw.json           # 主配置文件
├── agents/                 # Agent 定义
│   ├── orchestrator/
│   │   └── SOUL.md
│   ├── product-manager/
│   │   └── SOUL.md
│   ├── ui-designer/
│   │   └── SOUL.md
│   ├── frontend-expert/
│   │   └── SOUL.md
│   └── qa-engineer/
│       └── SOUL.md
├── memory/                 # Agent 记忆
│   ├── orchestrator.md
│   ├── product-manager.md
│   ├── ui-designer.md
│   ├── frontend-expert.md
│   └── qa-engineer.md
├── shared/                  # 共享上下文
│   └── project-context.md
├── work/                    # 工作产出
│   ├── prd.md              # 产品需求文档
│   ├── design.md           # 设计规范
│   ├── qa-report.md        # 测试报告
│   └── backups/            # 代码备份
└── logs/                    # 日志
```

## 🔄 工作流程

```
用户需求
    │
    ▼
┌─────────────────────────────────────┐
│  🎯 编排者 (orchestrator)            │
│  - 分析需求                          │
│  - 创建任务计划                      │
│  - 调度团队成员                      │
└─────────────────────────────────────┘
    │
    ├─────────────────────────────────┐
    │                                 │
    ▼                                 ▼
┌───────────────────┐     ┌───────────────────┐
│ 💼 产品经理        │     │ 🎨 UI 设计师      │
│ product-manager   │     │ ui-designer      │
│ 输出: prd.md      │     │ 输出: design.md  │
└───────────────────┘     └───────────────────┘
    │                                 │
    │         并行完成后              │
    ▼                                 ▼
┌─────────────────────────────────────┐
│  💻 前端专家 (frontend-expert)       │
│  输出: src/ 下的 Vue 组件            │
└─────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────┐
│  🧪 测试专家 (qa-engineer)            │
│  输出: qa-report.md                 │
└─────────────────────────────────────┘
```

## 🎯 委派格式

编排者使用以下格式委派任务：

```
→ DELEGATE product-manager: 为用户登录功能创建 PRD
→ DELEGATE ui-designer: 基于登录需求设计界面
→ DELEGATE frontend-expert: 实现登录页面 Vue 组件
→ DELEGATE qa-engineer: 验证登录功能构建
```

## 📋 产出物

| Agent | 输出文件 |
|-------|----------|
| 产品经理 | `.clawteam/work/prd.md` |
| UI设计师 | `.clawteam/work/design.md` |
| 前端专家 | `src/views/` 或 `src/components/` 下的文件 |
| 测试专家 | `.clawteam/work/qa-report.md` |

---

## ⚙️ 配置说明

### OpenClaw + OpenCode 集成

在 `.clawteam/openclaw.json` 中配置：

```json
{
  "env": {
    "OPENCODE_API_KEY": "${OPENCODE_API_KEY}"
  },
  "agents": {
    "orchestrator": {
      "model": {
        "primary": "opencode/claude-opus-4-6"
      }
    }
  }
}
```

### 环境变量

```bash
# 设置 OpenCode API Key
export OPENCODE_API_KEY="your-api-key"
```

---

## 🔧 常用命令

| 命令 | 说明 |
|------|------|
| `npm run clawteam:setup` | 首次配置 OpenClaw |
| `npm run clawteam:start` | 启动编排者 |
| `npm run clawteam:start:all` | 启动所有 agent |
| `npm run clawteam:status` | 查看状态 |
| `npm run dev` | 启动开发服务器 |
| `npm run build` | 生产构建 |

---

## 📚 相关资源

- [OpenClaw 文档](https://docs.openclaw.ai)
- [OpenCode 文档](https://opencode.ai/docs/)
- [ClawTeam GitHub](https://github.com/win4r/ClawTeam-OpenClaw)

---

## ⚠️ 注意

1. **ClawTeam 是主编排层**：编排者（orchestrator）负责接收用户需求并调度团队
2. **OpenCode 是后端执行层**：ClawTeam 使用 OpenCode 作为 LLM backend
3. **并行执行**：产品经理和 UI 设计师可以并行工作
4. **顺序依赖**：前端专家依赖前两者的产出，测试专家依赖前端完成

