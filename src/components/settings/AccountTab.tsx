import FormField from '../ui/FormField';
import SaveRow from '../ui/SaveRow';

type AuthState = {
  currentEmail: string;
  newEmail: string;
  currentPassword: string;
  newPassword: string;
};

type Props = {
  auth: AuthState;
  setAuth: (a: AuthState) => void;
  onUpdate: () => void;
  onLogout: () => void;
  saving: boolean;
  message: string;
};

export default function AccountTab({ auth, setAuth, onUpdate, onLogout, saving, message }: Props) {
  const canSubmit = !saving && !!auth.currentPassword && !!auth.newPassword && !!auth.newEmail;

  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-slate-400 mb-6">Gérez vos identifiants d'accès au dashboard Forge.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Email actuel">
            <input
              type="email"
              value={auth.currentEmail}
              disabled
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-slate-400 cursor-not-allowed opacity-60"
            />
          </FormField>
          <FormField label="Nouvel email">
            <input
              type="email"
              value={auth.newEmail}
              onInput={(e) => setAuth({ ...auth, newEmail: (e.target as HTMLInputElement).value })}
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
            />
          </FormField>
          <FormField label="Mot de passe actuel">
            <input
              type="password"
              value={auth.currentPassword}
              onInput={(e) => setAuth({ ...auth, currentPassword: (e.target as HTMLInputElement).value })}
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
            />
          </FormField>
          <FormField label="Nouveau mot de passe">
            <input
              type="password"
              value={auth.newPassword}
              onInput={(e) => setAuth({ ...auth, newPassword: (e.target as HTMLInputElement).value })}
              class="w-full bg-slate-950 border border-slate-700 rounded-md px-3 py-2 text-sm text-white focus:border-blue-500 outline-none transition"
            />
          </FormField>
        </div>
      </div>
      <SaveRow
        message={message}
        saving={saving}
        onSave={onUpdate}
        label="Mettre à jour"
        extraActions={
          <button type="button" onClick={onLogout} class="btn btn-ghost border border-slate-700 text-xs h-9 min-h-0">
            Déconnexion
          </button>
        }
      />
    </div>
  );
}
