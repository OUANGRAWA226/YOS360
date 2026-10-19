import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from 'react';
import { supabase, type Role } from '@/lib/supabase';
import type { Session, User } from '@supabase/supabase-js';

export type Profile = {
  id: string;
  email: string;
  nom_complet: string | null;
  role: Role;
  actif: boolean;
  entreprise_id: string | null;
  super_admin: boolean;
  created_at: string;
};

type AuthState = {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  entrepriseId: string | null;
  setEntrepriseId: (id: string) => void;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, nomComplet: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}

const LS_ENTREPRISE = 'sm360_entreprise_id';

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [entrepriseId, setEntrepriseIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId: string) => {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      console.error('Erreur chargement profil:', error);
      setProfile(null);
      return;
    }
    const p = (data as Profile) ?? null;
    setProfile(p);
    // Entreprise active : choix persistant (super-admin) sinon celle du profil
    const stored = localStorage.getItem(LS_ENTREPRISE);
    if (p?.super_admin && stored) setEntrepriseIdState(stored);
    else if (p?.entreprise_id) setEntrepriseIdState(p.entreprise_id);
    else setEntrepriseIdState(null);
  }, []);

  useEffect(() => {
    supabase.auth.getSession()
      .then(({ data: { session: s } }) => {
        setSession(s);
        if (s?.user) fetchProfile(s.user.id);
        else setLoading(false);
      })
      .catch((err) => {
        console.error('Erreur getSession:', err);
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (s?.user) {
        (async () => {
          await fetchProfile(s.user.id);
          setLoading(false);
        })();
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, [fetchProfile]);

  const signIn = useCallback(async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { error: traduireErreur(error.message) };
    return { error: null };
  }, []);

  const signUp = useCallback(async (email: string, password: string, nomComplet: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: { nom_complet: nomComplet } },
    });
    if (error) return { error: traduireErreur(error.message) };
    return { error: null };
  }, []);

  const setEntrepriseId = useCallback((id: string) => {
    localStorage.setItem(LS_ENTREPRISE, id);
    setEntrepriseIdState(id);
    // Le super-admin persiste son entreprise active : les règles d'accès côté
    // base de données se basent sur profiles.entreprise_id
    void supabase.auth.getUser().then(({ data }) => {
      if (data.user) void supabase.from('profiles').update({ entreprise_id: id }).eq('id', data.user.id);
    });
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setSession(null);
    setEntrepriseIdState(null);
    localStorage.removeItem(LS_ENTREPRISE);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (session?.user) await fetchProfile(session.user.id);
  }, [session, fetchProfile]);

  return (
    <AuthContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        profile,
        entrepriseId,
        setEntrepriseId,
        loading,
        signIn,
        signUp,
        signOut,
        refreshProfile,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

function traduireErreur(message: string): string {
  if (message.includes('Invalid login credentials')) return 'Email ou mot de passe incorrect';
  if (message.includes('weak_password') || message.includes('known to be weak')) {
    return 'Mot de passe trop faible ou trop courant. Choisissez au moins 8 caractères avec lettres et chiffres (évitez 123456, azerty, password...)';
  }
  if (message.includes('already registered')) return 'Cet email est déjà utilisé';
  if (message.includes('Password should be')) return 'Le mot de passe doit contenir au moins 6 caractères';
  if (message.includes('rate limit')) return 'Trop de tentatives, réessayez dans un instant';
  if (message.includes('Email not confirmed')) return 'Email non confirmé';
  return message;
}
