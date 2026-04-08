# 项目上下文

## 项目信息
- **项目名称**: ai-design
- **项目类型**: Vue 2 前端应用
- **技术栈**: Vue 2.7 + Vite 5 + Vue Router 3 + Vuex 3 + Element UI

## 目录结构
```
src/
├── views/              # 页面组件
├── components/         # 可复用组件
├── router/             # 路由配置
├── store/              # Vuex 状态
└── main.js             # 入口文件
```

## 开发命令
- `npm run dev` - 开发服务器
- `npm run build` - 生产构建
- `npm run preview` - 本地预览

## 代码规范
- 使用 Options API
- 顺序: template → script → style
- 必须声明 name 属性
- 使用 scoped 样式
- 不使用分号，字符串使用单引号
- 2 空格缩进

## 工作流程
产品经理 + UI设计师(并行) → 前端专家 → 测试专家
