<template>
  <div ref="container" class="playground-wrapper">
    <!-- React component will be mounted here -->
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { createElement } from 'react'
import { createRoot } from 'react-dom/client'
import { CooklangPlayground } from './CooklangPlayground'

const container = ref(null)
let root = null

onMounted(() => {
  if (container.value) {
    root = createRoot(container.value)
    root.render(createElement(CooklangPlayground))
  }
})

onUnmounted(() => {
  if (root) {
    root.unmount()
    root = null
  }
})
</script>

<style scoped>
.playground-wrapper {
  margin: 0 -24px;
}

@media (min-width: 640px) {
  .playground-wrapper {
    margin: 0;
  }
}
</style>
