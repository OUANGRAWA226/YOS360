import { useState } from 'react';
import { Mail, Lock, User as UserIcon, Loader2, ArrowRight, Eye, EyeOff, ShieldCheck, Smartphone, WifiOff } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { showToast } from '@/components/Toast';
import { YosMark, YosWordmark } from '@/components/brand/YosLogo';

// Les quatre modules clés, un par pièce du cube (comme sur l'écran de chargement)
const MODULES = [
  { label: 'Stock 360°', dot: 'bg-[#48B068]', pos: 'left-[-8%] top-[14%]' },
  { label: 'Facturation', dot: 'bg-[#117A35]', pos: 'right-[-10%] top-[14%]' },
  { label: 'Encaissement', dot: 'bg-[#117A35]', pos: 'left-[-12%] bottom-[18%]' },
  { label: 'RH', dot: 'bg-[#48B068]', pos: 'right-[2%] bottom-[18%]' },
];

const ATOUTS = [
  { icon: ShieldCheck, text: 'Conforme SYSCOHADA Révisé' },
  { icon: Smartphone, text: 'Mobile Money intégré' },
  { icon: WifiOff, text: 'Fonctionne hors ligne' },
];

function Field({
  id, label, icon: Icon, children,
}: { id: string; label: string; icon: typeof Mail; children: React.ReactNode }) {
  return (
    <div>
      <label htmlFor={id} className="block text-[13px] font-semibold text-slate-700 dark:text-slate-300 mb-1.5">{label}</label>
      <div className="relative">
        <Icon className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" aria-hidden="true" />
        {children}
      </div>
    </div>
  );
}

const inputClass =
  'w-full h-11 rounded-xl border border-slate-300 dark:border-[#24372D] bg-white dark:bg-[#0F1C16] pl-10 pr-3.5 text-sm ' +
  'text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 transition-colors ' +
  'focus:outline-none focus:border-[#48B068] focus:ring-4 focus:ring-[#48B068]/15';

