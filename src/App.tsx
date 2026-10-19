import { useState, useEffect, useCallback } from 'react';
import type {
  Categorie,
  ProduitWithCategorie,
  MouvementWithProduit,
  Fournisseur,
  Client,
  CommandeWithRelations,
  Entrepot,
  StockEntrepot,
  TransfertWithRelations,
  InventaireWithRelations,
  Lot,
  LotWithProduit,
  Entreprise,
  PaiementWithRelations,
} from '@/lib/supabase';
import { AuthProvider, useAuth } from '@/lib/auth';
import { PrefsProvider, usePrefs } from '@/lib/prefs';
import { can, type Module } from '@/lib/permissions';
import { fetchTable } from '@/lib/dataLayer';
import { supabase } from '@/lib/supabase';
import { syncNow, initConnectivityWatcher } from '@/lib/offline';
import { Sidebar } from '@/components/Sidebar';
import { Notifications } from '@/components/Notifications';
import { OfflineBadge } from '@/components/OfflineBadge';
import { Dashboard } from '@/pages/Dashboard';
import { Produits } from '@/pages/Produits';
import { Categories } from '@/pages/Categories';
import { Mouvements } from '@/pages/Mouvements';
import { Entrepots } from '@/pages/Entrepots';
import { Transferts } from '@/pages/Transferts';
import { Inventaires } from '@/pages/Inventaires';
import { Scan } from '@/pages/Scan';
import { Reappro } from '@/pages/Reappro';
import { Fournisseurs } from '@/pages/Fournisseurs';
import { Clients } from '@/pages/Clients';
import { Commandes } from '@/pages/Commandes';
import { Rapports } from '@/pages/Rapports';
import { Audit } from '@/pages/Audit';
import { Parametres } from '@/pages/Parametres';
import { Paiements } from '@/pages/Paiements';
import { Caisse } from '@/pages/Caisse';
import { LoginScreen } from '@/pages/Login';
import { ToastContainer, showToast } from '@/components/Toast';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import {
  Menu,
  LogOut,
  ShieldCheck,
  ShieldAlert,
  Maximize,
  Minimize,
  Sun,
  Moon,
  Building2,
  Sparkles,
  ChevronDown,
  Settings,
} from 'lucide-react';
import { ROLE_LABELS } from '@/lib/permissions';

export type Page =
  | 'dashboard'
  | 'produits'
  | 'categories'
  | 'mouvements'
  | 'entrepots'
  | 'transferts'
  | 'inventaires'
  | 'lots'
  | 'scan'
  | 'reappro'
  | 'fournisseurs'
  | 'clients'
  | 'commandes'
  | 'paiements'
  | 'caisse'
  | 'rapports'
  | 'audit'
  | 'parametres';

const BREADCRUMBS: Record<Page, { section: string; title: string }> = {
  dashboard: { section: "Vue d'ensemble", title: 'Tableau de bord' },
  rapports: { section: "Vue d'ensemble", title: 'Rapports & Analyses' },
  produits: { section: 'Inventaire', title: 'Catalogue Produits' },
  categories: { section: 'Inventaire', title: 'Catégories' },
  mouvements: { section: 'Inventaire', title: 'Mouvements de Stock' },
  entrepots: { section: 'Multi-sites', title: 'Entrepôts & Boutiques' },
  transferts: { section: 'Multi-sites', title: 'Transferts inter-sites' },
  inventaires: { section: 'Multi-sites', title: 'Inventaires physiques' },
  scan: { section: 'Opérations', title: 'Scan & Codes-barres' },
  reappro: { section: 'Opérations', title: 'Réapprovisionnement' },
  fournisseurs: { section: 'Partenaires', title: 'Fournisseurs' },
  clients: { section: 'Partenaires', title: 'Clients' },
  commandes: { section: 'Commandes', title: 'Commandes d’achats & ventes' },
  paiements: { section: 'Finance', title: 'Paiements & Créances' },
  caisse: { section: 'Finance', title: 'Caisse Tactile (POS)' },
  audit: { section: 'Administration', title: "Journal d'Audit" },
  parametres: { section: 'Administration', title: 'Paramètres du système' },
};

