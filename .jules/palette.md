## 2024-05-24 - Accessibility for Icon-Only Buttons
**Learning:** Icon-only buttons used across settings tabs often lack ARIA labels and proper focus visibility for keyboard navigation, and include SVG paths that screen readers redundantly announce.
**Action:** When updating or creating icon-only buttons, consistently apply `aria-label`, `title`, `aria-hidden="true"` on inner SVGs, and standard focus rings like `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]`.
