import { createApp, Ref, ref } from 'vue';
import { createPinia } from 'pinia';
import App from './App.vue';
import './app.css';
import router from './router';
import { clearMocks } from '@tauri-apps/api/mocks';
import { installTauriMock } from '../tests/utils/tauriMock';
import tauriListeners from './plugins/tauriListeners';
import { useSettingsStore } from './stores/settings';
import { applyTheme } from './composables/useTheme';
import { mediaHandlers } from '../tests/utils/mocks/mediaHandlers';
import { configHandlers } from '../tests/utils/mocks/configHandlers';
import { binaryHandlers } from '../tests/utils/mocks/binaryHandlers';
import { updateHandlers } from '../tests/utils/mocks/updateHandlers';
import { invoke } from '@tauri-apps/api/core';
import { strongholdHandlers } from '../tests/utils/mocks/strongholdHandlers';
import { getDefaultLocale, i18n } from './i18n';
import { createSentryPiniaPlugin } from '@sentry/vue';
import { createSentry } from './sentry.ts';
import { startWindowWatcher } from './tauri/window.ts';
import { usePreferencesStore } from './stores/preferences.ts';
import { useMediaStore } from './stores/media/media.ts';

const pinia = createPinia();
pinia.use(createSentryPiniaPlugin());
const appReady = ref(false);
const app = createApp(App);
app.provide('appReady', appReady);

createSentry(app);

if (__E2E__) {
  clearMocks();
  installTauriMock({
    ...mediaHandlers,
    ...configHandlers,
    ...binaryHandlers,
    ...updateHandlers,
    ...strongholdHandlers,
  });
}

app.use(i18n);
app.use(router);
app.use(pinia);
app.use(tauriListeners);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    const mediaStore = useMediaStore();
    mediaStore.deleteAllGroups();
  });
}

const settingsStore = useSettingsStore();
const preferencesStore = usePreferencesStore();

// Mount immediately so user sees "正在准备…"; init stores in background then show main UI
app.mount('#app');
initStores()
  .catch((e) => {
    console.error(e);
  })
  .finally(() => {
    console.log('[flow] App initStores finally, setting appReady=true');
    const el = document.getElementById('preparing');
    if (el) el.style.display = 'none';
    appReady.value = true;
    void invoke('app_ready');
    if (!__E2E__) {
      startWindowWatcher();
    }
    console.log('[flow] App appReady set, watch will run');
  });

async function initStores(): Promise<void> {
  try {
    await preferencesStore.load();
  } catch (e) {
    console.error(`Unable to load preferences: ${e}`);
  }

  try {
    const settings = await settingsStore.load();
    if (settings.appearance.theme !== 'system') {
      applyTheme(settings.appearance.theme);
    }
    const locale = i18n.global.locale as unknown as Ref<string>;
    locale.value = settings.appearance.language === 'system'
      ? getDefaultLocale()
      : settings.appearance.language;
    document.documentElement.setAttribute('lang', locale.value);
  } catch (e) {
    console.error(`Unable to load settings: ${e}`);
  }
}
