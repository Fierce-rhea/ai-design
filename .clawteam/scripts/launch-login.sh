#!/bin/bash
# ClawTeam 快速启动脚本 - 登录页面开发

TEAM_NAME="login-dev"
GOAL="${1:-开发一个登录页面}"

echo "🚀 启动 ClawTeam 团队: $TEAM_NAME"
echo "📋 目标: $GOAL"
echo ""

# 方式 1: 使用 TOML 模板（推荐）
echo "📦 使用模板启动团队..."
clawteam launch login-app --team "$TEAM_NAME" --goal "$GOAL"

# 或方式 2: 手动派发
# clawteam team spawn-team "$TEAM_NAME" -d "$GOAL" -n leader
# 
# clawteam spawn tmux claude --team "$TEAM_NAME" --agent-name prd-agent --task "输出 PRD..."
# clawteam spawn tmux claude --team "$TEAM_NAME" --agent-name ui-agent --task "输出 UI..."
# 
# echo "📊 监控团队状态..."
# clawteam board attach "$TEAM_NAME"
