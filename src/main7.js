import Vue from 'vue'
import App from './App.vue'
import router from './router'
import store from './store'
111
Vue.config.productionTip = false
2233
new Vue({
  router,
  store,
  render: h => h(App)
}).$mount('#app')
