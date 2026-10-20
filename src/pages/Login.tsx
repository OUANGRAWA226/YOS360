import { useState } from 'react';
import { Mail, Lock, User as UserIcon, LogIn, UserPlus, Loader2, ArrowRight } from 'lucide-react';
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
    <div className="min-h-screen bg-[#e9ecef] dark:bg-[#090d16] flex items-center justify-center p-4 font-sans text-slate-800 dark:text-slate-100">
      <div className="w-full max-w-[400px]">
        {/* AdminLTE v4 Login Logo */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center p-3.5 rounded-2xl bg-white dark:bg-slate-800 shadow-md border border-slate-200/80 dark:border-slate-700/60 mb-2.5">
            <img
              src="/logo-yos360.png"
              alt="YOS360 by YOPOE"
              className="h-14 sm:h-16 w-auto object-contain"
            />
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-widest font-semibold">
            Plateforme ERP & Caisse POS • UEMOA
          </p>
        </div>

        {/* AdminLTE v4 Card Outline Card-Primary */}
        <div className="bg-white dark:bg-[#0f172a] rounded-lg shadow-md border border-slate-200 dark:border-slate-800 border-t-[3px] border-t-primary overflow-hidden">
          <div className="p-6">
            <p className="text-sm text-center text-slate-600 dark:text-slate-400 mb-6">
              {mode === 'login'
                ? 'Connectez-vous pour démarrer votre session'
                : 'Enregistrer un nouveau compte utilisateur'}
            </p>

            <form onSubmit={submit} className="space-y-4">
              {mode === 'signup' && (
                <div>
                  <div className="relative flex items-center">
                    <input
                      type="text"
                      value={nomComplet}
                      onChange={(e) => setNomComplet(e.target.value)}
                      className="form-control-lte pr-10"
                      placeholder="Nom complet"
                      required
                    />
                    <div className="absolute right-3 text-slate-400">
                      <UserIcon className="w-4 h-4" />
                    </div>
                  </div>
                </div>
              )}

              <div>
                <div className="relative flex items-center">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="form-control-lte pr-10"
                    placeholder="Email professionnel"
                    autoComplete="email"
                    required
                  />
                  <div className="absolute right-3 text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                </div>
              </div>

              <div>
                <div className="relative flex items-center">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="form-control-lte pr-10"
                    placeholder="Mot de passe"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                  />
                  <div className="absolute right-3 text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                </div>
                {mode === 'signup' && (
                  <p className="text-[11px] text-slate-400 mt-1">
                    Au moins 8 caractères avec lettres et chiffres.
                  </p>
                )}
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full btn-lte btn-lte-primary justify-center py-2 text-sm font-semibold shadow-xs"
                >
                  {busy ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : mode === 'login' ? (
                    <LogIn className="w-4 h-4" />
                  ) : (
                    <UserPlus className="w-4 h-4" />
                  )}
                  {busy
                    ? 'Traitement...'
                    : mode === 'login'
                    ? 'Se connecter'
                    : 'Créer mon compte'}
                </button>
              </div>
            </form>

            <div className="mt-6 pt-4 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2 text-xs text-center">
              {mode === 'login' ? (
                <button
                  onClick={() => setMode('signup')}
                  className="text-primary hover:underline font-semibold"
                >
                  Vous n'avez pas de compte ? S'inscrire
                </button>
              ) : (
                <button
                  onClick={() => setMode('login')}
                  className="text-primary hover:underline font-semibold"
                >
                  J'ai déjà un compte : Me connecter
                </button>
              )}
            </div>
          </div>
          <div className="bg-slate-50 dark:bg-slate-800/50 px-6 py-3 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 text-center">
            YOS360 · Système de Gestion d'Entreprise
          </div>
        </div>
      </div>
    </div>
  );
}
