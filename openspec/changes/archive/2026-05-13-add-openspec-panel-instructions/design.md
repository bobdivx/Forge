# Design : panneau OpenSpec (page Instructions)

## Approach

- **SSR Astro** : la page est déjà `prerender = false` ; l’encart est du HTML statique dans `instructions.astro` (pas de Preact requis : pas d’état client).
- **Présentation** : réutiliser les classes déjà présentes sur la page (`bg-white`, bordures, `rounded-[1.5rem]`) pour rester cohérent avec l’éditeur.
- **Progressive disclosure** : utiliser `<details>` / `<summary>` natif pour ne pas allonger verticalement la page pour les utilisateurs qui connaissent déjà OpenSpec.
- **Contenu** : listes courtes — chemins relatifs au dépôt, commandes `/opsx:propose`, `/opsx:apply`, `/opsx:archive`, `/opsx:explore`, renvoi vers la doc GitHub si besoin.

## Alternatives considérées

| Option | Raison d’écart |
|--------|------------------|
| Preact widget | Sur-ingénierie pour du contenu statique ; la page n’a pas besoin d’hydratation supplémentaire. |
| API `GET /api/openspec/...` | Lecture disque + spawn CLI ou parsing ; utile plus tard, hors scope MVP. |
| DaisyUI `collapse` avec focus JS | `<details>` suffit et évite une dépendance au JS du thème. |

## Files touched (implémentation prévue)

- `src/pages/agents/instructions.astro` — insertion de la section entre l’en-tête et l’éditeur (ou sous l’éditeur ; préférence **avant** l’éditeur pour visibilité).

## Testing

- Vérification manuelle : `/agents/instructions` affiche l’encart, le summary s’ouvre/ferme, pas d’erreur console liée au layout.
