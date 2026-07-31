## 2026-06-19 - Accessible Icon Buttons
**Learning:** The project relies heavily on icon-only buttons that use title attributes but lack aria-labels and keyboard focus indicators.
**Action:** Always verify that icon-only buttons include an aria-label, aria-hidden="true" on the inner SVG, and focus-visible utility classes for keyboard accessibility.
