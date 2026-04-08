<template>
  <div class="login-page">
    <div class="login-background">
      <div class="login-container">
        <div class="login-logo">
          <svg class="login-logo__icon" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="40" height="40" rx="8" fill="#409EFF" />
            <path d="M16 24L22 30L34 18" stroke="#fff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span class="login-logo__text">AI Design Platform</span>
        </div>

        <div class="login-card">
          <div class="login-card__header">
            <h1 class="login-card__title">欢迎登录</h1>
            <p class="login-card__subtitle">请输入您的账号信息</p>
          </div>

          <el-form
            ref="loginForm"
            :model="loginForm"
            :rules="loginRules"
            class="login-card__form"
            @keyup.enter.native="handleLogin"
          >
            <el-form-item prop="username">
              <el-input
                v-model="loginForm.username"
                prefix-icon="el-icon-user"
                placeholder="请输入用户名"
                size="default"
                clearable
              />
            </el-form-item>

            <el-form-item prop="password">
              <el-input
                v-model="loginForm.password"
                prefix-icon="el-icon-lock"
                type="password"
                placeholder="请输入密码"
                size="default"
                show-password
              />
            </el-form-item>

            <div class="login-card__options">
              <el-checkbox v-model="loginForm.rememberMe">记住我</el-checkbox>
              <a class="login-card__forgot" @click.prevent="handleForgotPassword">忘记密码？</a>
            </div>

            <el-form-item>
              <el-button
                type="primary"
                size="default"
                class="login-card__submit"
                :loading="loading"
                :disabled="!isFormValid"
                @click="handleLogin"
              >
                {{ loading ? '登录中...' : '登 录' }}
              </el-button>
            </el-form-item>
          </el-form>
        </div>

        <p class="login-footer">© 2026 AI Design Platform. All rights reserved.</p>
      </div>
    </div>
  </div>
</template>

<script>
export default {
  name: 'LoginPage',

  data() {
    return {
      loginForm: {
        username: '',
        password: '',
        rememberMe: false
      },
      loginRules: {
        username: [
          { required: true, message: '请输入用户名', trigger: 'blur' }
        ],
        password: [
          { required: true, message: '请输入密码', trigger: 'blur' }
        ]
      },
      loading: false
    }
  },

  computed: {
    isFormValid() {
      return this.loginForm.username && this.loginForm.password
    }
  },

  created() {
    this.loadRememberedUsername()
  },

  methods: {
    loadRememberedUsername() {
      const remembered = localStorage.getItem('remember_username')
      if (remembered) {
        this.loginForm.username = remembered
        this.loginForm.rememberMe = true
      }
    },

    handleLogin() {
      this.$refs.loginForm.validate(async valid => {
        if (!valid) return

        this.loading = true

        try {
          await this.$store.dispatch('user/login', {
            username: this.loginForm.username,
            password: this.loginForm.password
          })

          if (this.loginForm.rememberMe) {
            localStorage.setItem('remember_username', this.loginForm.username)
          } else {
            localStorage.removeItem('remember_username')
          }

          this.$message.success('登录成功')

          const redirect = this.$route.query.redirect || '/'
          this.$router.replace(redirect)
        } catch (error) {
          this.$message.error(error.message || '登录失败，请重试')
        } finally {
          this.loading = false
        }
      })
    },

    handleForgotPassword() {
      this.$message.info('忘记密码功能即将上线，敬请期待')
    }
  }
}
</script>

<style scoped>
.login-page {
  width: 100%;
  height: 100%;
  overflow: auto;
}

.login-background {
  width: 100%;
  min-height: 100vh;
  background: linear-gradient(135deg, #E8F0FE 0%, #D4E4FF 50%, #E0E8FF 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.login-container {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.login-logo {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 24px;
}

.login-logo__icon {
  width: 40px;
  height: 40px;
}

.login-logo__text {
  font-size: 22px;
  font-weight: 600;
  color: #303133;
  white-space: nowrap;
}

.login-card {
  width: 100%;
  background: #FFFFFF;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.08), 0 2px 8px rgba(0, 0, 0, 0.04);
  padding: 40px 48px;
  animation: slideUp 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

@keyframes slideUp {
  from {
    opacity: 0;
    transform: translateY(20px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.login-card__header {
  text-align: center;
  margin-bottom: 24px;
}

.login-card__title {
  font-size: 28px;
  font-weight: 600;
  color: #303133;
  line-height: 36px;
  margin-bottom: 8px;
}

.login-card__subtitle {
  font-size: 14px;
  color: #909399;
  line-height: 22px;
}

.login-card__options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.login-card__forgot {
  font-size: 14px;
  color: #409EFF;
  text-decoration: none;
  cursor: pointer;
  transition: color 0.2s ease;
}

.login-card__forgot:hover {
  color: #66B1FF;
}

.login-card__submit {
  width: 100%;
  height: 40px;
  font-size: 14px;
  font-weight: 500;
}

.login-footer {
  margin-top: 32px;
  font-size: 12px;
  color: #909399;
  line-height: 18px;
  text-align: center;
}

@media (max-width: 767px) {
  .login-background {
    padding: 0;
  }

  .login-container {
    max-width: 100%;
  }

  .login-card {
    border-radius: 0;
    padding: 24px 20px;
  }

  .login-card__title {
    font-size: 24px;
  }

  .login-logo {
    margin-bottom: 16px;
  }

  .login-logo__text {
    font-size: 18px;
  }
}

@media (min-width: 768px) and (max-width: 1023px) {
  .login-container {
    width: 90%;
    max-width: 420px;
  }

  .login-card {
    padding: 32px 36px;
  }
}
</style>
