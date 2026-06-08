## 2024-05-18 - Keyboard Navigation in Drawers
**Learning:** Background backdrops used for closing modals/drawers (like `<button class="absolute inset-0...">`) can unintentionally trap keyboard focus if they are native button elements, creating a confusing experience for screen reader and keyboard users.
**Action:** Always add `tabIndex={-1}` and `cursor-default` to backdrop buttons to remove them from the tab order while maintaining click-to-close functionality, ensuring users are guided to explicit interactive controls.
