# 临时修改恢复说明

本仓库为“仅保留英文与简中”做过临时修改，恢复时按下面内容还原即可。

---

## 1. 前端语言 `src/i18n.ts`

- **恢复步骤**：取消所有被注释的 locale 的 `import`；把 `availableLocales` 和 `messages` 改为下面“原始内容”。
- **availableLocales 原始内容**：
  ```ts
  export const availableLocales: Record<string, boolean> = {
    'en': true, 'es': true, 'nl': true, 'it': true, 'fr': true, 'de': true, 'nb': true, 'ru': true, 'pt-BR': true, 'zh-TW': true, 'zh-CN': true,
  } as const;
  ```
- **messages 原始内容**（在 createI18n 的 messages 里）：
  ```ts
  messages: {
    en,
    es,
    nl,
    it,
    fr,
    de,
    nb,
    ru,
    'pt-BR': ptBR,
    'zh-TW': zhTW,
    'zh-CN': zhCN,
  },
  ```
- 文件内已用 `// 恢复用:` 标出对应行，便于查找。

---

## 2. NSIS 安装器语言 `src-tauri/tauri.conf.json`

- **位置**：`bundle.windows.nsis.languages`
- **当前（临时）**：`["English", "SimpChinese"]`
- **恢复为原始内容**：
  ```json
  "languages": ["English", "Spanish", "Italian", "Dutch", "French", "German", "Russian", "PortugueseBR", "SimpChinese"]
  ```

---

## 3. 其它临时修改（若做过）

- **版本更新检测**：`src/App.vue` 中 `ENABLE_UPDATE_CHECK = false` → 恢复为 `true`。
- **设置页“检查应用更新”选项**：`src/components/settings/SettingsUpdate.vue` 中把“检查应用更新”整块从 HTML 注释里放出来。

恢复时按上述 1、2（以及 3 若适用）改回即可。
