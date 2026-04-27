export type UiLanguage = 'fr' | 'en';

export const UI_LANGUAGE_STORAGE_KEY = 'forge.ui.language';

export function normalizeUiLanguage(input: unknown): UiLanguage {
  return String(input || '').trim().toLowerCase() === 'en' ? 'en' : 'fr';
}

export function readUiLanguage(): UiLanguage {
  if (typeof window === 'undefined') return 'fr';
  try {
    return normalizeUiLanguage(window.localStorage.getItem(UI_LANGUAGE_STORAGE_KEY));
  } catch {
    return 'fr';
  }
}

export function writeUiLanguage(lang: UiLanguage): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, lang);
    window.dispatchEvent(new CustomEvent('forge-ui-language-changed', { detail: { lang } }));
  } catch {
    // no-op
  }
}
