import { createPortal } from "preact/compat";
import { useState } from "preact/hooks";
import { isNavItemActive, navGroups, type NavItem } from "../../lib/navigation";

export default function MobileMenu({
  currentPath,
  pathname: pathnameProp,
}: {
  currentPath: string;
  pathname?: string;
}) {
  const pathname =
    pathnameProp ||
    (typeof globalThis !== "undefined" && "location" in globalThis
      ? (globalThis as unknown as { location: { pathname: string } }).location
          .pathname
      : "");

  function isActive(item: NavItem) {
    const p = pathname || currentPath;
    return isNavItemActive(p, item);
  }

  const [isOpen, setIsOpen] = useState(false);
  const closeDrawer = () => setIsOpen(false);

  return (
    <>
      {/* Hamburger button */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        class="h-11 w-11 rounded-full border border-gray-200 flex items-center justify-center text-gray-500 hover:bg-gray-50 transition-colors md:hidden"
        aria-label="Ouvrir le menu"
      >
        <svg
          class="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            stroke-width="2"
            d="M4 6h16M4 12h16M4 18h16"
          />
        </svg>
      </button>

      {isOpen &&
        createPortal(
          <div class="fixed inset-0 z-[2147483647] md:hidden">
            {/* Backdrop */}
            <button
              type="button"
              class="absolute inset-0 bg-black/30 backdrop-blur-sm cursor-default"
              aria-label="Fermer le menu"
              onClick={closeDrawer}
              tabIndex={-1}
            />

            {/* Drawer */}
            <div
              class="relative z-10 flex h-full flex-col shadow-xl"
              style="width:280px;max-width:85vw;background:#F4F7F5"
            >
              {/* Header */}
              <div
                class="flex h-16 shrink-0 items-center justify-between px-5"
                style="background:white;border-bottom:1px solid #E5E7EB"
              >
                <div class="flex items-center gap-3">
                  <img
                    src="/brand/logo.png"
                    alt="Logo Ageton"
                    class="h-8 w-8 rounded-full object-contain"
                  />
                  <span class="text-lg font-bold text-gray-900">Ageton</span>
                </div>
                <button
                  type="button"
                  class="w-8 h-8 rounded-full flex items-center justify-center text-gray-400 hover:bg-gray-100 transition-colors"
                  aria-label="Fermer le menu"
                  onClick={closeDrawer}
                >
                  <svg
                    class="w-5 h-5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M6 18L18 6M6 6l12 12"
                    />
                  </svg>
                </button>
              </div>

              {/* Nav */}
              <nav class="flex-1 overflow-y-auto p-4 space-y-6">
                {navGroups.map((group) => (
                  <div key={group.id}>
                    <p class="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2 px-2">
                      {group.label}
                    </p>
                    <div class="space-y-1">
                      {group.items.map((item) => {
                        const active = isActive(item);
                        return (
                          <a
                            key={item.path}
                            href={item.path}
                            onClick={closeDrawer}
                            class="flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-medium transition-colors"
                            style={
                              active
                                ? "background:#E9F3EB;color:#175B37"
                                : "color:#6B7280"
                            }
                          >
                            <svg
                              class="w-5 h-5 shrink-0"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path
                                stroke-linecap="round"
                                stroke-linejoin="round"
                                stroke-width="2"
                                d={item.iconPath}
                              />
                            </svg>
                            {item.name}
                          </a>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </nav>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
