import { defineStore } from 'pinia';
import {
  BinaryDownloadCompletePayload,
  BinaryDownloadProgressPayload,
  BinaryDownloadStartPayload,
  BinaryProgress,
  BinaryCheckPayload, BinaryDownloadErrorPayload,
} from '../tauri/types/binaries';
import { ref } from 'vue';
import { invoke } from '@tauri-apps/api/core';

export const useBinariesStore = defineStore('binaries', () => {
  const tools = ref<Record<string, BinaryProgress>>({});
  /** 始终检查并释放内置辅助程序（不依赖「更新辅助程序」设置）。 */
  async function check(): Promise<string[]> {
    const result = await invoke<BinaryCheckPayload>('binaries_check');
    tools.value = {};
    for (const tool of result.tools) {
      tools.value[tool] = { total: 0, percent: 0, received: 0 };
    }
    return result.tools;
  }

  async function ensure(toEnsure?: string[]) {
    await invoke<void>('binaries_ensure', { tools: toEnsure ?? Object.keys(tools.value) });
  }

  function ensureToolEntry(toolName: string) {
    if (!tools.value[toolName]) {
      tools.value[toolName] = { total: 0, received: 0, percent: 0 };
    }
  }

  function processBinaryDownloadStart(payload: BinaryDownloadStartPayload) {
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    tool.version = payload.version;
  }

  function processBinaryDownloadProgress(payload: BinaryDownloadProgressPayload) {
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    tool.total = payload.total;
    tool.received = payload.received;
    tool.percent = payload.total > 0 ? Math.round((payload.received / payload.total) * 100) : 0;
  }

  function processBinaryDownloadComplete(payload: BinaryDownloadCompletePayload) {
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    tool.received = tool.total;
    tool.percent = 100;
  }

  function processBinaryDownloadError(payload: BinaryDownloadErrorPayload) {
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    tool.error = `[${payload.stage}] ${payload.error}`;
  }

  return { tools, check, ensure, processBinaryDownloadStart, processBinaryDownloadProgress, processBinaryDownloadError, processBinaryDownloadComplete };
});
