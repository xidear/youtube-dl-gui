<template>
  <the-header/>
  <main class="flex‑grow overflow-auto h-full relative bg-base-200">
    <router-view :key="$route.fullPath"/>
    <the-updater/>
  </main>
  <the-footer/>
  <!-- 安装面板：与主页面同时显示，不替换路由 -->
  <teleport to="body">
    <div v-if="installPanelStore.isOpen" class="install-panel-overlay" aria-modal="true" role="dialog">
      <div class="install-panel">
        <install-view panel-mode @close="installPanelStore.close()"/>
      </div>
    </div>
  </teleport>
</template>
<script setup lang="ts">
import TheFooter from '../components/TheFooter.vue';
import TheHeader from '../components/TheHeader.vue';
import TheUpdater from '../components/TheUpdater.vue';
import InstallView from '../views/full/InstallView.vue';
import { useInstallPanelStore } from '../stores/installPanel';
import { ref, watch } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const installPanelStore = useInstallPanelStore();
const transitionName = ref('slide');

let prevIndex = route.meta.index || 0;

watch(
  () => route.fullPath,
  () => {
    const toIndex = route.meta.index ?? 0;
    transitionName.value = toIndex > prevIndex ? 'slide-left' : 'slide-right';
    prevIndex = toIndex;
  },
);
</script>

<style scoped>
.install-panel-overlay {
  position: fixed;
  inset: 0;
  z-index: 100;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--fallback-b2, oklch(0.2 0.02 260 / 0.6));
}
.install-panel {
  width: min(100% - 2rem, 32rem);
  max-height: min(90vh, 36rem);
  overflow: auto;
  background: var(--fallback-b1, oklch(1 0 0));
  border-radius: 0.5rem;
  box-shadow: 0 25px 50px -12px rgb(0 0 0 / 0.25);
}
</style>
<style>
#app {
  @apply flex;
  @apply h-screen;
  @apply flex-col;
}
</style>
