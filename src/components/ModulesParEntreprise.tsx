import { useState } from 'react';
import { Building2, Check, Loader2, PauseCircle, PlayCircle, Package, ShieldAlert, Plus, X, Sparkles, ShoppingBasket, Truck, Store } from 'lucide-react';
import { supabase, type Entreprise } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { ConfirmDialog } from '@/components/ConfirmDialog';

const MODULES: { id: string; label: string; desc: string }[] = [
  { id: 'dashboard', label: 'Tableau de bord', desc: 'Vue synthétique de l’activité' },
  { id: 'produits', label: 'Produits', desc: 'Catalogue et fiches produits' },
  { id: 'categories', label: 'Catégories', desc: 'Organisation du catalogue' },
  { id: 'mouvements', label: 'Mouvements', desc: 'Entrées et sorties de stock' },
  { id: 'entrepots', label: 'Entrepôts & boutiques', desc: 'Multi-sites' },
  { id: 'transferts', label: 'Transferts', desc: 'Transferts entre sites' },
  { id: 'inventaires', label: 'Inventaires', desc: 'Comptages physiques' },
  { id: 'lots', label: 'Lots & péremption', desc: 'Traçabilité et FEFO' },
  { id: 'scan', label: 'Scan & étiquettes', desc: 'Codes-barres' },
  { id: 'reappro', label: 'Réapprovisionnement', desc: 'Suggestions et réappro auto' },
  { id: 'fournisseurs', label: 'Fournisseurs', desc: 'Partenaires d’achat' },
  { id: 'clients', label: 'Clients', desc: 'Répertoire clients' },
  { id: 'commandes', label: 'Commandes', desc: 'Achats et ventes' },
  { id: 'paiements', label: 'Paiements & créances', desc: 'Encaissements, dettes' },
  { id: 'caisse', label: 'Caisse (POS)', desc: 'Point de vente' },
  { id: 'achats', label: 'Achats', desc: 'Demandes, bons de commande, réceptions' },
  { id: 'tarifs', label: 'Tarifs & promotions', desc: 'Grilles par type de client' },
  { id: 'validations', label: 'Validations', desc: 'Circuit d’approbation' },
  { id: 'tresorerie', label: 'Trésorerie', desc: 'Caisses, banques, dépenses' },
  { id: 'comptabilite', label: 'Comptabilité SYSCOHADA', desc: 'Journaux et états financiers' },
  { id: 'equipe', label: 'Équipe & commissions', desc: 'Commerciaux et objectifs' },
  { id: 'import_export', label: 'Import / export', desc: 'Données en masse' },
  { id: 'rapports', label: 'Rapports', desc: 'Analyses et exports' },
  { id: 'audit', label: 'Journal d’audit', desc: 'Traçabilité des actions' },
  { id: 'parametres', label: 'Paramètres', desc: 'Configuration' },
];

export const PACKS: { id: string; label: string; modules: string[]; desc: string }[] = [
  {
    id: 'basique',
    label: 'Basique',
    desc: 'Catalogue, stock simple et tableau de bord',
    modules: ['dashboard', 'produits', 'categories', 'mouvements', 'scan', 'rapports', 'parametres'],
  },
  {
    id: 'standard',
    label: 'Standard',
    desc: 'Basique + ventes, clients et point de vente',
    modules: ['dashboard', 'produits', 'categories', 'mouvements', 'scan', 'inventaires', 'clients', 'commandes', 'caisse', 'paiements', 'rapports', 'parametres'],
  },
  {
    id: 'premium',
    label: 'Premium',
    desc: 'Standard + multi-sites, lots, réappro et audit',
    modules: ['dashboard', 'produits', 'categories', 'mouvements', 'entrepots', 'transferts', 'inventaires', 'lots', 'scan', 'reappro', 'fournisseurs', 'clients', 'commandes', 'paiements', 'caisse', 'rapports', 'audit', 'parametres'],
  },
];

// Modèles métier : modules, catégories, grilles tarifaires et premier site,
// appliqués côté base par appliquer_modele_metier (super admin uniquement)
export const MODELES: { id: 'superette' | 'grossiste'; label: string; icon: typeof Store; desc: string; points: string[] }[] = [
  {
    id: 'superette',
    label: 'Supérette / Alimentation',
    icon: ShoppingBasket,
    desc: 'Commerce de détail alimentaire',
    points: [
      'Caisse rapide, codes-barres, hors ligne',
      'Péremptions (FEFO) et inventaires',
      'Prix détail et client fidèle (−3 %)',
      '8 catégories : épicerie, boissons, frais…',
    ],
  },
  {
    id: 'grossiste',
    label: 'Grossiste / Distributeur',
    icon: Truck,
    desc: 'Négoce en volume',
    points: [
      'Tarifs détail, demi-gros (−5 %), gros (−10 %)',
      'Plusieurs dépôts et transferts',
      'Crédit client, trésorerie, comptabilité',
      'Commerciaux et commissions',
    ],
  },
];

