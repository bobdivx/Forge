/**
 * Helpers de classification des identifiants Google Gemini.
 *
 * La liste réelle des modèles n'est PAS stockée ici : elle est récupérée
 * dynamiquement via `fetchGeminiAvailableModels` (`GET /v1beta/openai/models`)
 * dans `gemini-provider.ts`.
 *
 * Ce module se contente de :
 *  - reconnaître un identifiant Gemini (préfixe `gemini-` ou `models/gemini-`)
 *  - normaliser l'identifiant en retirant un éventuel préfixe `models/`.
 */
export type ForgeGeminiModel = {
  id: string;
  label: string;
};

/** True si l'identifiant désigne un modèle Gemini (préfixe `gemini-` ou `models/gemini-`). */
export function isGeminiModelId(id: string | null | undefined): boolean {
  const v = String(id || '').trim().toLowerCase();
  if (!v) return false;
  return v.startsWith('gemini-') || v.startsWith('models/gemini-');
}

/** Normalise un identifiant Gemini : retire le préfixe `models/` éventuel. */
export function normalizeGeminiModelId(id: string): string {
  const v = String(id || '').trim();
  return v.replace(/^models\//i, '');
}
