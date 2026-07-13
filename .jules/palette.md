## 2024-07-13 - Icon-only buttons accessibility pattern
**Learning:** Icon-only buttons lacking ARIA labels or focus rings significantly degrade the experience for screen reader users and keyboard navigators.
**Action:** Always add `aria-label` to icon-only buttons, wrap the internal text icon or SVG with `aria-hidden="true"`, and apply `focus-visible` classes (like `focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#175B37]`) to improve visibility.
