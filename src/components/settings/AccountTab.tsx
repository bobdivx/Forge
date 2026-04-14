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

const inputCls = 'w-full bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900 focus:border-[#175B37] focus:ring-1 focus:ring-[#175B37]/20 outline-none transition';

export default function AccountTab({ auth, setAuth, onUpdate, onLogout, saving, message }: Props) {
  const canSubmit = !saving && !!auth.currentPassword && !!auth.newPassword && !!auth.newEmail;

  return (
    <div class="p-6 space-y-6">
      <div>
        <p class="text-xs text-gray-500 mb-6">Gérez vos identifiants d'accès au dashboard Forge.</p>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField label="Email actuel">
            <input
              type="email"
              value={auth.currentEmail}
              disabled
              class={`${inputCls} opacity-60 cursor-not-allowed`}
            />
          </FormField>
          <FormField label="Nouvel email">
            <input
              type="email"
              value={auth.newEmail}
              onInput={(e) => setAuth({ ...auth, newEmail: (e.target as HTMLInputElement).value })}
              class={inputCls}
            />
          </FormField>
          <FormField label="Mot de passe actuel">
            <input
              type="password"
              value={auth.currentPassword}
              onInput={(e) => setAuth({ ...auth, currentPassword: (e.target as HTMLInputElement).value })}
              class={inputCls}
            />
          </FormField>
          <FormField label="Nouveau mot de passe">
            <input
              type="password"
              value={auth.newPassword}
              onInput={(e) => setAuth({ ...auth, newPassword: (e.target as HTMLInputElement).value })}
              class={inputCls}
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
          <button
            type="button"
            onClick={onLogout}
            class="border border-gray-300 text-gray-600 text-sm px-4 py-2 rounded-full hover:bg-gray-50 transition-colors"
          >
            Déconnexion
          </button>
        }
      />
    </div>
  );
}
