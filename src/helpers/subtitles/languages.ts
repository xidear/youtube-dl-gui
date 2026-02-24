import ISO6391 from 'iso-639-1';

export interface SubtitleLanguageOption {
  code: string;
  englishName: string;
  nativeName: string;
}

const codes = ISO6391.getAllCodes();
const expanded_codes: Record<string, SubtitleLanguageOption> = {
  'pt-BR': { code: 'pt-BR', englishName: 'Portuguese (Brazil)', nativeName: 'Português (Brasil)' },
  'zh-TW': { code: 'zh-TW', englishName: 'Traditional Chinese (Taiwan)', nativeName: '繁體中文（台灣）' },
  'zh-CN': { code: 'zh-CN', englishName: 'Simplified Chinese (China)', nativeName: '简体中文（中国）' },
};

export const languageOptions: SubtitleLanguageOption[] = [...codes, ...Object.keys(expanded_codes)]
  .map((code) => {
    if (expanded_codes[code]) return expanded_codes[code];

    const englishName = ISO6391.getName(code);
    const nativeName = ISO6391.getNativeName(code);

    return {
      code,
      englishName,
      nativeName,
    };
  })
  .sort((a, b) => a.englishName.localeCompare(b.englishName));

export const languageOptionsLookup = new Map(
  languageOptions.map(option => [option.code, option] as const),
);

/** Returns BCP 47 tags from the browser (e.g. ["zh-CN", "en-US", "en"]), normalized. */
export function detectBrowserLanguageCodes(): string[] {
  const candidates = navigator?.languages?.length
    ? [...navigator.languages]
    : navigator.language
      ? [navigator.language]
      : [];
  const normalized = new Set<string>();

  for (const candidate of candidates) {
    if (!candidate) continue;
    const parts = candidate.split('-');
    const primary = parts[0]?.toLowerCase();
    const region = parts[1]?.toUpperCase();
    if (!primary || !ISO6391.validate(primary)) continue;
    normalized.add(region ? `${primary}-${region}` : primary);
  }

  return Array.from(normalized);
}
