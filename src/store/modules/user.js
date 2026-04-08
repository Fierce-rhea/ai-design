/**
 * 用户认证模块
 * 管理 Token、用户信息、登录/登出逻辑
 */

// 从 localStorage 读取已保存的 Token
const savedToken = localStorage.getItem('auth_token')
const savedUserInfo = localStorage.getItem('auth_user_info')

export default {
  namespaced: true,
  state: {
    token: savedToken || '',
    userInfo: savedUserInfo ? JSON.parse(savedUserInfo) : null
  },
  mutations: {
    // 设置 Token 并持久化
    SET_TOKEN(state, token) {
      state.token = token
      localStorage.setItem('auth_token', token)
    },
    // 设置用户信息并持久化
    SET_USER_INFO(state, userInfo) {
      state.userInfo = userInfo
      localStorage.setItem('auth_user_info', JSON.stringify(userInfo))
    },
    // 清除所有认证信息
    CLEAR_AUTH(state) {
      state.token = ''
      state.userInfo = null
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user_info')
    }
  },
  actions: {
    /**
     * 登录动作
     * @param {Object} context - Vuex context
     * @param {Object} params - { username, password }
     * @returns {Promise}
     */
    login({ commit }, { username, password }) {
      // TODO: 替换为真实 API 调用
      // return api.post('/api/auth/login', { username, password })
      return new Promise((resolve, reject) => {
        setTimeout(() => {
          // 模拟登录逻辑（开发阶段使用）
          if (username === 'admin' && password === '123456') {
            const mockData = {
              token: 'mock-jwt-token-' + Date.now(),
              expiresIn: 7200,
              userInfo: {
                userId: '1',
                username: 'admin',
                nickname: '管理员',
                avatar: '',
                roles: ['admin']
              }
            }
            commit('SET_TOKEN', mockData.token)
            commit('SET_USER_INFO', mockData.userInfo)
            resolve(mockData)
          } else {
            reject(new Error('用户名或密码错误'))
          }
        }, 1000)
      })
    },
    /**
     * 登出动作
     */
    logout({ commit }) {
      commit('CLEAR_AUTH')
    }
  },
  getters: {
    isLoggedIn: state => !!state.token
  }
}
