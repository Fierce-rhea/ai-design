<template>
  <div class="home-page">
    <header class="home-header">
      <span class="home-header__title">AI Design Platform</span>
      <div class="home-header__user">
        <span class="home-header__username">{{ nickname }}</span>
        <el-button type="text" @click="handleLogout">退出登录</el-button>
      </div>
    </header>
    <main class="home-content">
      <h1>欢迎回来，{{ nickname }}</h1>
      <p>这是系统首页，功能开发中...</p>
    </main>
  </div>
</template>

<script>
import { mapGetters } from 'vuex'

export default {
  name: 'HomePage',

  computed: {
    ...mapGetters('user', ['isLoggedIn']),
    nickname() {
      return this.$store.state.user.userInfo?.nickname || '用户'
    }
  },

  methods: {
    handleLogout() {
      this.$confirm('确认退出登录？', '提示', {
        confirmButtonText: '确定',
        cancelButtonText: '取消',
        type: 'warning'
      }).then(() => {
        this.$store.dispatch('user/logout')
        this.$router.replace('/login')
        this.$message.success('已退出登录')
      }).catch(() => {})
    }
  }
}
</script>

<style scoped>
.home-page {
  width: 100%;
  min-height: 100vh;
  background: #F5F7FA;
}

.home-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0 24px;
  height: 56px;
  background: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}

.home-header__title {
  font-size: 18px;
  font-weight: 600;
  color: #303133;
}

.home-header__user {
  display: flex;
  align-items: center;
  gap: 16px;
}

.home-header__username {
  font-size: 14px;
  color: #606266;
}

.home-content {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 48px 24px;
}

.home-content h1 {
  font-size: 24px;
  font-weight: 600;
  color: #303133;
  margin-bottom: 12px;
}

.home-content p {
  font-size: 14px;
  color: #909399;
}
</style>
