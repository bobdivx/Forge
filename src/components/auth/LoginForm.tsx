import { useState } from 'preact/hooks';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const submit = async () => {
    setLoading(true);
    setMessage('');
    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
      const data = await res.json();
      if (!res.ok) { setMessage(data.error || 'Erreur'); return; }
      window.location.href = '/dashboard';
    } catch {
      setMessage('Erreur réseau.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <form class="mt-6 space-y-4" autoComplete="on" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <div class="flex gap-2">
        <button class={`btn btn-sm ${mode === 'login' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('login')} type="button">Se connecter</button>
        <button class={`btn btn-sm ${mode === 'register' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMode('register')} type="button">Initialiser compte</button>
      </div>
      <div>
        <label class="block text-xs text-slate-400 mb-1" for="login-email">Email</label>
        <input id="login-email" name="email" type="email" autoComplete={mode === 'register' ? 'email' : 'username'} class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm" value={email} onInput={(e) => setEmail((e.target as HTMLInputElement).value)} />
      </div>
      <div>
        <label class="block text-xs text-slate-400 mb-1" for="login-password">Mot de passe</label>
        <input id="login-password" name="password" type="password" autoComplete={mode === 'register' ? 'new-password' : 'current-password'} class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm" value={password} onInput={(e) => setPassword((e.target as HTMLInputElement).value)} />
      </div>
      <button class={`btn btn-primary w-full ${loading ? 'loading' : ''}`} disabled={loading || !email.trim() || !password.trim()} type="submit">
        {mode === 'register' ? 'Créer / Remplacer le compte admin' : 'Connexion'}
      </button>
      {message && <p class="text-sm text-red-400">{message}</p>}
    </form>
  );
}
