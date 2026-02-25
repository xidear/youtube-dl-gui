<template>
  <base-sub-nav :backButton="false" class="bg-base-300">
    <template v-slot:default>
      <base-button v-if="panelMode" type="button" class="btn-soft whitespace-nowrap" @click="onContinue">
        <x-mark-icon class="w-4 h-4"/> {{ t('common.close') }}
      </base-button>
      <!-- 仅当下载进程已结束时显示按钮；未开始或进行中时全部隐藏 -->
      <template v-if="!isInstalling">
        <template v-if="hasRetry">
          <base-button v-if="panelMode" type="button" class="btn-subtle whitespace-nowrap" @click="onContinue">
            {{ t('common.continue') }} <arrow-right-icon class="w-4 h-4"/>
          </base-button>
          <base-button v-else class="btn-subtle whitespace-nowrap" to="/">
            {{ t('common.continue') }} <arrow-right-icon class="w-4 h-4"/>
          </base-button>
        </template>
        <base-button v-else-if="panelMode" type="button" class="btn-primary whitespace-nowrap" @click="onContinue">
          {{ t('common.parenthesis', { content: waitTime }) }} {{ t('common.continue') }} <arrow-right-icon class="w-4 h-4"/>
        </base-button>
        <base-button v-else class="btn-primary whitespace-nowrap" to="/">
          {{ t('common.parenthesis', { content: waitTime }) }} {{ t('common.continue') }} <arrow-right-icon class="w-4 h-4"/>
        </base-button>
      </template>
    </template>
    <template v-slot:title>
      <div class="w-full">
        <h1 v-if="isInstalling" class="text-lg font-semibold self-center">{{ t('install.title.installing') }}</h1>
        <h1 v-else-if="hasRetry" class="text-lg font-semibold self-center">{{ t('install.title.failed') }}</h1>
        <h1 v-else class="text-lg font-semibold self-center">{{ t('install.title.installed') }}</h1>
        <p v-if="isInstalling">{{ t('install.subtitle.installing') }}</p>
        <p v-if="isInstalling && networkWaitSeconds > 0" class="install-waiting-network">
          {{ t('install.waitingNetwork', { seconds: networkWaitSeconds }) }}
        </p>
        <p v-else-if="!isInstalling && hasRetry">{{ t('install.subtitle.failed') }} {{ fromRedownload ? '' : t('install.retryOnReconnect') }}</p>
        <p v-else-if="!isInstalling">{{ t('install.subtitle.installed') }}</p>
        <div v-if="isInstalling" class="install-progress-bar" role="progressbar" aria-valuenow="0" aria-valuemin="0" aria-valuemax="100"/>
      </div>
    </template>
  </base-sub-nav>
  <div class="flex flex-col gap-4 p-4">
    <tool-card
      v-for="[name, tool] in Object.entries(tools)"
      :key="name"
      :tool="tool"
      :name="name"
      :can-retry="false"
      :show-manual-link="fromRedownload"
      @retry="retryOne(name)"
    />
  </div>
</template>

<script setup lang="ts">
import { useBinariesStore } from '../../stores/binaries';
import { ArrowRightIcon } from '@heroicons/vue/24/solid';
import { XMarkIcon } from '@heroicons/vue/24/solid';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import BaseSubNav from '../../components/base/BaseSubNav.vue';
import BaseButton from '../../components/base/BaseButton.vue';
import { useRoute, useRouter } from 'vue-router';
import ToolCard from '../../components/tool-card/ToolCard.vue';
import { useI18n } from 'vue-i18n';
import { useInstallPanelStore } from '../../stores/installPanel';

const props = withDefaults(defineProps<{ panelMode?: boolean }>(), { panelMode: false });
const emit = defineEmits<{ (e: 'close'): void }>();

const { t } = useI18n();
const store = useBinariesStore();
const router = useRouter();
const route = useRoute();
const installPanelStore = useInstallPanelStore();

/** 从设置页「重新下载辅助软件」进入时为 true：不显示重试按钮，失败时提示前往链接手动下载 */
const fromRedownload = computed(() => route.query.redownload === '1' || installPanelStore.fromRedownload);

const tools = computed(() => store.tools);
const isInstalling = ref(true);
const waitTime = ref(5);
const networkWaitSeconds = ref(0);
const lastProgressAt = ref(Date.now());

