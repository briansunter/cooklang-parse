import type { Theme } from 'vitepress'
import DefaultTheme from 'vitepress/theme'
import './tailwind.css'

const theme: Theme = {
  extends: DefaultTheme,
  enhanceApp({ app }) {
    // React components will be mounted via Vue wrapper components
  },
}

export default theme
