import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useInstallPanelStore = defineStore('installPanel', () => {
  const isOpen = ref(false);
  /** 从设置页「重新下载」打开时为 true，安装页会拉列表且不自动开始下载 */
  const forceBinaries = ref(false);
  /** 从设置页「重新下载辅助软件」进入安装页时为 true：不显示重试按钮，失败时每项显示手动下载链接 */
  const fromRedownload = ref(false);

  function open(options?: { forceBinaries?: boolean }) {
    forceBinaries.value = options?.forceBinaries ?? false;
    isOpen.value = true;
  }

  function close() {
    isOpen.value = false;
    forceBinaries.value = false;
    fromRedownload.value = false;
  }

  /** 设置「来自重新下载」并跳转安装页时调用，离开安装页时清除 */
  function setFromRedownload(value: boolean) {
    fromRedownload.value = value;
  }

  return { isOpen, forceBinaries, fromRedownload, open, close, setFromRedownload };
});
