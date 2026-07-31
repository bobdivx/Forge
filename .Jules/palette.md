## 2024-05-10 - Missing ARIA labels on Icon-only utility buttons
**Learning:** Common utility buttons like modal close elements ("✕", SVGs) and input clearing buttons consistently lack `aria-label` properties, degrading the screen-reader experience.
**Action:** When adding or refactoring utility interactions, proactively evaluate and append `aria-label` (e.g., `aria-label="Fermer"`, `aria-label="Effacer le filtre"`) to icon-only buttons to conform to accessibility standards.