/** 所有工具都安装成功（percent === 100 且无 error） */
const allDone = computed(() => {
  const list = Object.values(tools.value) as { percent?: number; error?: string }[];
  if (!list.length) return false;
  return list.every(t => (t.percent ?? 0) === 100 && !t.error);
});

/** 是否还有需要处理的项（下载失败或尚未完成） */
const hasRetry = computed(() => {
  const list = Object.values(tools.value) as { percent?: number; error?: string }[];
  if (!list.length) return false;
  return list.some(t => (t.percent ?? 0) !== 100 || !!t.error);
});

/** 需要重下的工具名列表：失败或未完成的项 */
const failedToolNames = computed(() =>
  Object.entries(tools.value)
    .filter(([, x]) => {
      const t = x as { percent?: number; error?: string };
      return (t.percent ?? 0) !== 100 || !!t.error;
    })
    .map(([n]) => n),
);
/** 该项需要下载（待下载或失败），可显示重试并允许点击 */
function toolCanRetry(name: string) {
  const t = store.tools[name] as { percent?: number; error?: string } | undefined;
  if (!t) return false;
  return (t.percent ?? 0) !== 100 || !!t.error;
}

watch(tools, () => { lastProgressAt.value = Date.now(); }, { deep: true });

const STALE_MS = 10000;
const COUNTDOWN_SEC = 5;

/** 只下载 names 里的项，只清这些项的状态 */
async function runDownload(names: string[]) {
  if (names.length === 0) return;
  isInstalling.value = true;
  try {
    await store.ensure(names);
    if (allDone.value) startCountdown();
  } catch (e) {
    const notComplete = names.filter((name) => {
      const tool = store.tools[name];
      return !tool || tool.percent !== 100;
    });
    if (notComplete.length) store.setToolsError(notComplete, e instanceof Error ? e.message : String(e));
    console.error(e);
  } finally {
    isInstalling.value = false;
  }
}

function startCountdown() {
  waitTime.value = COUNTDOWN_SEC;
  const id = setInterval(() => { waitTime.value -= 1; }, 1000);
  if (props.panelMode) {
    setTimeout(() => { clearInterval(id); emit('close'); }, COUNTDOWN_SEC * 1000);
  } else {
    setTimeout(() => { clearInterval(id); void router.push('/'); }, COUNTDOWN_SEC * 1000);
  }
}

function onContinue() {
  if (props.panelMode) emit('close');
  else router.push('/');
}

onMounted(async () => {
  const networkWaitTimer = setInterval(() => {
    if (!isInstalling.value) networkWaitSeconds.value = 0;
    else networkWaitSeconds.value = Date.now() - lastProgressAt.value > STALE_MS ? networkWaitSeconds.value + 1 : 0;
  }, 1000);
  const handleOnline = () => {
    if (!hasRetry.value || fromRedownload.value) return;
    setTimeout(() => {
      if (!hasRetry.value || fromRedownload.value) return;
      runDownload(failedToolNames.value);
    }, 1500);
  };
  window.addEventListener('online', handleOnline);
  onUnmounted(() => {
    window.removeEventListener('online', handleOnline);
    clearInterval(networkWaitTimer);
    installPanelStore.setFromRedownload(false);
  });

  if (route.query.forceBinaries === '1' || (props.panelMode && installPanelStore.forceBinaries)) {
    await store.fetchAndMergeToolList();
    isInstalling.value = false;
    return;
  }
  if (route.query.redownload === '1') {
    await store.check();
    const names = Object.keys(store.tools);
    await runDownload(names);
    return;
  }
  nextTick(() => requestAnimationFrame(async () => {
    const names = Object.keys(tools.value).length ? Object.keys(tools.value) : await store.check();
    await runDownload(names);
  }));
});

function retryOne(name: string) {
  if (!toolCanRetry(name)) return;
  runDownload([name]);
}
</script>

<style scoped>
.install-progress-bar {
  margin-top: 0.5rem;
  height: 4px;
  width: 100%;
  background: var(--fallback-b3, oklch(0.7 0.01 260 / 0.2));
  border-radius: 2px;
  overflow: hidden;
}
.install-progress-bar::after {
  content: "";
  display: block;
  height: 100%;
  width: 40%;
  background: var(--fallback-p, oklch(0.6 0.2 260));
  border-radius: 2px;
  animation: install-progress-run 1.5s ease-in-out infinite;
}
@keyframes install-progress-run {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(350%); }
}
.install-waiting-network {
  animation: install-pulse 1.2s ease-in-out infinite;
}
@keyframes install-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.6; }
}
</style>
