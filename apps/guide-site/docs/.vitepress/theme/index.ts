import DefaultTheme from 'vitepress/theme'
import AdminFeedbackManager from './AdminFeedbackManager.vue'
import AdminPricingConfig from './AdminPricingConfig.vue'
import AdminSettings from './AdminSettings.vue'
import AdminShell from './AdminShell.vue'
import ModelPlayground from './ModelPlayground.vue'
import ModelPricingBoard from './ModelPricingBoard.vue'
import OnlineFeedback from './OnlineFeedback.vue'
import './custom.css'

export default {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    app.component('AdminFeedbackManager', AdminFeedbackManager)
    app.component('AdminPricingConfig', AdminPricingConfig)
    app.component('AdminSettings', AdminSettings)
    app.component('AdminShell', AdminShell)
    app.component('ModelPlayground', ModelPlayground)
    app.component('ModelPricingBoard', ModelPricingBoard)
    app.component('OnlineFeedback', OnlineFeedback)
  }
}