type ModeleResultat = { categories_creees: number; grilles_creees: number; site_cree: boolean; modules: number };

type Props = {
  entreprise: Entreprise | null;
  entreprises: Entreprise[];
  onEntrepriseSaved: (e: Entreprise) => void;
  onEntrepriseCreated?: (e: Entreprise) => void;
};

export function ModulesParEntreprise({ entreprise, entreprises, onEntrepriseSaved, onEntrepriseCreated }: Props) {
  const [selectedId, setSelectedId] = useState(entreprise?.id ?? entreprises[0]?.id ?? '');
  const [busy, setBusy] = useState(false);
  const [suspending, setSuspending] = useState<Entreprise | null>(null);
  const [packTarget, setPackTarget] = useState<string | null>(null);
  const [modeleTarget, setModeleTarget] = useState<string | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newEnt, setNewEnt] = useState({
    nom: '',
    slogan: '',
    ville: 'Ouagadougou',
    telephone: '',
    email: '',
    devise: 'XOF',
    tva_taux: 18,
    tva_active: true,
    pack: 'standard',
    secteur: '' as '' | 'superette' | 'grossiste',
  });

  const selected = entreprises.find((e) => e.id === selectedId) ?? null;
  const actifs = new Set(selected?.modules ?? []);

  const patchEntreprise = async (id: string, patch: Partial<Entreprise>, successMsg: string) => {
    setBusy(true);
    const { data, error } = await supabase
      .from('entreprises')
      .update(patch)
      .eq('id', id)
      .select()
      .single();
    setBusy(false);
    if (error || !data) {
      showToast('Échec de la mise à jour : ' + (error?.message ?? 'erreur inconnue'), 'error');
      return null;
    }
    showToast(successMsg);
    onEntrepriseSaved(data as Entreprise);
    return data as Entreprise;
  };

  const handleCreateEntreprise = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newEnt.nom.trim()) {
      showToast('Le nom de l’entreprise est requis', 'error');
      return;
    }
    setCreating(true);
    const packObj = PACKS.find((p) => p.id === newEnt.pack) ?? PACKS[1];
    const secteur = newEnt.secteur;
    const { data, error } = await supabase
      .from('entreprises')
      .insert({
        nom: newEnt.nom.trim(),
        slogan: newEnt.slogan.trim() || null,
        ville: newEnt.ville.trim() || null,
        telephone: newEnt.telephone.trim() || null,
        email: newEnt.email.trim() || null,
        devise: newEnt.devise || 'XOF',
        tva_taux: newEnt.tva_active ? Number(newEnt.tva_taux) || 18 : 0,
        tva_active: newEnt.tva_active,
        pack: newEnt.pack,
        modules: packObj.modules,
      })
      .select()
      .single();

    if (error || !data) {
      setCreating(false);
      showToast('Erreur création entreprise : ' + (error?.message ?? 'inconnue'), 'error');
      return;
    }

    // Modèle métier : modules, catégories, grilles et premier site créés côté base.
    // Sinon : initialisation minimale (dépôt et catégorie par défaut).
    if (secteur) {
      const out = await runModele(data.id, secteur);
      if (out) Object.assign(data, out.ent);
    } else await Promise.all([
      supabase.from('entrepots').insert({
        entreprise_id: data.id,
        nom: 'Boutique Principale',
        code: 'BOUTIQUE-01',
      }),
      supabase.from('categories').insert({
        entreprise_id: data.id,
        nom: 'Général',
        couleur: '#0ea5e9',
      }),
    ]);

    setCreating(false);
    showToast(`Entreprise « ${data.nom} » créée et configurée avec succès !`);
    setSelectedId(data.id);
    setShowCreateModal(false);
    setNewEnt({
      nom: '',
      slogan: '',
      ville: 'Ouagadougou',
      telephone: '',
      email: '',
      devise: 'XOF',
      tva_taux: 18,
      tva_active: true,
      pack: 'standard',
      secteur: '',
    });
    onEntrepriseSaved(data as Entreprise);
    if (onEntrepriseCreated) onEntrepriseCreated(data as Entreprise);
  };

  const toggle = async (moduleId: string) => {
    if (!selected) return;
    const next = new Set(actifs);
    if (next.has(moduleId)) next.delete(moduleId);
    else next.add(moduleId);
    await patchEntreprise(selected.id, { modules: Array.from(next) }, 'Modules mis à jour');
  };

  const applyPack = async (packId: string) => {
    if (!selected) return;
    const pack = PACKS.find((p) => p.id === packId);
    if (!pack) return;
    await patchEntreprise(selected.id, { modules: [...pack.modules], pack: pack.id }, `Pack « ${pack.label} » appliqué à ${selected.nom}`);
  };

  // Applique un modèle métier puis recharge l'entreprise (modules, secteur, pack à jour)
  const runModele = async (entrepriseId: string, secteur: string): Promise<{ ent: Entreprise; res: ModeleResultat } | null> => {
    const { data, error } = await supabase.rpc('appliquer_modele_metier', { p_entreprise: entrepriseId, p_secteur: secteur });
    if (error) {
      showToast('Échec du modèle métier : ' + error.message, 'error');
      return null;
    }
    const { data: ent } = await supabase.from('entreprises').select('*').eq('id', entrepriseId).single();
    if (!ent) return null;
    onEntrepriseSaved(ent as Entreprise);
    return { ent: ent as Entreprise, res: data as ModeleResultat };
  };

  const applyModele = async (secteur: string) => {
    if (!selected) return;
    setBusy(true);
    const out = await runModele(selected.id, secteur);
    setBusy(false);
    if (!out) return;
    const modele = MODELES.find((m) => m.id === secteur);
    const ajouts = [
      out.res.categories_creees ? `${out.res.categories_creees} catégorie(s)` : null,
      out.res.grilles_creees ? `${out.res.grilles_creees} grille(s) tarifaire(s)` : null,
      out.res.site_cree ? '1 point de vente' : null,
    ].filter(Boolean);
    showToast(`${selected.nom} configurée en « ${modele?.label} » : ${out.res.modules} modules${ajouts.length ? ', ' + ajouts.join(', ') + ' ajoutés' : ''}`);
  };

  const toggleSuspend = async () => {
    if (!suspending) return;
    const target = suspending;
    setSuspending(null);
    await patchEntreprise(target.id, { suspendue: !target.suspendue }, target.suspendue ? `${target.nom} réactivée` : `${target.nom} suspendue`);
  };

  if (entreprises.length === 0) return null;

  return (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
      <div className="flex items-start justify-between gap-4 mb-1">
        <div>
          <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Building2 className="w-5 h-5 text-sky-600 dark:text-sky-400" /> Gouvernance des entreprises clientes
          </h3>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez vos clients sans code : activez un pack, ajustez les modules à la volée, suspendez un compte ou créez une nouvelle entreprise prête à l'emploi.
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md shadow-sky-500/20 hover:from-sky-600 hover:to-blue-700 transition-all flex-shrink-0"
        >
          <Plus className="w-4 h-4" /> Nouvelle entreprise
        </button>
      </div>

      <div className="flex flex-wrap gap-2 my-5">
        {entreprises.map((e) => (
          <button
            key={e.id}
            onClick={() => setSelectedId(e.id)}
            className={`px-4 py-2 rounded-xl text-sm font-medium border transition-colors inline-flex items-center gap-1.5 ${
              e.id === selectedId
                ? 'bg-sky-600 text-white border-sky-600 shadow-sm'
                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
            }`}
          >
            {e.suspendue && <ShieldAlert className="w-3.5 h-3.5 text-red-500" />}
            {e.nom}
            {e.secteur && (
              <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-md ${e.id === selectedId ? 'bg-white/20' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'}`}>
                {e.secteur === 'superette' ? 'Supérette' : 'Grossiste'}
              </span>
            )}
          </button>
        ))}
      </div>

      {selected && (
        <div className="space-y-5">
          {/* Bandeau suspension */}
          {selected.suspendue && (
            <div className="rounded-xl border border-red-300 bg-red-50 dark:border-red-500/40 dark:bg-red-500/10 p-4 flex items-center gap-3">
              <ShieldAlert className="w-5 h-5 text-red-600 flex-shrink-0" />
              <p className="text-sm text-red-700 dark:text-red-300 flex-1">
                Cette entreprise est suspendue : ses utilisateurs voient un écran de blocage et ne peuvent plus utiliser l’application.
              </p>
            </div>
          )}

          {/* Modèles métier */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-1">
              <Store className="w-4 h-4 text-emerald-600" /> Modèle métier
            </p>
            <p className="text-xs text-slate-400 mb-2">
              Configure l’entreprise pour son métier en un clic : modules, catégories de produits, grilles tarifaires et premier point de vente.
              Rien de ce que le client a déjà créé n’est supprimé.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {MODELES.map((m) => {
                const Icon = m.icon;
                const active = selected.secteur === m.id;
                return (
                  <button
                    key={m.id}
                    onClick={() => setModeleTarget(m.id)}
                    disabled={busy}
                    className={`p-4 rounded-xl border text-left transition-all disabled:opacity-50 ${
                      active
                        ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${active ? 'bg-emerald-600 text-white' : 'bg-white dark:bg-slate-900 text-emerald-600 border border-slate-200 dark:border-slate-700'}`}>
                        <Icon className="w-[18px] h-[18px]" />
                      </span>
                      <span className="min-w-0">
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{m.label}</span>
                        <span className="block text-xs text-slate-400">{active ? 'Modèle actuel' : m.desc}</span>
                      </span>
                      {active && <Check className="w-4 h-4 text-emerald-600 ml-auto" />}
                    </span>
                    <ul className="mt-3 space-y-1">
                      {m.points.map((pt) => (
                        <li key={pt} className="text-xs text-slate-500 dark:text-slate-400 flex gap-1.5">
                          <span className="text-emerald-500" aria-hidden="true">•</span>{pt}
                        </li>
                      ))}
                    </ul>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Packs */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-1.5 mb-2">
              <Package className="w-4 h-4 text-sky-600" /> Packs de modules
              {selected.pack && (
                <span className="ml-2 text-xs font-normal text-slate-400">
                  Pack actuel : {PACKS.find((p) => p.id === selected.pack)?.label ?? MODELES.find((m) => m.id === selected.pack)?.label ?? selected.pack}
                  {selected.pack !== 'complet' && ' (peut avoir été ajusté à la main)'}
                </span>
              )}
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PACKS.map((p) => {
                const active = p.id === selected.pack;
                return (
                  <button
                    key={p.id}
                    onClick={() => setPackTarget(p.id)}
                    disabled={busy}
                    className={`p-3 rounded-xl border text-left transition-all disabled:opacity-50 ${
                      active
                        ? 'border-sky-400 bg-sky-50 dark:border-sky-500/50 dark:bg-sky-500/10'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                  >
                    <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{p.label}</span>
                    <span className="block text-xs text-slate-400 mt-0.5">{p.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Modules à la main */}
          <div>
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">Ajustement manuel des modules</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {MODULES.map((m) => {
                const on = actifs.has(m.id);
                return (
                  <button
                    key={m.id}
                    onClick={() => toggle(m.id)}
                    disabled={busy}
                    className={`flex items-start gap-3 p-3 rounded-xl border text-left transition-all disabled:opacity-50 ${
                      on
                        ? 'border-emerald-300 bg-emerald-50 dark:border-emerald-500/40 dark:bg-emerald-500/10'
                        : 'border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/50'
                    }`}
                  >
                    <span className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center flex-shrink-0 ${
                      on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'
                    }`}>
                      {on && <Check className="w-3.5 h-3.5 text-white" />}
                    </span>
                    <span className="min-w-0">
                      <span className={`block text-sm font-medium ${on ? 'text-emerald-900 dark:text-emerald-300' : 'text-slate-700 dark:text-slate-300'}`}>
                        {m.label}
                      </span>
                      <span className="block text-xs text-slate-400">{m.desc}</span>
                    </span>
                    {busy && on && <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-500 ml-auto" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Suspension */}
          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
            <p className="text-xs text-slate-400">
              La suspension bloque l’accès de tous les utilisateurs de cette entreprise, sans supprimer aucune donnée.
            </p>
            <button
              onClick={() => setSuspending(selected)}
              disabled={busy}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium rounded-xl transition-colors disabled:opacity-50 flex-shrink-0 ${
                selected.suspendue
                  ? 'text-white bg-emerald-600 hover:bg-emerald-700'
                  : 'text-red-700 bg-red-50 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:hover:bg-red-500/20'
              }`}
            >
              {selected.suspendue ? <PlayCircle className="w-4 h-4" /> : <PauseCircle className="w-4 h-4" />}
              {selected.suspendue ? 'Réactiver l’accès' : 'Suspendre l’accès'}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={!!packTarget}
        onClose={() => setPackTarget(null)}
        onConfirm={() => {
          const packId = packTarget;
          setPackTarget(null);
          if (packId) applyPack(packId);
        }}
        title="Appliquer ce pack ?"
        message={`Les modules de ${selected?.nom ?? 'cette entreprise'} seront remplacés par ceux du pack sélectionné. Les ajustements manuels seront perdus.`}
        confirmLabel="Appliquer"
      />

      <ConfirmDialog
        open={!!modeleTarget}
        onClose={() => setModeleTarget(null)}
        onConfirm={() => {
          const id = modeleTarget;
          setModeleTarget(null);
          if (id) applyModele(id);
        }}
        title={`Appliquer le modèle « ${MODELES.find((m) => m.id === modeleTarget)?.label ?? ''} » ?`}
        message={`Les modules de ${selected?.nom ?? 'cette entreprise'} seront remplacés par ceux du modèle. Les catégories, grilles tarifaires et le premier point de vente manquants seront ajoutés ; rien d’existant n’est supprimé.`}
        confirmLabel="Appliquer"
      />

      <ConfirmDialog
        open={!!suspending}
        onClose={() => setSuspending(null)}
        onConfirm={toggleSuspend}
        title={suspending?.suspendue ? 'Réactiver l’accès' : 'Suspendre l’accès'}
        message={
          suspending?.suspendue
            ? `Les utilisateurs de ${suspending?.nom} retrouveront immédiatement l’accès à l’application.`
            : `Tous les utilisateurs de ${suspending?.nom} verront un écran de blocage à leur prochaine action. Aucune donnée n’est supprimée.`
        }
        confirmLabel={suspending?.suspendue ? 'Réactiver' : 'Suspendre'}
      />

      {/* Modal Création Entreprise */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-xl w-full p-6 sm:p-7 relative overflow-hidden">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-sky-500/10 dark:bg-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Nouvelle entreprise cliente</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Créez un nouveau tenant 100% prêt à l'emploi</p>
                </div>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateEntreprise} className="space-y-4 pt-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Nom de l'entreprise *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: Pharmacie du Progrès, Supermarché Faso..."
                    value={newEnt.nom}
                    onChange={(e) => setNewEnt({ ...newEnt, nom: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Slogan ou activité
                  </label>
                  <input
                    type="text"
                    placeholder="Ex: Vente au détail & demi-gros"
                    value={newEnt.slogan}
                    onChange={(e) => setNewEnt({ ...newEnt, slogan: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Ville
                  </label>
                  <input
                    type="text"
                    value={newEnt.ville}
                    onChange={(e) => setNewEnt({ ...newEnt, ville: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Téléphone
                  </label>
                  <input
                    type="tel"
                    placeholder="+226 70 00 00 00"
                    value={newEnt.telephone}
                    onChange={(e) => setNewEnt({ ...newEnt, telephone: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Devise principale
                  </label>
                  <select
                    value={newEnt.devise}
                    onChange={(e) => setNewEnt({ ...newEnt, devise: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    <option value="XOF">FCFA (XOF)</option>
                    <option value="EUR">Euro (EUR)</option>
                    <option value="USD">Dollar (USD)</option>
                    <option value="GHS">Cedi (GHS)</option>
                    <option value="NGN">Naira (NGN)</option>
                  </select>
                </div>

                <div className="sm:col-span-2">
                  <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Modèle métier
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {[{ id: '' as const, label: 'Configuration libre', desc: 'Choisir un pack' }, ...MODELES.map((m) => ({ id: m.id, label: m.label, desc: m.desc }))].map((m) => (
                      <button
                        key={m.id || 'libre'}
                        type="button"
                        onClick={() => setNewEnt({ ...newEnt, secteur: m.id })}
                        aria-pressed={newEnt.secteur === m.id}
                        className={`p-2.5 rounded-xl border text-left transition-colors ${
                          newEnt.secteur === m.id
                            ? 'border-emerald-400 bg-emerald-50 dark:border-emerald-500/50 dark:bg-emerald-500/10'
                            : 'border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                        }`}
                      >
                        <span className="block text-sm font-semibold text-slate-800 dark:text-slate-100">{m.label}</span>
                        <span className="block text-xs text-slate-400">{m.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className={newEnt.secteur ? 'hidden' : ''}>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Pack initial
                  </label>
                  <select
                    value={newEnt.pack}
                    onChange={(e) => setNewEnt({ ...newEnt, pack: e.target.value })}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-sky-500"
                  >
                    {PACKS.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.label} ({p.modules.length} modules)
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newEnt.tva_active}
                    onChange={(e) => setNewEnt({ ...newEnt, tva_active: e.target.checked })}
                    className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-slate-300"
                  />
                  <span>Assujetti à la TVA (18% par défaut)</span>
                </label>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-gradient-to-r from-sky-500 to-blue-600 hover:from-sky-600 hover:to-blue-700 rounded-xl shadow-md shadow-sky-500/20 transition-all disabled:opacity-50"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Créer et activer l'entreprise
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