function Shell() {
  const { session, profile, entrepriseId, setEntrepriseId, loading: authLoading, signOut } = useAuth();
  const { t, theme, setTheme } = usePrefs();
  const [page, setPage] = useState<Page>('dashboard');
  const [parametresTab, setParametresTab] = useState<'donnees' | 'preferences' | 'entreprise' | 'utilisateurs' | 'modules' | 'integrations'>('donnees');
  const [donneesSubTab, setDonneesSubTab] = useState<'all' | 'export' | 'import'>('all');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);

  const [categories, setCategories] = useState<Categorie[]>([]);
  const [produits, setProduits] = useState<ProduitWithCategorie[]>([]);
  const [mouvements, setMouvements] = useState<MouvementWithProduit[]>([]);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [commandes, setCommandes] = useState<CommandeWithRelations[]>([]);
  const [entrepots, setEntrepots] = useState<Entrepot[]>([]);
  const [stocksEntrepot, setStocksEntrepot] = useState<StockEntrepot[]>([]);
  const [transferts, setTransferts] = useState<TransfertWithRelations[]>([]);
  const [inventaires, setInventaires] = useState<InventaireWithRelations[]>([]);
  const [lots, setLots] = useState<LotWithProduit[]>([]);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [entreprisesDisponibles, setEntreprisesDisponibles] = useState<Entreprise[]>([]);
  const [paiements, setPaiements] = useState<PaiementWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const role = profile?.role ?? null;

  const loadAll = useCallback(async () => {
    if (!entrepriseId) return;
    setLoading(true);
    const [cats, prods, mvts, fours, cls, cmds, ents, stocks, trfs, invs, lts, entRes, pays] = await Promise.all([
      fetchTable<Categorie>('categories', '*', { column: 'nom', ascending: true }),
      fetchTable<ProduitWithCategorie>('produits', '*, categories(*)', { column: 'nom', ascending: true }),
      fetchTable<MouvementWithProduit>('mouvements', '*, produits(nom, sku)', { column: 'created_at', ascending: false }, 200),
      fetchTable<Fournisseur>('fournisseurs', '*', { column: 'nom', ascending: true }),
      fetchTable<Client>('clients', '*', { column: 'nom', ascending: true }),
      fetchTable<CommandeWithRelations>('commandes', '*, fournisseurs(nom), clients(nom), commande_items(*, produits(nom, sku))', { column: 'created_at', ascending: false }),
      fetchTable<Entrepot>('entrepots', '*', { column: 'nom', ascending: true }),
      fetchTable<StockEntrepot>('stocks_entrepot', '*', null),
      fetchTable<TransfertWithRelations>('transferts', '*, produits(nom, sku, unite), entrepots_source:entrepots!transferts_entrepot_source_id_fkey(nom), entrepots_dest:entrepots!transferts_entrepot_dest_id_fkey(nom)', { column: 'created_at', ascending: false }),
      fetchTable<InventaireWithRelations>('inventaires', '*, entrepots(nom), inventaire_lignes(*, produits(nom, sku, unite))', { column: 'date_debut', ascending: false }),
      fetchTable<LotWithProduit>('lots', '*, produits(nom, sku, unite, perissable, alerte_peremption_jours)', { column: 'created_at', ascending: false }),
      supabase.from('entreprises').select('*').eq('id', entrepriseId).maybeSingle(),
      fetchTable<PaiementWithRelations>('paiements', '*, clients(nom), fournisseurs(nom), commandes(reference, numero_document)', { column: 'date_paiement', ascending: false }),
    ]);
    setCategories(cats);
    setProduits(prods);
    setMouvements(mvts);
    setFournisseurs(fours);
    setClients(cls);
    setCommandes(cmds);
    setEntrepots(ents);
    setStocksEntrepot(stocks);
    setTransferts(trfs);
    setInventaires(invs);
    setLots(lts);
    setEntreprise((entRes.data as Entreprise) ?? null);
    setPaiements(pays);
    setLoading(false);
  }, [entrepriseId]);

  useEffect(() => {
    if (session && entrepriseId) loadAll();
  }, [session, entrepriseId, loadAll]);

  // Liste des entreprises pour le sélecteur (super-admin) ou la sienne
  const refreshEntreprises = useCallback(() => {
    if (!session) return;
    supabase.from('entreprises').select('*').order('nom').then(({ data }) => {
      const all = (data as Entreprise[]) ?? [];
      setEntreprisesDisponibles(profile?.super_admin ? all : all.filter((e) => e.id === profile?.entreprise_id));
    });
  }, [session, profile]);

  useEffect(() => {
    refreshEntreprises();
  }, [refreshEntreprises]);

  // Si l'entreprise active change, on réinitialise la page pour éviter un module désactivé
  useEffect(() => {
    setPage('dashboard');
  }, [entrepriseId]);

  const modulesActifs = entreprise?.modules ?? [];

  // Offline sync: replay queued operations when connectivity returns
  useEffect(() => {
    const stop = initConnectivityWatcher(() => {
      syncNow().then(({ replayed, conflicts }) => {
        if (replayed > 0) {
          showToast(`${replayed} opération(s) hors-ligne synchronisée(s)`);
          loadAll();
        }
        if (conflicts > 0) {
          showToast(`${conflicts} conflit(s) résolu(s) automatiquement`, 'info');
        }
      });
    });
    return stop;
  }, [loadAll]);

  const navigate = (p: Page, subTab?: string) => {
    // Garde-fou côté client: rôle sans droit de vue, ou module désactivé pour cette entreprise
    if (!can(role, p as Module, 'view')) {
      showToast('Vous n\'avez pas accès à cette section', 'error');
      return;
    }
    if (!modulesActifs.includes(p as Module)) {
      showToast('Module non activé pour cette entreprise', 'error');
      return;
    }
    setPage(p);
    if (p === 'parametres' && subTab) {
      if (subTab === 'donnees') {
        setParametresTab('donnees');
        setDonneesSubTab('all');
      } else if (subTab === 'donnees-export') {
        setParametresTab('donnees');
        setDonneesSubTab('export');
      } else if (subTab === 'donnees-import') {
        setParametresTab('donnees');
        setDonneesSubTab('import');
      } else if (
        subTab === 'preferences' ||
        subTab === 'entreprise' ||
        subTab === 'utilisateurs' ||
        subTab === 'modules' ||
        subTab === 'integrations'
      ) {
        setParametresTab(subTab as any);
      }
    }
    setSidebarOpen(false);
  };

  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-sky-500/30 border-t-sky-500 rounded-full animate-spin" />
      </div>
    );
  }

  if (!session) return <LoginScreen />;

  // Entreprise suspendue : écran de blocage (le super-admin garde un accès pour administrer)
  const bloque = entreprise?.suspendue && !profile?.super_admin;
  if (bloque) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="max-w-md w-full bg-slate-800 rounded-2xl border border-red-500/40 p-8 text-center">
          <div className="w-14 h-14 rounded-2xl bg-red-500/15 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-7 h-7 text-red-400" />
          </div>
          <h1 className="text-xl font-bold text-slate-100 mb-2">Accès suspendu</h1>
          <p className="text-sm text-slate-400 leading-relaxed mb-6">
            L’accès de <span className="font-medium text-slate-200">{entreprise?.nom}</span> à la plateforme a été suspendu par l’administrateur.
            Veuillez contacter le support pour réactiver votre compte.
          </p>
          <button
            onClick={signOut}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-700 hover:bg-slate-600 rounded-xl transition-colors"
          >
            <LogOut className="w-4 h-4" /> Se déconnecter
          </button>
        </div>
      </div>
    );
  }

  const visiblePage = !can(role, page as Module, 'view') || !modulesActifs.includes(page as Module) ? 'dashboard' : page;

  return (
    <div className="min-h-screen bg-slate-100/90 dark:bg-[#090d16] flex transition-colors font-sans text-slate-800 dark:text-slate-100">
      {sidebarOpen && (
        <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* AdminLTE v4 Sidebar */}
      <Sidebar
        currentPage={visiblePage}
        currentSubPage={
          visiblePage === 'parametres'
            ? (parametresTab === 'donnees'
                ? (donneesSubTab === 'export' ? 'donnees-export' : (donneesSubTab === 'import' ? 'donnees-import' : 'donnees'))
                : parametresTab)
            : undefined
        }
        onNavigate={navigate}
        open={sidebarOpen}
        role={role}
        modulesActifs={modulesActifs}
        collapsed={sidebarCollapsed}
        onToggleCollapse={() => setSidebarCollapsed(!sidebarCollapsed)}
      />

      {/* Main Content Area with Dynamic AdminLTE Margin */}
      <div className={`flex-1 min-h-screen flex flex-col transition-all duration-300 ${sidebarCollapsed ? 'lg:ml-20' : 'lg:ml-72'}`}>
        {/* AdminLTE v4 App Header / Top Navbar */}
        <header className="sticky top-0 z-20 h-16 bg-white/95 dark:bg-[#0f172a]/95 backdrop-blur border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between shadow-xs">
          {/* Left Navbar Links */}
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            <button
              onClick={() => {
                if (window.innerWidth >= 1024) {
                  setSidebarCollapsed(!sidebarCollapsed);
                } else {
                  setSidebarOpen(!sidebarOpen);
                }
              }}
              className="p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-sky-600 transition-colors flex-shrink-0"
              aria-label="Basculer la barre latérale"
              title="Basculer le menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Quick Navigation Links (AdminLTE signature) */}
            <div className="hidden md:flex items-center gap-1 text-xs font-medium">
              <button
                onClick={() => navigate('dashboard')}
                className={`px-3 py-1.5 rounded-lg transition-colors ${
                  visiblePage === 'dashboard'
                    ? 'text-sky-600 font-bold bg-sky-50 dark:bg-sky-500/10'
                    : 'text-slate-600 dark:text-slate-300 hover:text-sky-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                Accueil
              </button>
              {modulesActifs.includes('caisse') && (
                <button
                  onClick={() => navigate('caisse')}
                  className={`px-3 py-1.5 rounded-lg transition-colors ${
                    visiblePage === 'caisse'
                      ? 'text-emerald-600 font-bold bg-emerald-50 dark:bg-emerald-500/10'
                      : 'text-slate-600 dark:text-slate-300 hover:text-emerald-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                >
                  Caisse POS
                </button>
              )}
              {profile?.super_admin && (
                <button
                  onClick={() => navigate('parametres')}
                  className="px-3 py-1.5 rounded-lg text-amber-700 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-500/10 font-semibold transition-colors flex items-center gap-1.5"
                >
                  <Sparkles className="w-3.5 h-3.5" /> Espace Super Admin
                </button>
              )}
            </div>

            {/* Enterprise Switcher */}
            {entreprisesDisponibles.length > 1 && (
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800 min-w-0">
                <Building2 className="w-4 h-4 text-slate-400 hidden sm:block flex-shrink-0" />
                <select
                  value={entrepriseId ?? ''}
                  onChange={(e) => setEntrepriseId(e.target.value)}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500 max-w-[190px] truncate"
                  title="Changer d'entreprise active"
                >
                  {entreprisesDisponibles.map((e) => (
                    <option key={e.id} value={e.id}>{e.nom}</option>
                  ))}
                </select>
                {profile?.super_admin && (
                  <span className="hidden xl:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 shadow-2xs flex-shrink-0">
                    👑 Super Admin
                  </span>
                )}
              </div>
            )}
            {entreprisesDisponibles.length === 1 && (
              <div className="flex items-center gap-2 pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800 truncate">
                <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate max-w-[190px]">
                  {entreprisesDisponibles[0].nom}
                </span>
                {profile?.super_admin && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300 border border-amber-300 dark:border-amber-500/30 flex-shrink-0">
                    👑 Super Admin
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Right Navbar Links */}
          <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
            <OfflineBadge />

            {/* Notifications Bell Dropdown */}
            <Notifications produits={produits} lots={lots} commandes={commandes} onNavigate={navigate} />

            {/* Theme Toggle (AdminLTE Dark/Light) */}
            <button
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={theme === 'dark' ? 'Activer le mode clair' : 'Activer le mode sombre'}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 text-amber-400" /> : <Moon className="w-4 h-4 text-slate-600" />}
            </button>

            {/* Fullscreen Toggle */}
            <button
              onClick={() => {
                if (!document.fullscreenElement) {
                  document.documentElement.requestFullscreen().catch(() => {});
                  setIsFullscreen(true);
                } else {
                  document.exitFullscreen().catch(() => {});
                  setIsFullscreen(false);
                }
              }}
              className="hidden sm:inline-flex p-2 rounded-xl text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
            >
              {isFullscreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
            </button>

            {/* User Profile Pill & Dropdown (Signature AdminLTE) */}
            <div className="relative pl-2 sm:pl-3 border-l border-slate-200 dark:border-slate-800">
              <button
                onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 p-1 sm:px-2.5 sm:py-1 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-sky-500 to-blue-600 text-white flex items-center justify-center font-bold text-xs shadow-2xs">
                  {(profile?.nom_complet || profile?.email || 'U').slice(0, 2).toUpperCase()}
                </div>
                <div className="hidden md:block text-left">
                  <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 leading-tight">
                    {profile?.nom_complet || profile?.email}
                  </p>
                  <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-none">
                    {profile?.super_admin ? 'Super Admin' : (role ? ROLE_LABELS[role] : '')}
                  </p>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-400 hidden sm:block" />
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl py-3 z-50 animate-in fade-in zoom-in-95 duration-150">
                    <div className="px-4 pb-3 border-b border-slate-100 dark:border-slate-800 text-center">
                      <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-sky-500 to-blue-600 text-white font-bold text-base flex items-center justify-center mx-auto mb-2 shadow-md">
                        {(profile?.nom_complet || profile?.email || 'U').slice(0, 2).toUpperCase()}
                      </div>
                      <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">{profile?.nom_complet || profile?.email}</p>
                      <p className="text-xs text-slate-400 truncate">{profile?.email}</p>
                      <div className="mt-2 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-sky-100 text-sky-700 dark:bg-sky-500/20 dark:text-sky-300">
                        {profile?.super_admin ? '👑 Super Administrateur' : (role ? ROLE_LABELS[role] : 'Collaborateur')}
                      </div>
                    </div>

                    <div className="py-2 px-2 space-y-1">
                      <button
                        onClick={() => { setUserMenuOpen(false); navigate('parametres'); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                      >
                        <Settings className="w-4 h-4 text-slate-400" />
                        <span>Paramètres de la plateforme</span>
                      </button>
                      {profile?.super_admin && (
                        <button
                          onClick={() => { setUserMenuOpen(false); navigate('audit'); }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                        >
                          <ShieldCheck className="w-4 h-4 text-violet-500" />
                          <span>Journal d'audit global</span>
                        </button>
                      )}
                    </div>

                    <div className="pt-2 px-2 border-t border-slate-100 dark:border-slate-800">
                      <button
                        onClick={() => { setUserMenuOpen(false); signOut(); }}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-500/10 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        <span>Se déconnecter</span>
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        </header>

        {/* AdminLTE v4 Content Header (Breadcrumbs) */}
        <div className="bg-white/70 dark:bg-slate-900/70 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-8 py-3">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-1.5">
            <h1 className="text-base font-bold text-slate-800 dark:text-slate-100 tracking-tight flex items-center gap-2">
              {visiblePage === 'parametres' ? (
                <span>
                  Paramètres{' '}
                  <span className="text-xs font-normal text-slate-500 dark:text-slate-400">
                    &rsaquo;{' '}
                    {parametresTab === 'donnees'
                      ? (donneesSubTab === 'export'
                          ? 'Exports & Sauvegardes'
                          : donneesSubTab === 'import'
                          ? 'Import Produits (CSV)'
                          : 'Données (Exports & Import)')
                      : parametresTab === 'preferences'
                      ? 'Préférences'
                      : parametresTab === 'entreprise'
                      ? 'Entreprise'
                      : parametresTab === 'utilisateurs'
                      ? 'Utilisateurs'
                      : parametresTab === 'modules'
                      ? 'Modules (Gouvernance)'
                      : 'API & Intégrations'}
                  </span>
                </span>
              ) : (
                BREADCRUMBS[visiblePage]?.title
              )}
            </h1>
            <ol className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
              <li><button onClick={() => navigate('dashboard')} className="hover:text-sky-600 transition-colors">Accueil</button></li>
              <li>/</li>
              <li>{BREADCRUMBS[visiblePage]?.section}</li>
              <li>/</li>
              <li className="text-slate-800 dark:text-slate-200 font-semibold">
                {visiblePage === 'parametres' ? (
                  <span>
                    Paramètres &rsaquo;{' '}
                    {parametresTab === 'donnees'
                      ? (donneesSubTab === 'export'
                          ? 'Exports'
                          : donneesSubTab === 'import'
                          ? 'Import CSV'
                          : 'Données')
                      : parametresTab === 'preferences'
                      ? 'Préférences'
                      : parametresTab === 'entreprise'
                      ? 'Entreprise'
                      : parametresTab === 'utilisateurs'
                      ? 'Utilisateurs'
                      : parametresTab === 'modules'
                      ? 'Modules'
                      : 'API & Intégrations'}
                  </span>
                ) : (
                  BREADCRUMBS[visiblePage]?.title
                )}
              </li>
            </ol>
          </div>
        </div>

        {/* Content Body */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {visiblePage === 'dashboard' && (
            <Dashboard
              produits={produits} mouvements={mouvements} categories={categories}
              commandes={commandes} clients={clients} fournisseurs={fournisseurs}
              loading={loading} onNavigate={navigate}
              entreprises={entreprisesDisponibles}
              onSelectEntreprise={(id) => setEntrepriseId(id)}
            />
          )}
          {visiblePage === 'produits' && (
            <Produits produits={produits} categories={categories} lots={lots} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'categories' && (
            <Categories categories={categories} produits={produits} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'mouvements' && (
            <Mouvements mouvements={mouvements} produits={produits} entrepots={entrepots} lots={lots} stocksEntrepot={stocksEntrepot} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'entrepots' && (
            <Entrepots entrepots={entrepots} stocksEntrepot={stocksEntrepot} produits={produits} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'transferts' && (
            <Transferts transferts={transferts} produits={produits} entrepots={entrepots} stocksEntrepot={stocksEntrepot} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'inventaires' && (
            <Inventaires inventaires={inventaires} produits={produits} entrepots={entrepots} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'scan' && (
            <Scan produits={produits} lots={lots} role={role} />
          )}
          {visiblePage === 'reappro' && (
            <Reappro produits={produits} fournisseurs={fournisseurs} commandes={commandes} role={role} onRefresh={loadAll} />
          )}
          {visiblePage === 'fournisseurs' && (
            <Fournisseurs fournisseurs={fournisseurs} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'clients' && (
            <Clients clients={clients} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'commandes' && (
            <Commandes commandes={commandes} produits={produits} fournisseurs={fournisseurs} clients={clients} entreprise={entreprise} numerosFactures={commandes.filter((c) => c.numero_document?.startsWith('FAC-')).map((c) => c.numero_document!)} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'paiements' && (
            <Paiements paiements={paiements} clients={clients} fournisseurs={fournisseurs} commandes={commandes} entreprise={entreprise} loading={loading} onRefresh={loadAll} role={role} />
          )}
          {visiblePage === 'caisse' && (
            <Caisse produits={produits} clients={clients} entreprise={entreprise} numerosFactures={commandes.filter((c) => c.numero_document?.startsWith('FAC-')).map((c) => c.numero_document!)} role={role} onRefresh={loadAll} />
          )}
          {visiblePage === 'rapports' && (
            <Rapports produits={produits} mouvements={mouvements} commandes={commandes} categories={categories} lots={lots} entrepots={entrepots} stocksEntrepot={stocksEntrepot} loading={loading} />
          )}
          {visiblePage === 'audit' && role && <Audit />}
          {visiblePage === 'parametres' && (
            <Parametres
              entreprise={entreprise}
              entreprises={entreprisesDisponibles}
              onEntrepriseSaved={(e) => setEntreprise(e)}
              onRefreshEntreprises={refreshEntreprises}
              activeTab={parametresTab}
              onTabChange={setParametresTab}
              donneesSubTab={donneesSubTab}
              onDonneesSubTabChange={setDonneesSubTab}
            />
          )}
        </main>

        {/* AdminLTE v4 Footer */}
        <footer className="mt-auto bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 px-6 py-3.5 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-500 dark:text-slate-400 gap-2">
          <div>
            <strong>Copyright &copy; 2026 <span className="text-sky-600 dark:text-sky-400 font-semibold">YOS360</span>.</strong> Tous droits réservés.
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Système opérationnel</span>
            </div>
            <span className="text-slate-300 dark:text-slate-700">|</span>
            <span className="font-mono text-[11px] font-semibold text-slate-600 dark:text-slate-300">AdminLTE Architecture v4.10</span>
          </div>
        </footer>
      </div>
      <ToastContainer />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <PrefsProvider>
        <AuthProvider>
          <Shell />
        </AuthProvider>
      </PrefsProvider>
    </ErrorBoundary>
  );
}

export default App;
