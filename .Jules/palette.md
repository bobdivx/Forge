## 2026-05-15 - Adding aria-label and title to icon-only buttons
**Learning:** Found several modal and tab files using pure SVG icon buttons with no aria-label or title. These components need an accessible name for screen readers. Using both `aria-label` (for screen readers) and `title` (for mouse hover tooltips) provides a universally better experience.
**Action:** When adding icon-only buttons in future features, make sure they have localized (e.g. French) aria-label and title attributes.
