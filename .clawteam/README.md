# ClawTeam 多 Agent 协作

基于 ClawTeam 框架的多 Agent 团队编排，用于前端开发自动化。

## 目录结构

```
.clawteam/
├── agents/        # Agent 定义（从 .opencode/agents 复制）
├── skills/        # ClawTeam skill 扩展
├── scripts/       # 便捷启动脚本
└── teams/         # 团队模板
```

## 快速开始

### 1. 启动登录页面开发

```bash
.clawteam/scripts/launch-login.sh "开发一个登录页面"
```

### 2. 手动派发任务

```bash
# 创建团队
.clawteam/scripts/oh team spawn-team login-dev -d "登录页面" -n leader

# 派发 PRD 任务
.clawteam/scripts/oh spawn tmux claude --team login-dev --agent-name prd-agent --task "输出 PRD 到 .opencode/work/prd.md"

# 派发 UI 任务
.clawteam/scripts/oh spawn tmux claude --team login-dev --agent-name ui-agent --task "输出设计到 .opencode/work/design.md"

# 等待完成后派发代码任务（依赖 prd + ui）
.clawteam/scripts/oh task wait login-dev --task prd-agent
.clawteam/scripts/oh spawn tmux claude --team login-dev --agent-name code-agent --task "开发 Vue 代码"
```

### 3. 监控团队

```bash
# 实时看板
.clawteam/scripts/oh board serve --port 8080

# tmux 面板视图
.clawteam/scripts/oh board attach login-dev
```

## 常用命令

| 命令 | 说明 |
|------|------|
| `oh team list` | 列出所有团队 |
| `oh task list <team>` | 列出团队任务 |
| `oh inbox receive <team>` | 接收消息 |
| `oh board show <team>` | 显示看板 |

## 依赖说明

- **tmux**: 必须安装（`brew install tmux`）
- **ClawTeam**: 已通过 pipx 安装
- **Claude Code**: 需安装在 PATH 中
