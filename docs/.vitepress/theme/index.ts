import DefaultTheme from 'vitepress/theme'
import ModelPlayground from './ModelPlayground.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('ModelPlayground', ModelPlayground)
  }
}
