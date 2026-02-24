<template>
  <router-view/>
  <the-toaster/>
</template>

<script setup lang="ts">
import TheToaster from './components/TheToaster.vue';
import { useBinariesStore } from './stores/binaries';
import { useRouter } from 'vue-router';
import { useUpdaterStore } from './stores/updater';
import { useStrongholdStore } from './stores/stronghold';
import { useDragDrop } from './composables/useDragDrop.ts';

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

try {
  void checkTools();
} catch (e) {
  console.error(e);
}

try {
  void strongholdStore.loadStatus();
} catch (e) {
  console.error(e);
}

if (ENABLE_UPDATE_CHECK) {
  void checkUpdates();
}
</script>
