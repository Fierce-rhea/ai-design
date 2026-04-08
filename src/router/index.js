import Vue from 'vue'
import VueRouter from 'vue-router'
import store from '../store'

Vue.use(VueRouter)

const routes = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('../views/Login.vue'),
    meta: { title: '登录', requiresAuth: false }
  },
  {
    path: '/',
    name: 'Home',
    component: () => import('../views/Home.vue'),
    meta: { title: '首页', requiresAuth: true }
  }
]

const router = new VueRouter({
  mode: 'history',
  routes
})

// 全局前置守卫
router.beforeEach((to, from, next) => {
  // 设置页面标题
  document.title = to.meta.title ? `${to.meta.title} - AI Design Platform` : 'AI Design Platform'

  const requiresAuth = to.meta.requiresAuth !== false
  const token = store.state.user.token

  if (requiresAuth && !token) {
    // 未登录且访问需要认证的页面，重定向到登录页
    next({
      path: '/login',
      query: { redirect: to.fullPath }
    })
  } else if (to.path === '/login' && token) {
    // 已登录用户访问登录页，直接跳转首页
    next('/')
  } else {
    next()
  }
})

export default router
