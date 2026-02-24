import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
// === 临时仅保留英文与简中。恢复时：取消下面 10 行注释，并恢复 availableLocales / messages 为下方「恢复用」块内容 ===
// import es from './locales/es.json';
// import nl from './locales/nl.json';
// import it from './locales/it.json';
// import fr from './locales/fr.json';
// import de from './locales/de.json';
// import nb from './locales/nb.json';
// import ru from './locales/ru.json';
// import ptBR from './locales/pt-BR.json';
// import zhTW from './locales/zh-TW.json';
import zhCN from './locales/zh-CN.json';
import { detectBrowserLanguageCodes } from './helpers/subtitles/languages.ts';

export const availableLocales: Record<string, boolean> = {
  'en': true,
  'zh-CN': true,
  // 恢复用: 'en': true, 'es': true, 'nl': true, 'it': true, 'fr': true, 'de': true, 'nb': true, 'ru': true, 'pt-BR': true, 'zh-TW': true, 'zh-CN': true,
} as const;

type MessageSchema = typeof en;
export type Locale = keyof typeof availableLocales;

export function getDefaultLocale() {
  for (const tag of detectBrowserLanguageCodes()) {
    if (availableLocales[tag]) return tag;
    const primary = tag.split('-')[0];
    if (availableLocales[primary]) return primary;
  }
  return 'en';
}

export const i18n = createI18n<[MessageSchema], Locale>({
  locale: 'en',
  legacy: false,
  globalInjection: false,
  fallbackLocale: 'en',
  messages: {
    en,
    'zh-CN': zhCN,
    // 恢复用: en, es, nl, it, fr, de, nb, ru, 'pt-BR': ptBR, 'zh-TW': zhTW, 'zh-CN': zhCN,
  },
});
