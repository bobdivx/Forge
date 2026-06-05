## 2024-06-05 - Focus Rings and ARIA labels on Icon Buttons
**Learning:** Found a specific pattern in the application where icon-only buttons (like Start/Stop, Pause, or Setup buttons) lack accessible labels and focus ring styles.
**Action:** Applied `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]` classes to provide visible keyboard navigation outlines, and added `aria-label` along with `aria-hidden="true"` on internal SVG icons to ensure screen reader compatibility for all icon-only buttons.
