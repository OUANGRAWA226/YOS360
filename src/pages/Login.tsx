import { useState } from 'react';
import { Boxes, Mail, Lock, User as UserIcon, LogIn, UserPlus, Loader2 } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { showToast } from '@/components/Toast';

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nomComplet, setNomComplet] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || !password) {
      showToast('Veuillez remplir tous les champs', 'error');
      return;
    }
    setBusy(true);
    if (mode === 'login') {
      const { error } = await signIn(email.trim(), password);
      setBusy(false);
      if (error) showToast(error, 'error');
    } else {
      if (!nomComplet.trim()) {
        setBusy(false);
        showToast('Veuillez indiquer votre nom', 'error');
        return;
      }
      const { error } = await signUp(email.trim(), password, nomComplet.trim());
      setBusy(false);
      if (error) showToast(error, 'error');
      else showToast('Compte créé. Bienvenue !');
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-sky-500/25">
            <Boxes className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">YOS360</h1>
          <p className="text-slate-400 text-sm mt-1">Plateforme de gestion & Caisse 360</p>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl p-6 sm:p-8">
          <div className="flex gap-2 p-1 bg-slate-100 rounded-xl mb-6">
            <button
              onClick={() => setMode('login')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'login' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Connexion
            </button>
            <button
              onClick={() => setMode('signup')}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${mode === 'signup' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500'}`}
            >
              Créer un compte
            </button>
          </div>

          <form onSubmit={submit} className="space-y-4">
            {mode === 'signup' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Nom complet</label>
                <div className="relative">
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                  <input
                    type="text"
                    value={nomComplet}
                    onChange={(e) => setNomComplet(e.target.value)}
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                    placeholder="Jean Dupont"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="vous@entreprise.com"
                  autoComplete="email"
                />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mot de passe</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="••••••••"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                {mode === 'signup' && (
                  <p className="text-xs text-slate-400 mt-1 pl-1">
                    Au moins 8 caractères, avec lettres et chiffres. Évitez les mots de passe trop courants (123456, azerty...) qui sont refusés automatiquement.
                  </p>
                )}
              </div>
            </div>
            <button
              type="submit"
              disabled={busy}
              className="w-full inline-flex items-center justify-center gap-2 py-2.5 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : mode === 'login' ? <LogIn className="w-5 h-5" /> : <UserPlus className="w-5 h-5" />}
              {busy ? 'Veuillez patienter...' : mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>

          <p className="text-xs text-slate-400 text-center mt-6">
            Le premier compte créé devient administrateur.
          </p>
        </div>
      </div>
    </div>
  );
}
