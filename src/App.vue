<template>
  <div v-if="!appReady" class="preparing-screen" aria-live="polite">
    <p class="preparing-text">{{ t('app.preparing') }}</p>
  </div>
  <template v-else>
    <router-view/>
    <the-toaster/>
  </template>
</template>

<script setup lang="ts">
import TheToaster from './components/TheToaster.vue';
import { inject, watch } from 'vue';
import { useBinariesStore } from './stores/binaries';
import { useRouter } from 'vue-router';
import { useUpdaterStore } from './stores/updater';
import { useStrongholdStore } from './stores/stronghold';
import { useDragDrop } from './composables/useDragDrop.ts';
import { useI18n } from 'vue-i18n';
import { nextTick } from 'vue';

const { t } = useI18n();
const appReady = inject<{ value: boolean }>('appReady', { value: false });

const router = useRouter();
const binariesStore = useBinariesStore();
const updaterStore = useUpdaterStore();
const strongholdStore = useStrongholdStore();

useDragDrop();

/** 临时设为 false 可屏蔽启动时版本更新检测 */
const ENABLE_UPDATE_CHECK = false;

const checkTools = async () => {
  const toolsToEnsure = await binariesStore.check();
  if (toolsToEnsure.length > 0) {
    await router.push('/install');
  }
};

const checkUpdates = async () => {
  try {
    await updaterStore.check();
  } catch (e) {
    console.warn('Unable to check for updates:', e);
  }
};

/** 等窗口与「正在准备…」渲染完成后再检查；需释放时再跳安装页并在该页释放，避免启动卡死、用户能看到 loading */
watch(
  () => appReady.value,
  (ready) => {
    if (!ready) return;
    nextTick(() => {
      requestAnimationFrame(() => {
        void checkTools();
        try {
          void strongholdStore.loadStatus();
        } catch (e) {
          console.error(e);
        }
        if (ENABLE_UPDATE_CHECK) {
          void checkUpdates();
        }
      });
    });
  },
  { immediate: true },
);
</script>

<style scoped>
.preparing-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  margin: 0;
}
.preparing-text {
  font-size: 1.125rem;
  color: var(--fallback-p, #64748b);
}
</style>
