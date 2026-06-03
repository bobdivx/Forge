## 2024-06-03 - [Global Layout Buttons Accessibility]
**Learning:** Found that global layout elements like header notification and messaging buttons were lacking `aria-label`s and `focus-visible` styling, hindering keyboard/screen-reader navigation across all views using this layout.
**Action:** Always ensure that common layout icon-only buttons include `aria-label`s, `focus-visible` ring classes, and that inner SVG elements have `aria-hidden="true"`.
