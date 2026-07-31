
## 2024-05-23 - Enhanced Accessibility of Icon-Only Composer Buttons
**Learning:** Textual icons (like `>`) and raw SVG icons inside buttons are frequently missed by screen readers or read confusingly without appropriate ARIA labels and `aria-hidden` attributes. Keyboard focus visibility must also be explicitly set for a fully accessible interface.
**Action:** When adding or updating icon-only buttons, always ensure they have an `aria-label`, an optional `title` for hover, `aria-hidden="true"` on the internal icon elements, and `focus-visible` styling (`focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]`).
