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
  /** 用于计算速度：上次进度 (received, 时间戳) */
  const lastProgress = ref<Record<string, { received: number; at: number }>>({});

  /** 始终检查并释放内置辅助程序（不依赖「更新辅助程序」设置）。
   * 用 allTools 填充 store，用 tools 表示需要下载的项；不在 tools 里的视为已安装（100%）。 */
  async function check(): Promise<string[]> {
    console.log('[flow] binariesStore.check entry, invoking binaries_check');
    let result: BinaryCheckPayload;
    try {
      result = await invoke<BinaryCheckPayload>('binaries_check');
    } catch (e) {
      console.log('[flow] binariesStore.check invoke threw', e);
      throw e;
    }
    console.log('[flow] binariesStore.check invoke returned result.tools=', result.tools, 'result.allTools=', result.allTools);
    tools.value = {};
    for (const tool of result.allTools) {
      tools.value[tool] = { total: 0, percent: 0, received: 0 };
    }
    console.log('[flow] binariesStore.check seeded tools keys=', Object.keys(tools.value));
    const toEnsureSet = new Set(result.tools);
    console.log('[flow] binariesStore.check toEnsureSet size=', toEnsureSet.size, 'toEnsureSet=', result.tools);
    for (const name of result.allTools) {
      if (!toEnsureSet.has(name)) {
        const t = tools.value[name];
        t.total = 1;
        t.received = 1;
        t.percent = 100;
      }
    }
    console.log('[flow] binariesStore.check done, returning result.tools length=', result.tools.length);
    return result.tools;
  }

  async function ensure(toEnsure?: string[], useProxy?: boolean) {
    console.log('[flow] binariesStore.ensure entry toEnsure=', toEnsure, 'useProxy=', useProxy);
    const names = toEnsure ?? Object.keys(tools.value);
    console.log('[flow] binariesStore.ensure names=', names);
    const needDownload = names.filter((name) => {
      const tool = tools.value[name];
      if (!tool) {
        console.log('[flow] binariesStore.ensure needDownload include (no tool)', name);
        return true;
      }
      const need = (tool.percent ?? 0) !== 100 || !!(tool as BinaryProgress).error;
      if (need) console.log('[flow] binariesStore.ensure needDownload include', name, 'percent=', tool.percent, 'error=', (tool as BinaryProgress).error);
      return need;
    });
    console.log('[flow] binariesStore.ensure needDownload=', needDownload);
    if (needDownload.length === 0) {
      console.log('[flow] binariesStore.ensure early return needDownload.length===0');
      return;
    }
    for (const name of needDownload) {
      const tool = tools.value[name];
      if (!tool) continue;
      tool.total = 0;
      tool.received = 0;
      tool.percent = 0;
      if ('error' in tool) {
        delete (tool as BinaryProgress).error;
      }
      if ('speed' in tool) {
        delete (tool as BinaryProgress).speed;
      }
      if (lastProgress.value[name]) {
        delete lastProgress.value[name];
      }
    }
    console.log('[flow] binariesStore.ensure invoking binaries_ensure tools=', needDownload, 'useProxy=', useProxy === true);
    await invoke<void>('binaries_ensure', { tools: needDownload, useProxy: useProxy === true });
    console.log('[flow] binariesStore.ensure invoke returned');
  }

  function seedTools(names: string[]) {
    const map: Record<string, BinaryProgress> = {};
    for (const name of names) {
      map[name] = { total: 0, received: 0, percent: 0 };
    }
    tools.value = map;
  }

  /** 只补全缺失的工具项，不覆盖已有（从设置进安装页时保留 4、5 成功状态） */
  function mergeToolList(names: string[]) {
    for (const name of names) {
      if (!tools.value[name]) {
        tools.value[name] = { total: 0, received: 0, percent: 0 };
      }
    }
  }

  /** 从后端拉取工具列表并合并到当前 tools（用于从设置页跳转安装页时在安装页拉列表） */
  async function fetchAndMergeToolList(): Promise<string[]> {
    const names = await invoke<string[]>('binaries_list');
    mergeToolList(names);
    return names;
  }

  function ensureToolEntry(toolName: string) {
    if (!tools.value[toolName]) {
      tools.value[toolName] = { total: 0, received: 0, percent: 0 };
    }
  }

  function processBinaryDownloadStart(payload: BinaryDownloadStartPayload) {
    console.log('[flow] binariesStore.processBinaryDownloadStart', payload);
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    tool.version = payload.version;
  }

  function processBinaryDownloadProgress(payload: BinaryDownloadProgressPayload) {
    console.log('[flow] binariesStore.processBinaryDownloadProgress', payload.tool, 'received=', payload.received, 'total=', payload.total);
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    const now = Date.now();
    const prev = lastProgress.value[payload.tool];
    if (prev && now > prev.at) {
      const elapsed = (now - prev.at) / 1000;
      if (elapsed > 0) {
        (tool as BinaryProgress).speed = (payload.received - prev.received) / elapsed;
      }
    }
    lastProgress.value[payload.tool] = { received: payload.received, at: now };
    tool.total = payload.total;
    tool.received = payload.received;
    tool.percent = payload.total > 0 ? Math.round((payload.received / payload.total) * 100) : 0;
  }

  function processBinaryDownloadComplete(payload: BinaryDownloadCompletePayload) {
    console.log('[flow] binariesStore.processBinaryDownloadComplete', payload);
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    tool.received = tool.total;
    tool.percent = 100;
    if (lastProgress.value[payload.tool]) {
      delete lastProgress.value[payload.tool];
    }
    if ('speed' in tool) {
      delete (tool as BinaryProgress).speed;
    }
  }

  function processBinaryDownloadError(payload: BinaryDownloadErrorPayload) {
    console.log('[flow] binariesStore.processBinaryDownloadError', payload);
    ensureToolEntry(payload.tool);
    const tool = tools.value[payload.tool];
    tool.error = `[${payload.stage}] ${payload.error}`;
    if (lastProgress.value[payload.tool]) {
      delete lastProgress.value[payload.tool];
    }
    if ('speed' in tool) {
      delete (tool as BinaryProgress).speed;
    }
  }

  /** 前端在 ensure 请求抛错时（如未联网）给指定工具打上 error，便于 hasRetry 一致 */
  function setToolsError(names: string[], message: string) {
    for (const name of names) {
      ensureToolEntry(name);
      (tools.value[name] as BinaryProgress).error = message;
    }
  }

  return { tools, check, ensure, seedTools, mergeToolList, fetchAndMergeToolList, setToolsError, processBinaryDownloadStart, processBinaryDownloadProgress, processBinaryDownloadError, processBinaryDownloadComplete };
});
