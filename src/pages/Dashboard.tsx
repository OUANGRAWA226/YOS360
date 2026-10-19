import { Package, TrendingUp, AlertTriangle, Tags, ArrowLeftRight, ArrowRight, ShoppingCart, Users, Truck, DollarSign, Building2, Globe, ShieldAlert, Sparkles, ExternalLink, ShieldCheck, Layers, Settings, CheckCircle2 } from 'lucide-react';
import type { ProduitWithCategorie, MouvementWithProduit, Categorie, CommandeWithRelations, Fournisseur, Client, Entreprise } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import type { Page } from '@/App';
import { formatCurrency, formatNumber, formatDate, statutLabel, statutColor } from '@/lib/format';
import { LineChart, DonutChart } from '@/components/Charts';
import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { showToast } from '@/components/Toast';

type Props = {
  produits: ProduitWithCategorie[];
  mouvements: MouvementWithProduit[];
  categories: Categorie[];
  commandes: CommandeWithRelations[];
  clients: Client[];
  fournisseurs: Fournisseur[];
  loading: boolean;
  onNavigate: (page: Page) => void;
  entreprises?: Entreprise[];
  onSelectEntreprise?: (id: string) => void;
};

export function Dashboard({
  produits,
  mouvements,
  categories,
  commandes,
  clients,
  fournisseurs,
  loading,
  onNavigate,
  entreprises = [],
  onSelectEntreprise,
}: Props) {
  const { profile } = useAuth();
  const isSuperAdmin = profile?.super_admin === true;
  const [viewMode, setViewMode] = useState<'tenant' | 'global'>('tenant');

  const [globalStats, setGlobalStats] = useState({
    totalEntreprises: entreprises.length,
    entreprisesActives: entreprises.filter((e) => !e.suspendue).length,
    entreprisesSuspendues: entreprises.filter((e) => e.suspendue).length,
    totalUsers: 0,
    totalProduits: 0,
    totalCommandes: 0,
  });

  useEffect(() => {
    if (isSuperAdmin) {
      Promise.all([
        supabase.from('profiles').select('*', { count: 'exact', head: true }),
        supabase.from('produits').select('*', { count: 'exact', head: true }),
        supabase.from('commandes').select('*', { count: 'exact', head: true }),
      ]).then(([profRes, prodRes, cmdRes]) => {
        setGlobalStats({
          totalEntreprises: entreprises.length,
          entreprisesActives: entreprises.filter((e) => !e.suspendue).length,
          entreprisesSuspendues: entreprises.filter((e) => e.suspendue).length,
          totalUsers: profRes.count ?? 0,
          totalProduits: prodRes.count ?? 0,
          totalCommandes: cmdRes.count ?? 0,
        });
      });
    }
  }, [isSuperAdmin, entreprises]);
  const totalProduits = produits.length;
  const totalStock = produits.reduce((sum, p) => sum + p.quantite, 0);
  const valeurStock = produits.reduce((sum, p) => sum + p.prix_unitaire * p.quantite, 0);
  const valeurVente = produits.reduce((sum, p) => sum + p.prix_vente * p.quantite, 0);
  const produitsAlerte = produits.filter((p) => p.quantite <= p.seuil_alerte);
  const cmdEnAttente = commandes.filter((c) => c.statut === 'en_attente').length;

  const monthData = useMemo(() => {
    const now = new Date();
    const months: { label: string; value: number }[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const label = new Intl.DateTimeFormat('fr-FR', { month: 'short' }).format(d);
      const monthStart = new Date(d.getFullYear(), d.getMonth(), 1);
      const monthEnd = new Date(d.getFullYear(), d.getMonth() + 1, 1);
      const count = mouvements.filter((m) => {
        const md = new Date(m.created_at);
        return md >= monthStart && md < monthEnd;
      }).length;
      months.push({ label, value: count });
    }
    return months;
  }, [mouvements]);

  const stockByCat = useMemo(() => {
    const result = categories.map((c) => {
      const count = produits.filter((p) => p.categorie_id === c.id).length;
      return { label: c.nom, value: count, color: c.couleur };
    });
    const noCat = produits.filter((p) => !p.categorie_id).length;
    if (noCat > 0) result.push({ label: 'Autres', value: noCat, color: '#94a3b8' });
    return result.filter((r) => r.value > 0);
  }, [produits, categories]);

  const stats = [
    { label: 'Total produits', value: formatNumber(totalProduits), icon: Package, bg: 'bg-sky-50', iconColor: 'text-sky-600' },
    { label: 'Articles en stock', value: formatNumber(totalStock), icon: Tags, bg: 'bg-emerald-50', iconColor: 'text-emerald-600' },
    { label: 'Valeur du stock', value: formatCurrency(valeurStock), icon: TrendingUp, bg: 'bg-blue-50', iconColor: 'text-blue-600' },
    { label: 'Valeur de vente', value: formatCurrency(valeurVente), icon: DollarSign, bg: 'bg-violet-50', iconColor: 'text-violet-600' },
    { label: 'Alertes stock', value: formatNumber(produitsAlerte.length), icon: AlertTriangle, bg: 'bg-amber-50', iconColor: 'text-amber-600' },
    { label: 'Commandes en attente', value: formatNumber(cmdEnAttente), icon: ShoppingCart, bg: 'bg-orange-50', iconColor: 'text-orange-600' },
    { label: 'Clients', value: formatNumber(clients.length), icon: Users, bg: 'bg-teal-50', iconColor: 'text-teal-600' },
    { label: 'Fournisseurs', value: formatNumber(fournisseurs.length), icon: Truck, bg: 'bg-rose-50', iconColor: 'text-rose-600' },
  ];

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-64 bg-slate-200 rounded-lg animate-pulse" />
          <div className="h-4 w-48 bg-slate-200 rounded mt-2 animate-pulse" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => <div key={i} className="h-32 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Super Admin Control Banner */}
      {isSuperAdmin && (
        <div className="bg-gradient-to-r from-slate-900 via-sky-950 to-slate-900 rounded-3xl border border-sky-500/30 p-5 sm:p-6 text-white shadow-xl relative overflow-hidden">
          <div className="absolute right-0 top-0 translate-x-10 -translate-y-10 w-64 h-64 bg-sky-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 relative z-10">
            <div>
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-500/20 text-sky-300 text-xs font-semibold mb-2 border border-sky-500/30">
                <Sparkles className="w-3.5 h-3.5" /> Espace Gouvernance Super Administrateur
              </div>
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight">Vision Globale & Pilotage No-Code YOS360</h2>
              <p className="text-sm text-slate-300 mt-1 max-w-2xl">
                Supervisez tous les clients, configurez les modules à la volée et gérez toutes les actions métiers sans toucher au code.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/80 p-1.5 rounded-2xl border border-slate-700/60 flex-shrink-0">
              <button
                onClick={() => setViewMode('tenant')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  viewMode === 'tenant'
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Building2 className="w-4 h-4" /> Boutique active
              </button>
              <button
                onClick={() => setViewMode('global')}
                className={`px-4 py-2 rounded-xl text-xs font-semibold transition-all flex items-center gap-2 ${
                  viewMode === 'global'
                    ? 'bg-sky-500 text-white shadow-lg shadow-sky-500/20'
                    : 'text-slate-300 hover:text-white hover:bg-slate-700/50'
                }`}
              >
                <Globe className="w-4 h-4" /> Cockpit Plateforme 360°
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Platform Cockpit View */}
      {isSuperAdmin && viewMode === 'global' ? (
        <div className="space-y-6 animate-in fade-in duration-200">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Cockpit Plateforme 360°</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Supervision consolidée de l’ensemble des entreprises clientes et utilisateurs hébergés</p>
          </div>

          {/* Global KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">Entreprises clientes</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 sm:mt-2">
                    {formatNumber(globalStats.totalEntreprises)}
                  </p>
                  <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                    {globalStats.entreprisesActives} actives {globalStats.entreprisesSuspendues > 0 && `• ${globalStats.entreprisesSuspendues} suspendue(s)`}
                  </p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-5 h-5 text-sky-600 dark:text-sky-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">Comptes utilisateurs</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 sm:mt-2">
                    {formatNumber(globalStats.totalUsers)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">Tous rôles confondus</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">Catalogue global</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 sm:mt-2">
                    {formatNumber(globalStats.totalProduits)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">Articles en stock</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center flex-shrink-0">
                  <Package className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                </div>
              </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-xs sm:text-sm text-slate-500 font-medium">Flux & Commandes</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 dark:text-slate-100 mt-1 sm:mt-2">
                    {formatNumber(globalStats.totalCommandes)}
                  </p>
                  <p className="text-[11px] text-slate-400 mt-1">Ventes et achats</p>
                </div>
                <div className="w-10 h-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <ShoppingCart className="w-5 h-5 text-amber-600 dark:text-amber-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Tenants Supervision Table */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
              <div>
                <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-sky-600 dark:text-sky-400" /> Annuaire des entreprises clientes
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Prenez le contrôle d'une entreprise en 1 clic pour vérifier son activité ou intervenez sur son paramétrage.
                </p>
              </div>
              <button
                onClick={() => onNavigate('parametres')}
                className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-xl bg-sky-600 hover:bg-sky-700 text-white shadow-md shadow-sky-500/20 transition-all self-start sm:self-auto"
              >
                + Nouvelle entreprise / Pack
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-400">Entreprise</th>
                    <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-400">Ville & Devise</th>
                    <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-400">Pack</th>
                    <th className="text-center py-2 font-semibold text-slate-600 dark:text-slate-400">Modules</th>
                    <th className="text-center py-2 font-semibold text-slate-600 dark:text-slate-400">Statut</th>
                    <th className="text-right py-2 font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {entreprises.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3">
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded-lg bg-sky-50 dark:bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400 font-bold text-xs">
                            {e.nom.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-900 dark:text-slate-100">{e.nom}</p>
                            <p className="text-xs text-slate-400">{e.slogan || e.email || 'Aucune description'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="py-3 text-slate-600 dark:text-slate-300 text-xs">
                        <p className="font-medium text-slate-800 dark:text-slate-200">{e.ville || 'Non renseigné'}</p>
                        <p className="text-slate-400">{e.devise || 'XOF'} {e.tva_active ? `• TVA ${e.tva_taux}%` : ''}</p>
                      </td>
                      <td className="py-3">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold ${
                          e.pack === 'premium' || e.pack === 'pro'
                            ? 'bg-purple-50 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300'
                            : e.pack === 'standard'
                            ? 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300'
                            : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                        }`}>
                          {e.pack ? e.pack.charAt(0).toUpperCase() + e.pack.slice(1) : 'Standard'}
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {e.modules?.length ?? 18} / 18
                        </span>
                      </td>
                      <td className="py-3 text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${
                          e.suspendue
                            ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'
                            : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                        }`}>
                          {e.suspendue ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                          {e.suspendue ? 'Suspendue' : 'Active'}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => {
                              if (onSelectEntreprise) {
                                onSelectEntreprise(e.id);
                                setViewMode('tenant');
                                showToast(`Contrôle pris sur « ${e.nom} »`);
                              }
                            }}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100 dark:hover:bg-sky-500/20 transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" /> Prendre le contrôle
                          </button>
                          <button
                            onClick={() => onNavigate('parametres')}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            title="Gérer les modules et pack"
                          >
                            <Settings className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* Regular Tenant Dashboard */
        <>
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Tableau de bord</h1>
            <p className="text-slate-500 dark:text-slate-400 mt-1">Vue d'ensemble 360 de votre activité</p>
          </div>

      {/* Stats grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {stats.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 sm:p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs sm:text-sm text-slate-500 font-medium truncate">{stat.label}</p>
                  <p className="text-lg sm:text-2xl font-bold text-slate-900 mt-1 sm:mt-2">{stat.value}</p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                  <Icon className={`w-5 h-5 ${stat.iconColor}`} />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Movements trend */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Évolution des mouvements de stock</h3>
          <LineChart data={monthData} formatValue={formatNumber} color="#0ea5e9" height={200} />
        </div>
        {/* Stock by category */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-semibold text-slate-900 mb-4">Stock par catégorie</h3>
          {stockByCat.length > 0 ? (
            <DonutChart data={stockByCat} size={140} />
          ) : (
            <p className="text-sm text-slate-400 text-center py-8">Aucune donnée</p>
          )}
        </div>
      </div>

      {/* Stock alerts */}
      {produitsAlerte.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-amber-50 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-amber-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Alertes de stock faible</h2>
            </div>
            <span className="text-sm font-medium text-amber-700 bg-amber-50 px-3 py-1 rounded-full">
              {produitsAlerte.length} produit{produitsAlerte.length > 1 ? 's' : ''}
            </span>
          </div>
          <div className="divide-y divide-slate-100">
            {produitsAlerte.slice(0, 5).map((p) => (
              <div key={p.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                <div className="flex items-center gap-3">
                  <div className={`w-2 h-2 rounded-full ${p.quantite === 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
                  <div>
                    <p className="font-medium text-slate-900">{p.nom}</p>
                    <p className="text-xs text-slate-500">{p.sku || 'Sans SKU'}</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className={`font-semibold ${p.quantite === 0 ? 'text-red-600' : 'text-amber-700'}`}>{p.quantite} {p.unite}</p>
                  <p className="text-xs text-slate-500">Seuil: {p.seuil_alerte}</p>
                </div>
              </div>
            ))}
          </div>
          {produitsAlerte.length > 5 && (
            <button onClick={() => onNavigate('produits')} className="w-full px-6 py-3 text-sm font-medium text-sky-600 hover:bg-slate-50 transition-colors flex items-center justify-center gap-1">
              Voir tous les produits <ArrowRight className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Recent orders + movements */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Recent orders */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-sky-50 flex items-center justify-center">
                <ShoppingCart className="w-5 h-5 text-sky-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Commandes récentes</h2>
            </div>
            <button onClick={() => onNavigate('commandes')} className="text-sm text-sky-600 font-medium hover:text-sky-700">Voir tout</button>
          </div>
          <div className="divide-y divide-slate-100">
            {commandes.slice(0, 4).length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">Aucune commande</p>
            ) : (
              commandes.slice(0, 4).map((c) => {
                const sc = statutColor(c.statut);
                return (
                  <div key={c.id} className="flex items-center justify-between px-6 py-3 hover:bg-slate-50 transition-colors">
                    <div>
                      <p className="font-medium text-slate-900">{c.reference || '—'}</p>
                      <p className="text-xs text-slate-500">{c.type === 'achat' ? c.fournisseurs?.nom : c.clients?.nom} • {formatDate(c.date_commande)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-semibold text-slate-900">{formatCurrency(c.montant_total)}</span>
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{statutLabel(c.statut)}
                      </span>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Recent movements */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-violet-50 flex items-center justify-center">
                <ArrowLeftRight className="w-5 h-5 text-violet-600" />
              </div>
              <h2 className="text-lg font-semibold text-slate-900">Mouvements</h2>
            </div>
          </div>
          <div className="divide-y divide-slate-100">
            {mouvements.slice(0, 5).length === 0 ? (
              <p className="px-6 py-8 text-sm text-slate-400 text-center">Aucun mouvement</p>
            ) : (
              mouvements.slice(0, 5).map((m) => (
                <div key={m.id} className="px-6 py-3 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-slate-900 truncate">{m.produits?.nom || '—'}</p>
                      <p className="text-xs text-slate-500">{formatDate(m.created_at)}</p>
                    </div>
                    <span className={`text-sm font-semibold flex-shrink-0 ml-2 ${m.type === 'entree' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {m.type === 'entree' ? '+' : '−'}{m.quantite}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <button onClick={() => onNavigate('produits')} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:shadow-md hover:border-sky-300 transition-all">
          <Package className="w-7 h-7 text-sky-600 mb-2" />
          <h3 className="font-semibold text-slate-900 text-sm">Produits</h3>
        </button>
        <button onClick={() => onNavigate('commandes')} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:shadow-md hover:border-emerald-300 transition-all">
          <ShoppingCart className="w-7 h-7 text-emerald-600 mb-2" />
          <h3 className="font-semibold text-slate-900 text-sm">Commandes</h3>
        </button>
        <button onClick={() => onNavigate('mouvements')} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:shadow-md hover:border-violet-300 transition-all">
          <ArrowLeftRight className="w-7 h-7 text-violet-600 mb-2" />
          <h3 className="font-semibold text-slate-900 text-sm">Mouvements</h3>
        </button>
        <button onClick={() => onNavigate('rapports')} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 text-left hover:shadow-md hover:border-amber-300 transition-all">
          <TrendingUp className="w-7 h-7 text-amber-600 mb-2" />
          <h3 className="font-semibold text-slate-900 text-sm">Rapports</h3>
        </button>
      </div>
        </>
      )}
    </div>
  );
}