export function LoginScreen() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nomComplet, setNomComplet] = useState('');
  const [showPassword, setShowPassword] = useState(false);
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

  const tab = (value: 'login' | 'signup', text: string) => (
    <button
      type="button"
      onClick={() => setMode(value)}
      aria-pressed={mode === value}
      className={`flex-1 h-9 rounded-lg text-sm font-semibold transition-all ${
        mode === value
          ? 'bg-white dark:bg-[#1A2C23] text-slate-900 dark:text-white shadow-sm'
          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
      }`}
    >
      {text}
    </button>
  );

  return (
    <div className="min-h-screen grid lg:grid-cols-[1.05fr_1fr] bg-[#FBFCFB] dark:bg-[#0B1410] font-sans text-slate-800 dark:text-slate-100">
      {/* ── Panneau de marque (ordinateur) ───────────────────────────── */}
      <aside className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-[#0B1A13] text-white px-12 py-10 xl:px-16">
        {/* Halos et trame discrète */}
        <div aria-hidden="true" className="absolute -left-40 top-1/4 w-[620px] h-[620px] rounded-full bg-[#48B068]/20 blur-[120px]" />
        <div aria-hidden="true" className="absolute -right-48 bottom-[-10%] w-[520px] h-[520px] rounded-full bg-[#0270B8]/20 blur-[120px]" />
        <div
          aria-hidden="true"
          className="absolute inset-0 opacity-[0.07]"
          style={{ backgroundImage: 'radial-gradient(circle at 1px 1px, #fff 1px, transparent 0)', backgroundSize: '28px 28px' }}
        />

        <div className="relative flex items-center gap-3">
          <YosMark className="w-9 h-9" />
          <YosWordmark onDark className="text-2xl" />
        </div>

        <div className="relative max-w-[520px]">
          {/* Le cube et ses modules, sur une orbite à 360° */}
          <div className="relative w-[300px] h-[300px] mx-auto mb-12 yos-login-in">
            <div aria-hidden="true" className="absolute inset-0 rounded-full border border-dashed border-white/15 yos-login-orbit">
              <span className="absolute -top-1 left-1/2 w-2 h-2 rounded-full bg-[#5CC47D] shadow-[0_0_12px_#5CC47D]" />
              <span className="absolute bottom-[14%] -left-0.5 w-1.5 h-1.5 rounded-full bg-[#4FAEEB] shadow-[0_0_10px_#4FAEEB]" />
            </div>
            <div aria-hidden="true" className="absolute inset-[22%] rounded-full bg-[#48B068]/25 blur-3xl" />
            <YosMark className="absolute inset-[24%] w-[52%] h-[52%] drop-shadow-[0_20px_40px_rgba(0,0,0,0.45)] yos-login-float" />
            {MODULES.map((m) => (
              <span
                key={m.label}
                className={`absolute ${m.pos} inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold font-['Montserrat'] bg-white/10 border border-white/15 backdrop-blur-md`}
              >
                <i className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
                {m.label}
              </span>
            ))}
          </div>

          <p className="inline-flex items-center gap-2 mb-4 px-3 py-1 rounded-full bg-white/10 border border-white/15 text-xs font-semibold font-['Montserrat'] text-white/85">
            <span className="w-1.5 h-1.5 rounded-full bg-[#5CC47D]" aria-hidden="true" />
            9 modules intégrés
          </p>
          <h2 className="font-['Montserrat'] font-extrabold text-[34px] xl:text-[40px] leading-[1.1] tracking-[-0.02em]">
            Pilotez toute votre entreprise <span className="text-[#5CC47D]">à 360°</span>
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/70">
            Ventes, caisse, achats, stock, multi-sites, fidélité, finance, équipe et gouvernance réunis dans un seul ERP, pensé pour les entreprises de la zone UEMOA.
          </p>
        </div>

        <div className="relative flex items-end justify-between gap-6">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-[13px] text-white/75">
            {ATOUTS.map(({ icon: Icon, text }) => (
              <li key={text} className="inline-flex items-center gap-2">
                <Icon className="w-4 h-4 text-[#5CC47D]" aria-hidden="true" />
                {text}
              </li>
            ))}
          </ul>
          <p className="shrink-0 text-xs tracking-[0.25em] font-['Montserrat'] font-extrabold text-[#4FAEEB]">
            <span className="font-medium tracking-[0.08em] text-white/50 mr-1.5">by</span>YOPOE
          </p>
        </div>
      </aside>

      {/* ── Formulaire ───────────────────────────────────────────────── */}
      <main className="flex flex-col min-h-screen px-4 sm:px-8">
        <div className="flex-1 flex items-center justify-center py-10">
          <div className="w-full max-w-[400px] yos-login-in">
            {/* Marque (téléphone et tablette) */}
            <div className="lg:hidden flex flex-col items-center mb-8">
              <YosMark className="w-16 h-16 mb-3" title="YOS360" />
              <YosWordmark className="text-3xl" />
              <p className="mt-2 text-sm font-medium text-slate-500 dark:text-slate-400">
                Votre entreprise, vue à <span className="font-semibold text-[#48B068]">360°</span>
              </p>
            </div>

            <h1 className="font-['Montserrat'] font-extrabold text-[26px] tracking-[-0.02em] text-slate-900 dark:text-white">
              {mode === 'login' ? 'Bon retour parmi nous' : 'Créez votre compte'}
            </h1>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              {mode === 'login'
                ? 'Connectez-vous pour démarrer votre session.'
                : 'Enregistrez un nouveau compte utilisateur.'}
            </p>

            <div className="mt-6 flex gap-1 p-1 rounded-xl bg-slate-100 dark:bg-[#0F1C16] border border-slate-200 dark:border-[#1E2B25]">
              {tab('login', 'Connexion')}
              {tab('signup', 'Inscription')}
            </div>

            <form onSubmit={submit} className="mt-6 space-y-4">
              {mode === 'signup' && (
                <Field id="nom" label="Nom complet" icon={UserIcon}>
                  <input
                    id="nom"
                    type="text"
                    value={nomComplet}
                    onChange={(e) => setNomComplet(e.target.value)}
                    className={inputClass}
                    placeholder="Awa Ouédraogo"
                    autoComplete="name"
                    required
                  />
                </Field>
              )}

              <Field id="email" label="Email professionnel" icon={Mail}>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={inputClass}
                  placeholder="vous@entreprise.com"
                  autoComplete="email"
                  required
                />
              </Field>

              <div>
                <Field id="password" label="Mot de passe" icon={Lock}>
                  <input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className={`${inputClass} pr-11`}
                    placeholder="••••••••"
                    autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </Field>
                {mode === 'signup' && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
                    Au moins 8 caractères avec lettres et chiffres.
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={busy}
                className="group w-full h-11 mt-2 rounded-xl bg-[#0270B8] hover:bg-[#025E9A] text-white text-sm font-semibold inline-flex items-center justify-center gap-2 shadow-[0_8px_20px_-8px_rgba(2,112,184,0.6)] transition-colors disabled:opacity-60 focus:outline-none focus-visible:ring-4 focus-visible:ring-[#0270B8]/30"
              >
                {busy ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Traitement…
                  </>
                ) : (
                  <>
                    {mode === 'login' ? 'Se connecter' : 'Créer mon compte'}
                    <ArrowRight className="w-4 h-4 transition-transform group-hover:translate-x-0.5" />
                  </>
                )}
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
              {mode === 'login' ? "Vous n'avez pas de compte ? " : "J'ai déjà un compte : "}
              <button
                type="button"
                onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
                className="font-semibold text-[#0270B8] dark:text-[#4FAEEB] hover:underline"
              >
                {mode === 'login' ? "S'inscrire" : 'Me connecter'}
              </button>
            </p>
          </div>
        </div>

        <footer className="py-5 flex items-center justify-center gap-2 text-xs text-slate-400 dark:text-slate-500">
          <span>YOS360 · Système de Gestion d'Entreprise</span>
          <span aria-hidden="true">·</span>
          <span className="font-['Montserrat'] font-extrabold tracking-[0.2em] text-[#0270B8] dark:text-[#4FAEEB]">
            <span className="font-medium tracking-normal text-slate-400 dark:text-slate-500 mr-1">by</span>YOPOE
          </span>
        </footer>
      </main>
    </div>
  );
}
