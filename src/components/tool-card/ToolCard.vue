<template>
  <article class="card card-side w-full bg-base-300 shadow-lg">
    <div
        :key="tool.percent === 100 && !hasError ? 'done' : 'progress'"
        class="radial-progress transition-colors m-5 shrink-0"
        :class="{
          'text-success': tool.percent === 100 && !hasError,
          'text-error': hasError,
        }"
        role="progressbar"
        :style="`--value:${tool.percent};--size:5rem;--thickness:.5rem;`"
        :aria-valuenow="tool.percent"
    >
      <span v-if="tool.percent < 100">{{ t('common.percentage', { percent: tool.percent }) }}</span>
      <span v-else-if="hasError"><x-mark-icon class="w-8 h-8 color-error-700"/></span>
      <span v-else><check-icon class="w-8 h-8 color-primary-700"/></span>
    </div>
    <div class="card-body">
      <section class="flex w-full items-center gap-2 mb-2">
        <h2 class="card-title">{{ name }}</h2>
        <span
            v-if="tool.version"
            :title="tool.version"
            class="badge badge-soft overflow-hidden text-ellipsis break-all"
            :class="{ 'badge-error': hasError, 'badge-primary': !hasError }"
        >
          {{ tool.version }}
        </span>
      </section>
      <p v-if="!hasError" class="mt-2">
        {{ t('common.divide', { left: formatBytes(tool.received), right: formatBytes(tool.total) }) }}
        <span v-if="tool.speed != null && tool.percent < 100" class="ml-2 text-base-content/70">
          {{ formatBytesPerSec(tool.speed) }}
        </span>
      </p>
      <details v-else class="collapse collapse-arrow bg-base-200 list-none">
        <summary class="collapse-title font-semibold py-2 px-4">
          {{ t('components.base.toolCard.failed') }}
        </summary>
        <pre class="p-4"><code class="text-wrap">{{ tool.error }}</code></pre>
      </details>
      <p v-if="showManualLink && hasError && manualInfo" class="mt-2">
        {{ t('install.manualDownloadLabel') }}
        <a :href="manualInfo.url" target="_blank" rel="noopener" class="link">{{ manualInfo.url }}</a>
      </p>
      <base-button
        v-if="canRetry"
        type="button"
        class="btn-primary btn-sm mt-2 whitespace-nowrap"
        @click="emit('retry')"
      >
        {{ t('common.retry') }}
      </base-button>
    </div>
  </article>
</template>
<script setup lang="ts">
import { formatBytes, formatBytesPerSec } from '../../helpers/units';
import { CheckIcon, XMarkIcon } from '@heroicons/vue/24/solid';
import { computed, PropType, watch, ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';
import { BinaryProgress, ManualToolInfo } from '../../tauri/types/binaries';
import { useI18n } from 'vue-i18n';
import BaseButton from '../base/BaseButton.vue';

const { t } = useI18n();
const emit = defineEmits<{ retry: [] }>();

const { tool, canRetry, name, showManualLink } = defineProps({
  name: {
    type: String,
    required: true,
  },
  tool: {
    type: Object as PropType<BinaryProgress>,
    required: true,
  },
  /** 是否处于需重试状态（由页面逻辑注入，如强制重新下载时全部为 true） */
  canRetry: {
    type: Boolean,
    default: false,
  },
  /** 为 true 时，若该工具有 error 则显示该工具的手动下载链接 */
  showManualLink: {
    type: Boolean,
    default: false,
  },
});

const hasError = computed(() => !!tool.error);

const manualInfo = ref<ManualToolInfo | null>(null);

async function fetchManualInfo() {
  if (!name || !showManualLink || !hasError.value) return;
  try {
    manualInfo.value = await invoke<ManualToolInfo>('binaries_tool_manual_info', { name });
  } catch {
    manualInfo.value = null;
  }
}

watch([() => name, () => hasError.value, () => showManualLink], () => { void fetchManualInfo(); }, { immediate: true });
</script>

<style scoped>
details > summary::-webkit-details-marker,
details > summary::marker {
  display: none;
}

.collapse-arrow > summary:after {
  top: 1.125rem;
}
</style>
