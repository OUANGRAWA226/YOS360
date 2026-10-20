import {
  Package,
  TrendingUp,
  AlertTriangle,
  Tags,
  ArrowLeftRight,
  ArrowRight,
  ShoppingCart,
  Users,
  Truck,
  DollarSign,
  Building2,
  Globe,
  ShieldAlert,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  Settings,
  RefreshCw,
} from 'lucide-react';
import type { ProduitWithCategorie, MouvementWithProduit, Categorie, CommandeWithRelations, Fournisseur, Client, Entreprise } from '@/lib/supabase';
import { supabase } from '@/lib/supabase';
import type { Page } from '@/App';
import { formatCurrency, formatNumber, formatDate, statutLabel, statutColor } from '@/lib/format';
import { LineChart, DonutChart } from '@/components/Charts';
import { useMemo, useState, useEffect } from 'react';
import { useAuth } from '@/lib/auth';
import { showToast } from '@/components/Toast';
import { SmallBox, InfoBox, Card, Callout } from '@/components/adminlte';

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

  const fetchGlobalStats = () => {
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
  };

  useEffect(() => {
    fetchGlobalStats();
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

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 dark:bg-slate-800 rounded-md animate-pulse" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2 h-72 bg-gray-200 dark:bg-slate-800 rounded-md animate-pulse" />
          <div className="h-72 bg-gray-200 dark:bg-slate-800 rounded-md animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Super Admin Top Control Banner */}
      {isSuperAdmin && (
        <div className="bg-[#0c1612] text-white rounded-md border-t-[3px] border-t-[#48B068] shadow-sm p-4 sm:p-5">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded text-xs font-semibold bg-[#48B068]/20 text-[#5CC47D] mb-1">
                <Sparkles className="w-3.5 h-3.5" /> GOUVERNANCE SUPER ADMINISTRATEUR
              </div>
              <h2 className="text-xl font-bold tracking-tight text-white">
                Vision Globale & Pilotage No-Code YOS360
              </h2>
              <p className="text-xs sm:text-sm text-slate-300 mt-0.5 max-w-2xl">
                Supervisez tous les clients, configurez les modules à la volée et gérez toutes les actions métiers sans passer par le code.
              </p>
            </div>
            <div className="flex items-center gap-2 bg-slate-900/80 p-1 rounded-md border border-slate-700 flex-shrink-0">
              <button
                onClick={() => setViewMode('tenant')}
                className={`btn-lte btn-lte-sm ${
                  viewMode === 'tenant'
                    ? 'btn-lte-primary shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" /> Boutique active
              </button>
              <button
                onClick={() => setViewMode('global')}
                className={`btn-lte btn-lte-sm ${
                  viewMode === 'global'
                    ? 'btn-lte-primary shadow-sm font-semibold'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                <Globe className="w-3.5 h-3.5" /> Cockpit Plateforme 360°
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Platform Cockpit View */}
      {isSuperAdmin && viewMode === 'global' ? (
        <div className="space-y-5">
          {/* Global Super Admin Info Boxes */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoBox
              title="Entreprises Clientes"
              value={formatNumber(globalStats.totalEntreprises)}
              variant="primary"
              icon={Building2}
              progress={Math.round((globalStats.entreprisesActives / Math.max(1, globalStats.totalEntreprises)) * 100)}
              description={`${globalStats.entreprisesActives} actives • ${globalStats.entreprisesSuspendues} suspendue(s)`}
            />
            <InfoBox
              title="Comptes Utilisateurs"
              value={formatNumber(globalStats.totalUsers)}
              variant="info"
              icon={Users}
              progress={85}
              description="Tous rôles confondus"
            />
            <InfoBox
              title="Catalogue Global"
              value={formatNumber(globalStats.totalProduits)}
              variant="success"
              icon={Package}
              progress={70}
              description="Articles en stock hébergés"
            />
            <InfoBox
              title="Flux & Commandes"
              value={formatNumber(globalStats.totalCommandes)}
              variant="warning"
              icon={ShoppingCart}
              progress={90}
              description="Ventes et achats consolidés"
            />
          </div>

          {/* Tenants Supervision Table in AdminLTE Card */}
          <Card
            title="Annuaire des Entreprises Clientes"
            variant="primary"
            outline={true}
            collapsible={true}
            maximizable={true}
            tools={
              <div className="flex items-center gap-2">
                <button
                  onClick={fetchGlobalStats}
                  className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                  title="Actualiser"
                >
                  <RefreshCw className="w-3 h-3" />
                </button>
                <button
                  onClick={() => onNavigate('parametres')}
                  className="btn-lte btn-lte-sm btn-lte-primary"
                >
                  + Nouvelle entreprise / Pack
                </button>
              </div>
            }
          >
            <div className="overflow-x-auto -mx-4 -my-3 sm:-mx-5 sm:-my-4">
              <table className="table-adminlte">
                <thead>
                  <tr>
                    <th className="text-left">Entreprise</th>
                    <th className="text-left">Ville & Devise</th>
                    <th className="text-center">Pack</th>
                    <th className="text-center">Modules</th>
                    <th className="text-center">Statut</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {entreprises.map((e) => (
                    <tr key={e.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className="w-8 h-8 rounded bg-[#0270B8]/10 text-[#0270B8] dark:bg-[#0270B8]/20 dark:text-[#4FAEEB] font-bold text-xs flex items-center justify-center">
                            {e.nom.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white leading-snug">{e.nom}</p>
                            <p className="text-xs text-gray-400">{e.slogan || e.email || 'Aucune description'}</p>
                          </div>
                        </div>
                      </td>
                      <td className="text-xs">
                        <p className="font-medium text-gray-800 dark:text-gray-200">{e.ville || 'Non renseigné'}</p>
                        <p className="text-gray-400">{e.devise || 'XOF'} {e.tva_active ? `• TVA ${e.tva_taux}%` : ''}</p>
                      </td>
                      <td className="text-center">
                        <span className={`inline-block px-2.5 py-0.5 rounded text-xs font-semibold ${
                          e.pack === 'premium' || e.pack === 'pro'
                            ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/40 dark:text-purple-300'
                            : e.pack === 'standard'
                            ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                        }`}>
                          {e.pack ? e.pack.charAt(0).toUpperCase() + e.pack.slice(1) : 'Standard'}
                        </span>
                      </td>
                      <td className="text-center">
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {e.modules?.length ?? 18} / 18
                        </span>
                      </td>
                      <td className="text-center">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold ${
                          e.suspendue
                            ? 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300'
                            : 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300'
                        }`}>
                          {e.suspendue ? <ShieldAlert className="w-3 h-3" /> : <ShieldCheck className="w-3 h-3" />}
                          {e.suspendue ? 'Suspendue' : 'Active'}
                        </span>
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => {
                              if (onSelectEntreprise) {
                                onSelectEntreprise(e.id);
                                setViewMode('tenant');
                                showToast(`Contrôle pris sur « ${e.nom} »`);
                              }
                            }}
                            className="btn-lte btn-lte-sm btn-lte-outline-primary"
                          >
                            <ExternalLink className="w-3 h-3" /> Contrôler
                          </button>
                          <button
                            onClick={() => onNavigate('parametres')}
                            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                            title="Gérer les modules et pack"
                          >
                            <Settings className="w-3 h-3" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : (
        /* Regular Tenant Dashboard */
        <>
          {/* AdminLTE v4 Iconic Small-Boxes Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Box 1: Info (Cyan) - Nouvelles Commandes */}
            <SmallBox
              title={formatNumber(cmdEnAttente)}
              text="Commandes en attente"
              variant="info"
              icon={ShoppingCart}
              linkText="Plus d'infos"
              onLinkClick={() => onNavigate('commandes')}
            />

            {/* Box 2: Success (Green) - Catalogue Articles */}
            <SmallBox
              title={formatNumber(totalProduits)}
              text="Catalogue articles"
              variant="success"
              icon={Package}
              linkText="Plus d'infos"
              onLinkClick={() => onNavigate('produits')}
            />

            {/* Box 3: Warning (Amber) - Alertes Stock */}
            <SmallBox
              title={formatNumber(produitsAlerte.length)}
              text="Alertes de stock"
              variant="warning"
              icon={AlertTriangle}
              linkText="Plus d'infos"
              onLinkClick={() => onNavigate('produits')}
            />

            {/* Box 4: Danger (Red) - Valeur du stock */}
            <SmallBox
              title={formatCurrency(valeurStock)}
              text="Valeur du stock"
              variant="danger"
              icon={TrendingUp}
              linkText="Plus d'infos"
              onLinkClick={() => onNavigate('rapports')}
            />
          </div>

          {/* AdminLTE v4 Secondary Info-Boxes Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <InfoBox
              title="Articles en stock"
              value={formatNumber(totalStock)}
              variant="info"
              icon={Tags}
              progress={Math.min(100, Math.round((totalStock / Math.max(1, totalStock + 200)) * 100))}
              description="Unités réelles en rayon"
            />
            <InfoBox
              title="Valeur de vente"
              value={formatCurrency(valeurVente)}
              variant="success"
              icon={DollarSign}
              progress={80}
              description="Potentiel commercial estimé"
            />
            <InfoBox
              title="Portefeuille Clients"
              value={formatNumber(clients.length)}
              variant="primary"
              icon={Users}
              progress={65}
              description="Comptes clients enregistrés"
              onClick={() => onNavigate('clients')}
            />
            <InfoBox
              title="Fournisseurs"
              value={formatNumber(fournisseurs.length)}
              variant="secondary"
              icon={Truck}
              progress={50}
              description="Partenaires d'approvisionnement"
              onClick={() => onNavigate('fournisseurs')}
            />
          </div>

          {/* Charts Row */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Stock Movement Line Chart */}
            <div className="lg:col-span-2">
              <Card
                title="Évolution des mouvements de stock (7 derniers mois)"
                variant="primary"
                outline={true}
                collapsible={true}
                maximizable={true}
                tools={
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {mouvements.length} mouvements
                  </span>
                }
              >
                <LineChart data={monthData} formatValue={formatNumber} color="#0270B8" height={220} />
              </Card>
            </div>

            {/* Stock by Category Donut Chart */}
            <div>
              <Card
                title="Stock par catégorie"
                variant="info"
                outline={true}
                collapsible={true}
                maximizable={true}
                tools={
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {categories.length} catégories
                  </span>
                }
              >
                {stockByCat.length > 0 ? (
                  <DonutChart data={stockByCat} size={150} />
                ) : (
                  <p className="text-sm text-gray-400 text-center py-10">Aucune donnée de catégorie</p>
                )}
              </Card>
            </div>
          </div>

          {/* Stock Alerts Warning Card */}
          {produitsAlerte.length > 0 && (
            <Card
              title="Alertes de stock faible ou rupture imminente"
              variant="warning"
              outline={true}
              collapsible={true}
              tools={
                <span className="bg-[#ffc107] text-gray-900 px-2 py-0.5 rounded text-xs font-bold">
                  {produitsAlerte.length} article{produitsAlerte.length > 1 ? 's' : ''}
                </span>
              }
              footer={
                produitsAlerte.length > 5 ? (
                  <button
                    onClick={() => onNavigate('produits')}
                    className="w-full text-center text-xs font-semibold text-[#0270B8] dark:text-[#4FAEEB] hover:underline flex items-center justify-center gap-1"
                  >
                    Voir tous les produits en alerte <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                ) : undefined
              }
            >
              <div className="overflow-x-auto -mx-4 -my-3 sm:-mx-5 sm:-my-4">
                <table className="table-adminlte">
                  <thead>
                    <tr>
                      <th className="text-left">Produit</th>
                      <th className="text-left">SKU</th>
                      <th className="text-center">Quantité actuelle</th>
                      <th className="text-center">Seuil d'alerte</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {produitsAlerte.slice(0, 5).map((p) => (
                      <tr key={p.id}>
                        <td>
                          <div className="flex items-center gap-2">
                            <span className={`w-2.5 h-2.5 rounded-full ${p.quantite === 0 ? 'bg-[#dc3545]' : 'bg-[#ffc107]'}`} />
                            <span className="font-semibold text-gray-900 dark:text-white">{p.nom}</span>
                          </div>
                        </td>
                        <td className="text-xs text-gray-500 font-mono">{p.sku || '—'}</td>
                        <td className="text-center">
                          <span className={`font-bold ${p.quantite === 0 ? 'text-[#dc3545]' : 'text-[#ffc107]'}`}>
                            {p.quantite} {p.unite}
                          </span>
                        </td>
                        <td className="text-center text-xs text-gray-500">{p.seuil_alerte} {p.unite}</td>
                        <td className="text-right">
                          <button
                            onClick={() => onNavigate('produits')}
                            className="btn-lte btn-lte-sm btn-lte-outline-primary"
                          >
                            Réapprovisionner
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {/* Recent Orders & Movements in AdminLTE Cards */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recent Orders */}
            <div className="lg:col-span-2">
              <Card
                title="Dernières Commandes"
                variant="primary"
                outline={true}
                collapsible={true}
                tools={
                  <button
                    onClick={() => onNavigate('commandes')}
                    className="btn-lte btn-lte-sm btn-lte-outline-primary"
                  >
                    Voir tout
                  </button>
                }
              >
                <div className="overflow-x-auto -mx-4 -my-3 sm:-mx-5 sm:-my-4">
                  <table className="table-adminlte">
                    <thead>
                      <tr>
                        <th className="text-left">Réf.</th>
                        <th className="text-left">Tiers & Date</th>
                        <th className="text-right">Montant</th>
                        <th className="text-center">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {commandes.slice(0, 5).length === 0 ? (
                        <tr>
                          <td colSpan={4} className="text-center py-6 text-gray-400">
                            Aucune commande enregistrée
                          </td>
                        </tr>
                      ) : (
                        commandes.slice(0, 5).map((c) => {
                          const sc = statutColor(c.statut);
                          return (
                            <tr key={c.id}>
                              <td className="font-semibold text-gray-900 dark:text-white font-mono text-xs">
                                {c.reference || '—'}
                              </td>
                              <td className="text-xs">
                                <p className="font-medium text-gray-800 dark:text-gray-200">
                                  {c.type === 'achat' ? c.fournisseurs?.nom : c.clients?.nom}
                                </p>
                                <p className="text-gray-400">{formatDate(c.date_commande)}</p>
                              </td>
                              <td className="text-right font-bold text-gray-900 dark:text-white">
                                {formatCurrency(c.montant_total)}
                              </td>
                              <td className="text-center">
                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold ${sc.bg} ${sc.text}`}>
                                  {statutLabel(c.statut)}
                                </span>
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>

            {/* Recent Movements */}
            <div>
              <Card
                title="Flux de Stock Récents"
                variant="secondary"
                outline={true}
                collapsible={true}
                tools={
                  <button
                    onClick={() => onNavigate('mouvements')}
                    className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                  >
                    Historique
                  </button>
                }
              >
                <div className="space-y-2.5">
                  {mouvements.slice(0, 5).length === 0 ? (
                    <p className="text-center text-sm text-gray-400 py-6">Aucun mouvement</p>
                  ) : (
                    mouvements.slice(0, 5).map((m) => (
                      <div
                        key={m.id}
                        className="flex items-center justify-between p-2 rounded bg-gray-50 dark:bg-slate-800/60 border border-gray-100 dark:border-slate-800 text-xs"
                      >
                        <div className="min-w-0 pr-2">
                          <p className="font-semibold text-gray-900 dark:text-white truncate">
                            {m.produits?.nom || 'Article'}
                          </p>
                          <p className="text-gray-400">{formatDate(m.created_at)}</p>
                        </div>
                        <span
                          className={`font-bold flex-shrink-0 px-2 py-0.5 rounded text-xs ${
                            m.type === 'entree'
                              ? 'bg-[#48B068]/15 text-[#117A35] dark:bg-[#48B068]/20 dark:text-[#5CC47D]'
                              : 'bg-red-100 text-[#dc3545] dark:bg-red-950/40 dark:text-red-300'
                          }`}
                        >
                          {m.type === 'entree' ? '+' : '−'}{m.quantite}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </Card>
            </div>
          </div>

          {/* Quick Shortcuts */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <button
              onClick={() => onNavigate('produits')}
              className="p-3 bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-800 text-left hover:border-[#48B068] hover:shadow-sm transition-all group"
            >
              <Package className="w-6 h-6 text-[#48B068] mb-1.5 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-gray-900 dark:text-white text-xs">Catalogue Produits</h4>
              <p className="text-[11px] text-gray-400">Gérer stocks & tarifs</p>
            </button>
            <button
              onClick={() => onNavigate('commandes')}
              className="p-3 bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-800 text-left hover:border-[#0270B8] hover:shadow-sm transition-all group"
            >
              <ShoppingCart className="w-6 h-6 text-[#0270B8] mb-1.5 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-gray-900 dark:text-white text-xs">Commandes</h4>
              <p className="text-[11px] text-gray-400">Ventes & achats</p>
            </button>
            <button
              onClick={() => onNavigate('caisse')}
              className="p-3 bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-800 text-left hover:border-[#0dcaf0] hover:shadow-sm transition-all group"
            >
              <DollarSign className="w-6 h-6 text-[#0dcaf0] mb-1.5 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-gray-900 dark:text-white text-xs">Caisse Tactile</h4>
              <p className="text-[11px] text-gray-400">Point de vente POS</p>
            </button>
            <button
              onClick={() => onNavigate('rapports')}
              className="p-3 bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-800 text-left hover:border-[#ffc107] hover:shadow-sm transition-all group"
            >
              <TrendingUp className="w-6 h-6 text-[#ffc107] mb-1.5 group-hover:scale-110 transition-transform" />
              <h4 className="font-bold text-gray-900 dark:text-white text-xs">Statistiques</h4>
              <p className="text-[11px] text-gray-400">Analyses financières</p>
            </button>
          </div>
        </>
      )}
    </div>
  );
}
