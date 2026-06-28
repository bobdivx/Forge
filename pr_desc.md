💡 What
- Refactored the sidebar logo from a `div` with an inline `onclick` handler to a native semantic `<a>` link.
- Added keyboard-friendly `focus-visible` styling (using existing Tailwind classes) to the logo link, messages button, and notifications button.
- Added `focus-within` styling to the search bar wrapper to provide clear visual feedback during input.
- Added proper `aria-label` tags to icon-only interactive elements and explicitly marked decorative SVGs as `aria-hidden="true"`.
- Cleaned up a duplicate width/height class bug on the Messages SVG.

🎯 Why
- These small touches vastly improve keyboard navigation consistency and screen reader usability across the primary application dashboard. Using semantic tags like `<a>` over JS event handlers improves both performance and native browser link behavior.

📸 Before/After
- N/A Visual structure remains identical but accessibility is enhanced behind the scenes.

♿ Accessibility
- ARIA labels added for proper context reading by screen readers.
- Removed invalid keyboard navigation dead-zones (like `div` based routing without `tabindex`).
