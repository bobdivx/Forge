import { useState } from 'preact/hooks';

export default function LandingMobileMenu() {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button onClick={() => setIsOpen(!isOpen)} class="md:hidden text-slate-400 hover:text-white focus:outline-none" aria-label="Toggle Menu">
        <svg class="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d={isOpen ? 'M6 18L18 6M6 6l12 12' : 'M4 6h16M4 12h16M4 18h16'} />
        </svg>
      </button>
      {isOpen && (
        <div class="fixed inset-0 z-40 bg-slate-950/95 backdrop-blur-md md:hidden pt-20 px-6 flex flex-col space-y-6 text-lg font-medium text-slate-300">
          <a href="#features" onClick={() => setIsOpen(false)} class="hover:text-white border-b border-slate-800 pb-4">Fonctionnalités</a>
          <a href="#agents" onClick={() => setIsOpen(false)} class="hover:text-white border-b border-slate-800 pb-4">L'Équipe</a>
          <a href="#pricing" onClick={() => setIsOpen(false)} class="hover:text-white border-b border-slate-800 pb-4">Tarifs</a>
          <a href="/login" onClick={() => setIsOpen(false)} class="text-white pt-4">Connexion</a>
          <a href="/apps" onClick={() => setIsOpen(false)} class="rounded-lg bg-blue-600 px-4 py-3 text-center text-white shadow-lg mt-4">Accéder au Dashboard</a>
        </div>
      )}
    </>
  );
}
