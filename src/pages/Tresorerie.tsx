import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Wallet,
  Landmark,
  Smartphone,
  CreditCard,
  Plus,
  Search,
  Filter,
  ArrowRight,
  ArrowLeftRight,
  CheckCircle2,
  AlertTriangle,
  Receipt,
  Download,
  Calendar,
  Building2,
  DollarSign,
  PieChart,
  Eye,
  Check,
  X,
  FileText,
  Upload,
} from 'lucide-react';
import type {
  TresorerieCompte,
  TresorerieMouvement,
  Depense,
  DepenseCategorie,
  Entrepot,
} from '@/lib/supabase';
import { Card, InfoBox, SmallBox, Callout } from '@/components/adminlte';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, formatCurrency } from '@/lib/format';
import { fetchTable, writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';
import { calculerRapprochementBancaire } from '@/lib/comptaSyscohada';

type Props = {
  role: Role | null;
  entrepots: Entrepot[];
  loading: boolean;
};

type TabType = 'comptes' | 'depenses' | 'rapprochement';

export function Tresorerie({ role, entrepots, loading: parentLoading }: Props) {
  const { profile, entrepriseId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('comptes');
  const [loading, setLoading] = useState(true);

  // Données
  const [comptes, setComptes] = useState<TresorerieCompte[]>([]);
  const [mouvements, setMouvements] = useState<TresorerieMouvement[]>([]);
  const [categories, setCategories] = useState<DepenseCategorie[]>([]);
  const [depenses, setDepenses] = useState<Depense[]>([]);

  // Filtres
  const [selectedCompteId, setSelectedCompteId] = useState<string>('all');
  const [selectedCategorieId, setSelectedCategorieId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [newCompteModal, setNewCompteModal] = useState(false);
  const [virementModal, setVirementModal] = useState(false);
  const [newDepenseModal, setNewDepenseModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulaires
  const [compteForm, setCompteForm] = useState({
    nom: '',
    type: 'banque' as TresorerieCompte['type'],
    etablissement: '',
    numero_compte: '',
    solde_initial: '0',
    compte_comptable_numero: '521000',
    site_id: '',
  });

  const [virementForm, setVirementForm] = useState({
    compte_source_id: '',
    compte_dest_id: '',
    montant: '',
    date_virement: new Date().toISOString().slice(0, 10),
    motif: 'Virement interne de trésorerie',
  });

  const [depenseForm, setDepenseForm] = useState({
    categorie_id: '',
    compte_tresorerie_id: '',
    numero_depense: '',
    date_depense: new Date().toISOString().slice(0, 10),
    montant: '',
    beneficiaire: '',
    motif: '',
    mode_reglement: 'especes' as Depense['mode_reglement'],
    numero_facture_fournisseur: '',
    site_id: '',
  });

  // Rapprochement bancaire assisté
  const [rapprochementCompteId, setRapprochementCompteId] = useState<string>('');
  const [soldeReleveInput, setSoldeReleveInput] = useState<string>('0');

  const canEdit = can(role, 'paiements', 'edit') || role === 'admin' || role === 'gerant' || role === 'comptable';

  const loadAll = useCallback(async () => {
    if (!entrepriseId) return;
    setLoading(true);
    try {
      const [cpts, mvts, cats, deps] = await Promise.all([
        fetchTable<TresorerieCompte>('tresorerie_comptes', '*, entrepots(nom)', { column: 'nom', ascending: true }),
        fetchTable<TresorerieMouvement>('tresorerie_mouvements', '*, compte:compte_id(*)', { column: 'date_mouvement', ascending: false }, 300),
        fetchTable<DepenseCategorie>('depenses_categories', '*', { column: 'nom', ascending: true }),
        fetchTable<Depense>('depenses', '*, categorie:categorie_id(*), compte:compte_tresorerie_id(*)', { column: 'date_depense', ascending: false }, 300),
      ]);
      setComptes(cpts);
      setMouvements(mvts);
      setCategories(cats);
      setDepenses(deps);
      if (cpts.length > 0 && !rapprochementCompteId) {
        setRapprochementCompteId(cpts[0].id);
        setSoldeReleveInput(String(cpts[0].solde_actuel || 0));
      }
    } catch (err) {
      console.error('Erreur chargement trésorerie:', err);
    } finally {
      setLoading(false);
    }
  }, [entrepriseId, rapprochementCompteId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Totaux de trésorerie
  const totalTresorerieGlobale = useMemo(() => {
    return comptes.reduce((sum, c) => sum + (Number(c.solde_actuel) || 0), 0);
  }, [comptes]);

  const totalDepensesMois = useMemo(() => {
    const currentMonth = new Date().toISOString().slice(0, 7);
    return depenses
      .filter((d) => d.date_depense.startsWith(currentMonth))
      .reduce((sum, d) => sum + (Number(d.montant) || 0), 0);
  }, [depenses]);

  // Rapprochement du compte sélectionné
  const compteRapprochementActif = useMemo(() => {
    return comptes.find((c) => c.id === rapprochementCompteId) || null;
  }, [comptes, rapprochementCompteId]);

  const mouvementsCompteRapprochement = useMemo(() => {
    return mouvements.filter((m) => m.compte_id === rapprochementCompteId);
  }, [mouvements, rapprochementCompteId]);

  const statsRapprochement = useMemo(() => {
    if (!compteRapprochementActif) {
      return {
        soldeComptableTheorique: 0,
        soldeReleveBancaire: 0,
        totalMouvementsRapproches: 0,
        totalMouvementsEnSuspens: 0,
        ecartRapprochement: 0,
        estConforme: true,
      };
    }
    const soldeReleveNum = parseFloat(soldeReleveInput) || 0;
    return calculerRapprochementBancaire(
      mouvementsCompteRapprochement,
      compteRapprochementActif.solde_initial || 0,
      soldeReleveNum
    );
  }, [compteRapprochementActif, mouvementsCompteRapprochement, soldeReleveInput]);

  // Créer un compte de trésorerie
  const handleCreateCompte = async () => {
    if (!compteForm.nom) {
      showToast('Le nom du compte est obligatoire', 'error');
      return;
    }
    setSaving(true);
    try {
      const initial = parseFloat(compteForm.solde_initial) || 0;
      const { error } = await writeRow('tresorerie_comptes', 'insert', {
        entreprise_id: entrepriseId,
        site_id: compteForm.site_id || null,
        nom: compteForm.nom,
        type: compteForm.type,
        etablissement: compteForm.etablissement || null,
        numero_compte: compteForm.numero_compte || null,
        solde_initial: initial,
        solde_actuel: initial,
        compte_comptable_numero: compteForm.compte_comptable_numero,
        actif: true,
      });
      if (error) throw new Error(error);

      showToast('Compte de trésorerie créé avec succès');
      setNewCompteModal(false);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la création du compte', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Virement interne de trésorerie
  const handleVirement = async () => {
    const { compte_source_id, compte_dest_id, montant, date_virement, motif } = virementForm;
    const mnt = parseFloat(montant) || 0;

    if (!compte_source_id || !compte_dest_id) {
      showToast('Sélectionnez un compte source et un compte de destination', 'error');
      return;
    }
    if (compte_source_id === compte_dest_id) {
      showToast('Le compte source et destination doivent être différents', 'error');
      return;
    }
    if (mnt <= 0) {
      showToast('Le montant du virement doit être supérieur à zéro', 'error');
      return;
    }

    const source = comptes.find((c) => c.id === compte_source_id);
    const dest = comptes.find((c) => c.id === compte_dest_id);
    if (!source || !dest) return;

    if (source.solde_actuel < mnt) {
      showToast(`Solde insuffisant sur ${source.nom} (${formatCurrency(source.solde_actuel)})`, 'error');
      return;
    }

    setSaving(true);
    try {
      // 1. Débit source
      const soldeSourceApres = source.solde_actuel - mnt;
      await writeRow('tresorerie_mouvements', 'insert', {
        entreprise_id: entrepriseId,
        compte_id: source.id,
        date_mouvement: date_virement,
        type: 'decaissement',
        montant: mnt,
        solde_avant: source.solde_actuel,
        solde_apres: soldeSourceApres,
        motif: `Virement vers ${dest.nom} — ${motif}`,
        reference_operation: `VIR-${Date.now().toString().slice(-6)}`,
      });
      await writeRow('tresorerie_comptes', 'update', { solde_actuel: soldeSourceApres }, source.id);

      // 2. Crédit destination
      const soldeDestApres = dest.solde_actuel + mnt;
      await writeRow('tresorerie_mouvements', 'insert', {
        entreprise_id: entrepriseId,
        compte_id: dest.id,
        date_mouvement: date_virement,
        type: 'encaissement',
        montant: mnt,
        solde_avant: dest.solde_actuel,
        solde_apres: soldeDestApres,
        motif: `Virement reçu de ${source.nom} — ${motif}`,
        reference_operation: `VIR-${Date.now().toString().slice(-6)}`,
      });
      await writeRow('tresorerie_comptes', 'update', { solde_actuel: soldeDestApres }, dest.id);

      showToast(`Virement de ${formatCurrency(mnt)} exécuté avec succès`);
      setVirementModal(false);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors du virement', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Enregistrer une dépense
  const handleSaveDepense = async () => {
    const { categorie_id, compte_tresorerie_id, date_depense, montant, beneficiaire, motif, mode_reglement } = depenseForm;
    const mnt = parseFloat(montant) || 0;

    if (!categorie_id || !beneficiaire || !motif || mnt <= 0) {
      showToast('Veuillez renseigner la catégorie, le bénéficiaire, le motif et le montant', 'error');
      return;
    }

    setSaving(true);
    try {
      const numDepense = depenseForm.numero_depense || `DEP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(100 + Math.random() * 900)}`;

      // 1. Insertion dépense
      const { error } = await writeRow('depenses', 'insert', {
        entreprise_id: entrepriseId,
        site_id: depenseForm.site_id || null,
        categorie_id,
        compte_tresorerie_id: compte_tresorerie_id || null,
        numero_depense: numDepense,
        date_depense,
        montant: mnt,
        beneficiaire,
        motif,
        mode_reglement,
        numero_facture_fournisseur: depenseForm.numero_facture_fournisseur || null,
        statut: 'payee',
        created_by: profile?.id || null,
      });

      if (error) throw new Error(error);

      // 2. Si un compte de trésorerie a été débité, créer le mouvement correspondant
      if (compte_tresorerie_id) {
        const cpt = comptes.find((c) => c.id === compte_tresorerie_id);
        if (cpt) {
          const nouveauSolde = cpt.solde_actuel - mnt;
          await writeRow('tresorerie_mouvements', 'insert', {
            entreprise_id: entrepriseId,
            compte_id: cpt.id,
            site_id: depenseForm.site_id || null,
            date_mouvement: date_depense,
            type: 'decaissement',
            montant: mnt,
            solde_avant: cpt.solde_actuel,
            solde_apres: nouveauSolde,
            motif: `Dépense ${numDepense} — ${motif} (${beneficiaire})`,
            reference_operation: numDepense,
            tiers_nom: beneficiaire,
          });
          await writeRow('tresorerie_comptes', 'update', { solde_actuel: nouveauSolde }, cpt.id);
        }
      }

      showToast('Dépense enregistrée et compte débité avec succès');
      setNewDepenseModal(false);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de l\'enregistrement de la dépense', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Basculer l'état de pointage / rapprochement d'un mouvement
  const togglePointage = async (m: TresorerieMouvement) => {
    const nouveauStatut = m.statut_rapprochement === 'rapproche' ? 'non_rapproche' : 'rapproche';
    await writeRow(
      'tresorerie_mouvements',
      'update',
      {
        statut_rapprochement: nouveauStatut,
        date_rapprochement: nouveauStatut === 'rapproche' ? new Date().toISOString().slice(0, 10) : null,
      },
      m.id
    );
    setMouvements((prev) =>
      prev.map((x) => (x.id === m.id ? { ...x, statut_rapprochement: nouveauStatut } : x))
    );
  };

  function getCompteIcon(type: TresorerieCompte['type']) {
    switch (type) {
      case 'banque':
        return Landmark;
      case 'orange_money':
      case 'moov_money':
      case 'wave':
        return Smartphone;
      default:
        return Wallet;
    }
  }

  return (
    <div className="space-y-6">
      {/* AdminLTE App Header Page Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Wallet className="w-7 h-7 text-emerald-600 dark:text-emerald-400" />
            <span>Trésorerie & Dépenses d'Exploitation</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Comptes bancaires, caisses physiques, Mobile Money (Orange, Moov, Wave), charges et rapprochement assisté.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canEdit && (
            <>
              <button
                onClick={() => setVirementModal(true)}
                disabled={comptes.length < 2}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Virement interne</span>
              </button>

              <button
                onClick={() => {
                  setDepenseForm({
                    categorie_id: categories[0]?.id || '',
                    compte_tresorerie_id: comptes[0]?.id || '',
                    numero_depense: '',
                    date_depense: new Date().toISOString().slice(0, 10),
                    montant: '',
                    beneficiaire: '',
                    motif: '',
                    mode_reglement: 'especes',
                    numero_facture_fournisseur: '',
                    site_id: entrepots[0]?.id || '',
                  });
                  setNewDepenseModal(true);
                }}
                className="px-3.5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Nouvelle dépense</span>
              </button>

              <button
                onClick={() => {
                  setCompteForm({
                    nom: '',
                    type: 'banque',
                    etablissement: '',
                    numero_compte: '',
                    solde_initial: '0',
                    compte_comptable_numero: '521000',
                    site_id: entrepots[0]?.id || '',
                  });
                  setNewCompteModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau compte</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* AdminLTE Metric Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          icon={Landmark}
          title="Trésorerie disponible"
          value={formatCurrency(totalTresorerieGlobale)}
          variant="success"
          description={`${comptes.length} comptes actifs`}
        />
        <InfoBox
          icon={Receipt}
          title="Dépenses du mois"
          value={formatCurrency(totalDepensesMois)}
          variant="danger"
          description="Charges d'exploitation payées"
        />
        <InfoBox
          icon={Smartphone}
          title="Solde Mobile Money"
          value={formatCurrency(
            comptes
              .filter((c) => ['orange_money', 'moov_money', 'wave'].includes(c.type))
              .reduce((s, c) => s + (Number(c.solde_actuel) || 0), 0)
          )}
          variant="warning"
          description="Orange, Moov & Wave cumulés"
        />
        <InfoBox
          icon={CheckCircle2}
          title="Mouvements enregistrés"
          value={formatNumber(mouvements.length)}
          variant="info"
          description={`${mouvements.filter((m) => m.statut_rapprochement === 'rapproche').length} pointés`}
        />
      </div>

      {/* Navigation par Onglets */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('comptes')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'comptes'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Wallet className="w-4 h-4" />
          <span>Comptes & Soldes ({comptes.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('depenses')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'depenses'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Dépenses d'Exploitation ({depenses.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('rapprochement')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'rapprochement'
              ? 'border-emerald-600 text-emerald-600 dark:border-emerald-400 dark:text-emerald-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <CheckCircle2 className="w-4 h-4" />
          <span>Rapprochement Bancaire Assisté</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ONGLET 1 : COMPTES DE TRÉSORERIE */}
      {/* ========================================================================= */}
      {activeTab === 'comptes' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {comptes.map((c) => {
              const IconCompte = getCompteIcon(c.type);
              const isPositive = c.solde_actuel >= 0;

              return (
                <div
                  key={c.id}
                  className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2.5">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300">
                          <IconCompte className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <div>
                          <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">{c.nom}</h3>
                          <p className="text-[11px] text-slate-500 capitalize">
                            {c.etablissement || c.type.replace('_', ' ')} {c.numero_compte ? `• ${c.numero_compte}` : ''}
                          </p>
                        </div>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                        {c.compte_comptable_numero || '521'}
                      </span>
                    </div>

                    <div className="my-4">
                      <p className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold">Solde disponible</p>
                      <p className={`text-2xl font-black font-mono mt-0.5 ${isPositive ? 'text-slate-900 dark:text-slate-100' : 'text-rose-600'}`}>
                        {formatCurrency(c.solde_actuel)}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500">
                    <span>Initial : {formatCurrency(c.solde_initial)}</span>
                    <button
                      onClick={() => {
                        setRapprochementCompteId(c.id);
                        setSoldeReleveInput(String(c.solde_actuel));
                        setActiveTab('rapprochement');
                      }}
                      className="text-sky-600 dark:text-sky-400 font-semibold hover:underline flex items-center gap-1"
                    >
                      <span>Rapprocher</span>
                      <ArrowRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Historique des derniers mouvements de trésorerie */}
          <Card title="Derniers mouvements de trésorerie" badge={`${mouvements.length} opérations`}>
            {mouvements.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Aucun mouvement de trésorerie enregistré.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[11px] uppercase">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Compte</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Motif & Bénéficiaire</th>
                      <th className="py-2.5 px-3">Réf</th>
                      <th className="py-2.5 px-3 text-right">Montant</th>
                      <th className="py-2.5 px-3 text-center">Pointage</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {mouvements.slice(0, 50).map((m) => (
                      <tr key={m.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatDate(m.date_mouvement)}</td>
                        <td className="py-2.5 px-3 font-semibold text-slate-800 dark:text-slate-200 whitespace-nowrap">
                          {m.compte?.nom || 'Compte'}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold ${
                            m.type === 'encaissement'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                          }`}>
                            {m.type === 'encaissement' ? 'Encaissement' : 'Décaissement'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                          {m.motif} {m.tiers_nom ? `(${m.tiers_nom})` : ''}
                        </td>
                        <td className="py-2.5 px-3 font-mono text-slate-500 whitespace-nowrap">
                          {m.reference_operation || '—'}
                        </td>
                        <td className={`py-2.5 px-3 text-right font-mono font-bold whitespace-nowrap ${
                          m.type === 'encaissement' ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {m.type === 'encaissement' ? '+' : '-'} {formatCurrency(m.montant)}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {m.statut_rapprochement === 'rapproche' ? (
                            <span className="inline-flex items-center gap-1 text-emerald-600 font-bold text-[11px]">
                              <CheckCircle2 className="w-3.5 h-3.5" /> Pointé
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">En suspens</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 2 : DÉPENSES D'EXPLOITATION */}
      {/* ========================================================================= */}
      {activeTab === 'depenses' && (
        <div className="space-y-6">
          {/* Suivi budgétaire mensuel par catégorie */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {categories.map((cat) => {
              const depensesCat = depenses.filter((d) => d.categorie_id === cat.id);
              const totalDepensesCat = depensesCat.reduce((s, d) => s + (Number(d.montant) || 0), 0);
              const budgetMax = cat.budget_mensuel_max || 1;
              const pct = Math.min(Math.round((totalDepensesCat / budgetMax) * 100), 100);

              return (
                <div key={cat.id} className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100">{cat.nom}</span>
                    <span className="text-[10px] font-mono text-slate-400">Compte {cat.code_comptable}</span>
                  </div>
                  <div className="flex items-baseline justify-between text-xs mb-1.5 font-mono">
                    <strong className="text-slate-900 dark:text-slate-100">{formatCurrency(totalDepensesCat)}</strong>
                    <span className="text-slate-400">Budget : {formatCurrency(cat.budget_mensuel_max)}</span>
                  </div>
                  <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        pct > 90 ? 'bg-rose-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          <Card title="Journal des charges et dépenses d'exploitation" badge={`${depenses.length} dépenses`}>
            {depenses.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Aucune dépense enregistrée.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[11px] uppercase">
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">N° Dépense</th>
                      <th className="py-2.5 px-3">Catégorie</th>
                      <th className="py-2.5 px-3">Bénéficiaire & Motif</th>
                      <th className="py-2.5 px-3">Mode règlement</th>
                      <th className="py-2.5 px-3">Compte débité</th>
                      <th className="py-2.5 px-3 text-right">Montant (FCFA)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {depenses.map((d) => (
                      <tr key={d.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                        <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatDate(d.date_depense)}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-sky-600 dark:text-sky-400 whitespace-nowrap">
                          {d.numero_depense}
                        </td>
                        <td className="py-2.5 px-3 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {d.categorie?.nom || 'Générale'}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="font-semibold text-slate-900 dark:text-slate-100">{d.beneficiaire}</span>
                          <span className="text-slate-500 block text-[11px]">{d.motif}</span>
                        </td>
                        <td className="py-2.5 px-3 capitalize text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {d.mode_reglement.replace('_', ' ')}
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                          {d.compte?.nom || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-right font-mono font-bold text-rose-600 whitespace-nowrap">
                          {formatCurrency(d.montant)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 3 : RAPPROCHEMENT BANCAIRE ASSISTÉ */}
      {/* ========================================================================= */}
      {activeTab === 'rapprochement' && (
        <div className="space-y-6">
          {/* Sélection du compte à rapprocher */}
          <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Compte à rapprocher :
              </label>
              <select
                value={rapprochementCompteId}
                onChange={(e) => {
                  setRapprochementCompteId(e.target.value);
                  const selected = comptes.find((c) => c.id === e.target.value);
                  if (selected) setSoldeReleveInput(String(selected.solde_actuel || 0));
                }}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-bold text-slate-900 dark:text-slate-100"
              >
                {comptes.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom} ({c.type.replace('_', ' ')})</option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
                Solde du relevé bancaire (FCFA) :
              </label>
              <input
                type="number"
                value={soldeReleveInput}
                onChange={(e) => setSoldeReleveInput(e.target.value)}
                className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 w-44 text-right"
              />
            </div>
          </div>

          {/* Synthèse du rapprochement */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500">Solde théorique (Écritures pointées)</p>
              <p className="text-xl font-mono font-bold text-slate-900 dark:text-slate-100 mt-1">
                {formatCurrency(statsRapprochement.soldeComptableTheorique - statsRapprochement.totalMouvementsEnSuspens)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                Total pointé : {formatCurrency(statsRapprochement.totalMouvementsRapproches)}
              </p>
            </div>

            <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
              <p className="text-xs text-slate-500">Opérations en suspens (Non pointées)</p>
              <p className="text-xl font-mono font-bold text-amber-600 mt-1">
                {formatCurrency(statsRapprochement.totalMouvementsEnSuspens)}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {mouvementsCompteRapprochement.filter((m) => m.statut_rapprochement !== 'rapproche').length} écriture(s) en attente
              </p>
            </div>

            <div className={`p-4 rounded-2xl border ${
              statsRapprochement.estConforme
                ? 'border-emerald-200 bg-emerald-50/50 dark:bg-emerald-500/10 dark:border-emerald-500/30'
                : 'border-rose-200 bg-rose-50/50 dark:bg-rose-500/10 dark:border-rose-500/30'
            }`}>
              <p className="text-xs text-slate-500">Écart de rapprochement</p>
              <p className={`text-xl font-mono font-black mt-1 ${
                statsRapprochement.estConforme ? 'text-emerald-700 dark:text-emerald-400' : 'text-rose-700 dark:text-rose-400'
              }`}>
                {formatCurrency(statsRapprochement.ecartRapprochement)}
              </p>
              <p className="text-[11px] font-semibold mt-1">
                {statsRapprochement.estConforme ? '✓ Relevé et écritures conformes' : '⚠️ Écart à justifier'}
              </p>
            </div>
          </div>

          {/* Grille de pointage */}
          <Card
            title={`Pointage des mouvements sur ${compteRapprochementActif?.nom || 'ce compte'}`}
            badge={`${mouvementsCompteRapprochement.length} opérations`}
          >
            {mouvementsCompteRapprochement.length === 0 ? (
              <div className="text-center py-8 text-slate-400 text-xs">
                Aucun mouvement enregistré pour ce compte.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[11px] uppercase">
                      <th className="py-2.5 px-3 text-center">Pointé</th>
                      <th className="py-2.5 px-3">Date</th>
                      <th className="py-2.5 px-3">Opération / Motif</th>
                      <th className="py-2.5 px-3">Réf</th>
                      <th className="py-2.5 px-3 text-right">Débit (+)</th>
                      <th className="py-2.5 px-3 text-right">Crédit (-)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {mouvementsCompteRapprochement.map((m) => {
                      const isPointed = m.statut_rapprochement === 'rapproche';

                      return (
                        <tr
                          key={m.id}
                          onClick={() => togglePointage(m)}
                          className={`cursor-pointer transition-colors ${
                            isPointed
                              ? 'bg-emerald-50/40 dark:bg-emerald-500/5 hover:bg-emerald-100/50'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isPointed}
                              onChange={() => togglePointage(m)}
                              className="rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                            />
                          </td>
                          <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{formatDate(m.date_mouvement)}</td>
                          <td className="py-2.5 px-3 text-slate-900 dark:text-slate-100 font-medium">
                            {m.motif} {m.tiers_nom ? `— ${m.tiers_nom}` : ''}
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-400 whitespace-nowrap">
                            {m.reference_operation || '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-600 whitespace-nowrap">
                            {m.type === 'encaissement' ? formatCurrency(m.montant) : '—'}
                          </td>
                          <td className="py-2.5 px-3 text-right font-mono font-semibold text-rose-600 whitespace-nowrap">
                            {m.type === 'decaissement' ? formatCurrency(m.montant) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL : NOUVEAU COMPTE */}
      {/* ========================================================================= */}
      {newCompteModal && (
        <Modal open={true} onClose={() => setNewCompteModal(false)} title="Créer un compte de trésorerie" size="md">
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Nom du compte *</label>
              <input
                type="text"
                placeholder="ex: Compte Coris Bank Entreprise, Caisse Showroom..."
                value={compteForm.nom}
                onChange={(e) => setCompteForm({ ...compteForm, nom: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Type de compte *</label>
                <select
                  value={compteForm.type}
                  onChange={(e) => {
                    const t = e.target.value as any;
                    let cNum = '521000';
                    if (t === 'caisse_physique') cNum = '571000';
                    if (t === 'orange_money') cNum = '521100';
                    if (t === 'moov_money') cNum = '521200';
                    if (t === 'wave') cNum = '521300';
                    setCompteForm({ ...compteForm, type: t, compte_comptable_numero: cNum });
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                >
                  <option value="banque">Banque locale</option>
                  <option value="caisse_physique">Caisse physique (Espèces)</option>
                  <option value="orange_money">Orange Money Marchand</option>
                  <option value="moov_money">Moov Money (Flooz)</option>
                  <option value="wave">Wave Marchand</option>
                  <option value="autre">Autre compte</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Établissement</label>
                <input
                  type="text"
                  placeholder="ex: Coris Bank, Orange, Moov..."
                  value={compteForm.etablissement}
                  onChange={(e) => setCompteForm({ ...compteForm, etablissement: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Numéro de compte / Tél</label>
                <input
                  type="text"
                  placeholder="ex: BF054... ou +226 70..."
                  value={compteForm.numero_compte}
                  onChange={(e) => setCompteForm({ ...compteForm, numero_compte: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Solde initial (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  value={compteForm.solde_initial}
                  onChange={(e) => setCompteForm({ ...compteForm, solde_initial: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono text-slate-900 dark:text-slate-100 text-right"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setNewCompteModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleCreateCompte}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? 'Création...' : 'Créer le compte'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL : VIREMENT INTERNE */}
      {/* ========================================================================= */}
      {virementModal && (
        <Modal open={true} onClose={() => setVirementModal(false)} title="Virement Interne de Trésorerie" size="md">
          <div className="space-y-4">
            <Callout variant="info" title="Virement entre comptes">
              Cette opération débite immédiatement le compte source et crédite le compte de destination sans impact sur le résultat comptable.
            </Callout>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Compte source (Débité) *</label>
                <select
                  value={virementForm.compte_source_id}
                  onChange={(e) => setVirementForm({ ...virementForm, compte_source_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100"
                >
                  <option value="">Sélectionner</option>
                  {comptes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom} ({formatCurrency(c.solde_actuel)})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Compte destination (Crédité) *</label>
                <select
                  value={virementForm.compte_dest_id}
                  onChange={(e) => setVirementForm({ ...virementForm, compte_dest_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100"
                >
                  <option value="">Sélectionner</option>
                  {comptes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom} ({formatCurrency(c.solde_actuel)})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Montant à transférer (FCFA) *</label>
                <input
                  type="number"
                  min="1"
                  value={virementForm.montant}
                  onChange={(e) => setVirementForm({ ...virementForm, montant: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 text-right"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Date du virement *</label>
                <input
                  type="date"
                  value={virementForm.date_virement}
                  onChange={(e) => setVirementForm({ ...virementForm, date_virement: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Motif du virement</label>
              <input
                type="text"
                value={virementForm.motif}
                onChange={(e) => setVirementForm({ ...virementForm, motif: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setVirementModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleVirement}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? 'Exécution...' : 'Confirmer le virement'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL : NOUVELLE DÉPENSE */}
      {/* ========================================================================= */}
      {newDepenseModal && (
        <Modal open={true} onClose={() => setNewDepenseModal(false)} title="Enregistrer une dépense d'exploitation" size="md">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Catégorie budgétaire *</label>
                <select
                  value={depenseForm.categorie_id}
                  onChange={(e) => setDepenseForm({ ...depenseForm, categorie_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Compte débité</label>
                <select
                  value={depenseForm.compte_tresorerie_id}
                  onChange={(e) => setDepenseForm({ ...depenseForm, compte_tresorerie_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100"
                >
                  <option value="">Aucun (Déjà réglé en externe)</option>
                  {comptes.map((c) => (
                    <option key={c.id} value={c.id}>{c.nom} ({formatCurrency(c.solde_actuel)})</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Montant (FCFA) *</label>
                <input
                  type="number"
                  min="1"
                  placeholder="0"
                  value={depenseForm.montant}
                  onChange={(e) => setDepenseForm({ ...depenseForm, montant: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-mono font-bold text-slate-900 dark:text-slate-100 text-right"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Mode de règlement *</label>
                <select
                  value={depenseForm.mode_reglement}
                  onChange={(e) => setDepenseForm({ ...depenseForm, mode_reglement: e.target.value as any })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-900 dark:text-slate-100"
                >
                  <option value="especes">Espèces (Caisse)</option>
                  <option value="orange_money">Orange Money</option>
                  <option value="moov_money">Moov Money (Flooz)</option>
                  <option value="wave">Wave</option>
                  <option value="virement">Virement bancaire</option>
                  <option value="cheque">Chèque</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Bénéficiaire *</label>
                <input
                  type="text"
                  placeholder="ex: Propriétaire immeuble, SONABEL, TOTAL..."
                  value={depenseForm.beneficiaire}
                  onChange={(e) => setDepenseForm({ ...depenseForm, beneficiaire: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Date de la dépense *</label>
                <input
                  type="date"
                  value={depenseForm.date_depense}
                  onChange={(e) => setDepenseForm({ ...depenseForm, date_depense: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">Motif détaillé *</label>
              <input
                type="text"
                placeholder="ex: Loyer du magasin principal pour le mois en cours"
                value={depenseForm.motif}
                onChange={(e) => setDepenseForm({ ...depenseForm, motif: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setNewDepenseModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSaveDepense}
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {saving ? 'Enregistrement...' : 'Valider la dépense'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
