import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  BookOpen,
  FileSpreadsheet,
  Layers,
  Download,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  DollarSign,
  TrendingUp,
  FileText,
  Building2,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  Sparkles,
  Sliders,
  Scale,
  Check,
  Eye,
  Trash2,
  Lock,
  Unlock,
  PieChart,
  Coins,
  BarChart2,
  Printer,
  Archive,
  FileCheck,
} from 'lucide-react';
import type {
  ComptaCompte,
  ComptaJournal,
  ComptaPiece,
  ComptaEcriture,
  ComptaExercice,
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
import { supabase } from '@/lib/supabase';
import {
  PLAN_SYSCOHADA_STANDARD,
  JOURNAUX_SYSCOHADA_STANDARD,
  calculerBalanceGenerale,
  calculerGrandLivre,
  calculerCompteDeResultatOHADA,
  calculerBilanOHADA,
  genererExportFEC,
  telechargerFichier,
  type ResultatBalance,
  type CompteGrandLivre,
  type SoldesIntermediairesGestion,
  type BilanOHADA,
} from '@/lib/comptaSyscohada';

type Props = {
  role: Role | null;
  entrepots: Entrepot[];
  loading: boolean;
};

type TabType = 'journaux' | 'grand_livre' | 'balance' | 'etats_financiers' | 'cloture' | 'plan_comptes';

export function Comptabilite({ role, entrepots, loading: parentLoading }: Props) {
  const { profile, entrepriseId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('journaux');
  const [loading, setLoading] = useState(true);

  // Données comptables
  const [comptes, setComptes] = useState<ComptaCompte[]>([]);
  const [journaux, setJournaux] = useState<ComptaJournal[]>([]);
  const [pieces, setPieces] = useState<ComptaPiece[]>([]);
  const [ecritures, setEcritures] = useState<ComptaEcriture[]>([]);
  const [exercices, setExercices] = useState<ComptaExercice[]>([]);

  // Filtres
  const [selectedJournal, setSelectedJournal] = useState<string>('all');
  const [selectedCompte, setSelectedCompte] = useState<string>('all');
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateDebut, setDateDebut] = useState('');
  const [dateFin, setDateFin] = useState('');

  // Modals
  const [newPieceModal, setNewPieceModal] = useState(false);
  const [inspectPiece, setInspectPiece] = useState<ComptaPiece | null>(null);
  const [saving, setSaving] = useState(false);

  // Saisie nouvelle pièce
  const [pieceForm, setPieceForm] = useState({
    journal_id: '',
    numero_piece: '',
    date_piece: new Date().toISOString().slice(0, 10),
    libelle: '',
    reference_document: '',
    site_id: '',
  });

  const [lignesForm, setLignesForm] = useState<
    Array<{
      compte_numero: string;
      compte_libelle: string;
      libelle_ligne: string;
      debit: string;
      credit: string;
      tiers_nom: string;
    }>
  >([
    { compte_numero: '411100', compte_libelle: 'Clients - Créances sur ventes', libelle_ligne: '', debit: '0', credit: '0', tiers_nom: '' },
    { compte_numero: '701000', compte_libelle: 'Ventes de marchandises en magasin HT', libelle_ligne: '', debit: '0', credit: '0', tiers_nom: '' },
  ]);

  const canEdit = can(role, 'paiements', 'edit') || role === 'admin' || role === 'gerant' || role === 'comptable';

  const loadData = useCallback(async () => {
    if (!entrepriseId) return;
    setLoading(true);
    try {
      const [pts, jx, pcs, ecr, exs] = await Promise.all([
        fetchTable<ComptaCompte>('compta_comptes', '*', { column: 'numero', ascending: true }),
        fetchTable<ComptaJournal>('compta_journaux', '*', { column: 'code', ascending: true }),
        fetchTable<ComptaPiece>('compta_pieces', '*, journal:journal_id(*)', { column: 'date_piece', ascending: false }, 300),
        fetchTable<ComptaEcriture>('compta_ecritures', '*, piece:piece_id(*, journal:journal_id(*))', { column: 'date_ecriture', ascending: false }, 1000),
        fetchTable<ComptaExercice>('compta_exercices', '*', { column: 'annee', ascending: false }),
      ]);

      // Si le plan comptable n'a pas encore été injecté pour ce tenant, l'initialiser
      if (pts.length === 0 && jx.length === 0 && canEdit) {
        await supabase.rpc('rpc_seed_syscohada_plan', { p_entreprise_id: entrepriseId });
        const [ptsInit, jxInit] = await Promise.all([
          fetchTable<ComptaCompte>('compta_comptes', '*', { column: 'numero', ascending: true }),
          fetchTable<ComptaJournal>('compta_journaux', '*', { column: 'code', ascending: true }),
        ]);
        setComptes(ptsInit);
        setJournaux(jxInit);
      } else {
        setComptes(pts);
        setJournaux(jx);
      }

      setPieces(pcs);
      setEcritures(ecr);
      setExercices(exs);
    } catch (err) {
      console.error('Erreur chargement compta:', err);
    } finally {
      setLoading(false);
    }
  }, [entrepriseId, canEdit]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Filtrage des écritures
  const ecrituresFiltrees = useMemo(() => {
    return ecritures.filter((e) => {
      if (selectedJournal !== 'all' && e.piece?.journal_id !== selectedJournal) return false;
      if (selectedCompte !== 'all' && e.compte_numero !== selectedCompte) return false;
      if (selectedSiteId !== 'all' && e.site_id !== selectedSiteId) return false;
      if (dateDebut && e.date_ecriture < dateDebut) return false;
      if (dateFin && e.date_ecriture > dateFin) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const m1 = e.compte_numero.toLowerCase().includes(q);
        const m2 = e.compte_libelle.toLowerCase().includes(q);
        const m3 = (e.libelle_ligne || '').toLowerCase().includes(q);
        const m4 = (e.piece?.numero_piece || '').toLowerCase().includes(q);
        const m5 = (e.tiers_nom || '').toLowerCase().includes(q);
        if (!m1 && !m2 && !m3 && !m4 && !m5) return false;
      }
      return true;
    });
  }, [ecritures, selectedJournal, selectedCompte, selectedSiteId, dateDebut, dateFin, searchQuery]);

  // Calcul Balance Générale
  const balanceResult: ResultatBalance = useMemo(() => {
    const listComptes = comptes.length > 0 ? comptes : (PLAN_SYSCOHADA_STANDARD as unknown as ComptaCompte[]);
    return calculerBalanceGenerale(listComptes, ecrituresFiltrees);
  }, [comptes, ecrituresFiltrees]);

  // Calcul Grand Livre
  const grandLivreData: CompteGrandLivre[] = useMemo(() => {
    return calculerGrandLivre(ecrituresFiltrees);
  }, [ecrituresFiltrees]);

  // Calcul Compte de Résultat & SIG (Phase 4)
  const compteDeResultat: SoldesIntermediairesGestion = useMemo(() => {
    return calculerCompteDeResultatOHADA(ecrituresFiltrees);
  }, [ecrituresFiltrees]);

  // Calcul Bilan Actif / Passif OHADA (Phase 4)
  const bilanData: BilanOHADA = useMemo(() => {
    return calculerBilanOHADA(ecrituresFiltrees, compteDeResultat.resultatNet);
  }, [ecrituresFiltrees, compteDeResultat.resultatNet]);

  // Sous-onglet pour les états financiers
  const [sousOngletEtats, setSousOngletEtats] = useState<'resultat' | 'bilan'>('resultat');

  // Clôture d'exercice annuel
  const [clotureLoading, setClotureLoading] = useState(false);
  const [clotureModalOpen, setClotureModalOpen] = useState(false);
  const [selectedExoCloture, setSelectedExoCloture] = useState<ComptaExercice | null>(null);

  const handleCloturerExercice = async (exerciceId: string) => {
    if (!balanceResult.estEquilibree) {
      showToast('Impossible de clôturer : la balance générale n\'est pas équilibrée.', 'error');
      return;
    }
    setClotureLoading(true);
    try {
      const { data, error } = await supabase.rpc('rpc_cloturer_exercice_comptable', {
        p_entreprise_id: entrepriseId,
        p_exercice_id: exerciceId,
        p_user_id: profile?.id || null,
      });

      if (error) throw error;
      if (data && !data.success) {
        throw new Error(data.error);
      }

      showToast(`Exercice ${data.annee} clôturé avec succès ! Résultat net : ${formatCurrency(data.resultat_net)}`, 'success');
      setClotureModalOpen(false);
      await loadData();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la clôture', 'error');
    } finally {
      setClotureLoading(false);
    }
  };

  // Totaux nouvelle pièce
  const totalDebitSaisie = useMemo(() => {
    return lignesForm.reduce((sum, l) => sum + (parseFloat(l.debit) || 0), 0);
  }, [lignesForm]);

  const totalCreditSaisie = useMemo(() => {
    return lignesForm.reduce((sum, l) => sum + (parseFloat(l.credit) || 0), 0);
  }, [lignesForm]);

  const estEquilibreeSaisie = Math.round(totalDebitSaisie) === Math.round(totalCreditSaisie) && totalDebitSaisie > 0;

  // Ligne de saisie helpers
  const updateLigne = (idx: number, field: string, val: string) => {
    setLignesForm((prev) => {
      const copy = [...prev];
      copy[idx] = { ...copy[idx], [field]: val };

      // Si le compte change, auto-remplir le libellé
      if (field === 'compte_numero') {
        const c = comptes.find((x) => x.numero === val) || PLAN_SYSCOHADA_STANDARD.find((x) => x.numero === val);
        if (c) copy[idx].compte_libelle = c.libelle;
      }
      return copy;
    });
  };

  const addLigne = () => {
    setLignesForm((prev) => [
      ...prev,
      { compte_numero: '521000', compte_libelle: 'Banques locales', libelle_ligne: '', debit: '0', credit: '0', tiers_nom: '' },
    ]);
  };

  const removeLigne = (idx: number) => {
    if (lignesForm.length <= 2) {
      showToast('Une écriture comptable doit comporter au moins 2 lignes', 'error');
      return;
    }
    setLignesForm((prev) => prev.filter((_, i) => i !== idx));
  };

  // Enregistrer pièce comptable manuelle
  const handleSavePiece = async () => {
    if (!pieceForm.journal_id || !pieceForm.libelle) {
      showToast('Veuillez renseigner le journal et le libellé de la pièce', 'error');
      return;
    }
    if (!estEquilibreeSaisie) {
      showToast(`L'écriture n'est pas équilibrée (Débit: ${totalDebitSaisie} FCFA vs Crédit: ${totalCreditSaisie} FCFA)`, 'error');
      return;
    }

    setSaving(true);
    try {
      const numPiece = pieceForm.numero_piece || `PC-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.floor(1000 + Math.random() * 9000)}`;

      // 1. Insertion de la pièce
      const { offline: off1, error: err1 } = await writeRow('compta_pieces', 'insert', {
        entreprise_id: entrepriseId,
        site_id: pieceForm.site_id || null,
        journal_id: pieceForm.journal_id,
        numero_piece: numPiece,
        date_piece: pieceForm.date_piece,
        libelle: pieceForm.libelle,
        reference_document: pieceForm.reference_document || null,
        origine_type: 'manuel',
        statut: 'valide',
        total_debit: Math.round(totalDebitSaisie),
        total_credit: Math.round(totalCreditSaisie),
        created_by: profile?.id || null,
      });

      if (err1) throw new Error(err1);

      // Récupérer l'ID de la pièce créée
      const { data: createdPiece } = await supabase
        .from('compta_pieces')
        .select('id')
        .eq('numero_piece', numPiece)
        .eq('entreprise_id', entrepriseId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const pieceId = createdPiece?.id || genMockId();

      // 2. Insertion des lignes d'écritures
      for (const l of lignesForm) {
        await writeRow('compta_ecritures', 'insert', {
          entreprise_id: entrepriseId,
          piece_id: pieceId,
          compte_numero: l.compte_numero,
          compte_libelle: l.compte_libelle,
          site_id: pieceForm.site_id || null,
          debit: Math.round(parseFloat(l.debit) || 0),
          credit: Math.round(parseFloat(l.credit) || 0),
          libelle_ligne: l.libelle_ligne || pieceForm.libelle,
          tiers_nom: l.tiers_nom || null,
          date_ecriture: pieceForm.date_piece,
        });
      }

      showToast('Pièce comptable enregistrée avec succès');
      setNewPieceModal(false);
      loadData();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de l\'enregistrement', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleExportFEC = () => {
    if (ecrituresFiltrees.length === 0) {
      showToast('Aucune écriture à exporter', 'info');
      return;
    }
    const fecContent = genererExportFEC(ecrituresFiltrees);
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    telechargerFichier(fecContent, `FEC_YOS360_${dateStr}.txt`, 'text/plain;charset=utf-8');
    showToast('Export FEC SYSCOHADA généré avec succès');
  };

  const handleExportCSV = () => {
    if (balanceResult.lignes.length === 0) {
      showToast('Aucune donnée de balance à exporter', 'info');
      return;
    }
    const headers = 'Compte;Libelle;Classe;Total Debit;Total Credit;Solde Debiteur;Solde Crediteur\r\n';
    const rows = balanceResult.lignes
      .map(
        (l) =>
          `"${l.numero}";"${l.libelle.replace(/"/g, '""')}";${l.classe};${l.totalDebit};${l.totalCredit};${l.soldeDebiteur};${l.soldeCrediteur}`
      )
      .join('\r\n');
    const totaux = `\r\n"TOTAL";"TOTAL GENERAL";"";${balanceResult.totalDebit};${balanceResult.totalCredit};${balanceResult.totalSoldeDebiteur};${balanceResult.totalSoldeCrediteur}`;
    telechargerFichier(headers + rows + totaux, `Balance_Generale_${new Date().toISOString().slice(0, 10)}.csv`, 'text/csv;charset=utf-8');
    showToast('Balance générale exportée en CSV');
  };

  function genMockId() {
    return '00000000-0000-4000-8000-' + Math.floor(Math.random() * 1000000000000).toString(16).padStart(12, '0');
  }

  return (
    <div className="space-y-6">
      {/* AdminLTE App Header Page Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Scale className="w-7 h-7 text-sky-600 dark:text-sky-400" />
            <span>Comptabilité SYSCOHADA Révisé</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Plan comptable OHADA, journaux auxiliaires, grand livre, balance générale équilibrée et export normalisé FEC.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            title="Rafraîchir les écritures"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Actualiser</span>
          </button>

          <button
            onClick={handleExportFEC}
            className="px-3.5 py-2 rounded-xl border border-sky-300 dark:border-sky-500/40 bg-sky-50 dark:bg-sky-500/10 text-sky-700 dark:text-sky-300 hover:bg-sky-100 transition-colors text-xs font-semibold flex items-center gap-1.5"
            title="Export normalisé FEC pour expert-comptable"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Export FEC (OHADA)</span>
          </button>

          {canEdit && (
            <button
              onClick={() => {
                setPieceForm({
                  journal_id: journaux[0]?.id || '',
                  numero_piece: '',
                  date_piece: new Date().toISOString().slice(0, 10),
                  libelle: '',
                  reference_document: '',
                  site_id: entrepots[0]?.id || '',
                });
                setNewPieceModal(true);
              }}
              className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="w-4 h-4" />
              <span>Saisir une pièce</span>
            </button>
          )}
        </div>
      </div>

      {/* AdminLTE Metric Widgets (InfoBox) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          icon={Layers}
          title="Écritures comptables"
          value={formatNumber(ecritures.length)}
          variant="primary"
          description={`${pieces.length} pièces validées`}
        />
        <InfoBox
          icon={TrendingUp}
          title="Volume Débit total"
          value={formatCurrency(balanceResult.totalDebit)}
          variant="info"
          description="Total mouvements débit"
        />
        <InfoBox
          icon={DollarSign}
          title="Volume Crédit total"
          value={formatCurrency(balanceResult.totalCredit)}
          variant="success"
          description="Total mouvements crédit"
        />
        <InfoBox
          icon={balanceResult.estEquilibree ? CheckCircle2 : AlertTriangle}
          title="Équilibre Débit = Crédit"
          value={balanceResult.estEquilibree ? 'Équilibré (0 FCFA)' : `Écart: ${formatCurrency(balanceResult.ecart)}`}
          variant={balanceResult.estEquilibree ? 'success' : 'danger'}
          description={balanceResult.estEquilibree ? 'Conformité SYSCOHADA OK' : 'Anomalie d\'équilibre à corriger'}
        />
      </div>

      {/* Navigation par Onglets AdminLTE */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('journaux')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'journaux'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <BookOpen className="w-4 h-4" />
          <span>Journaux & Écritures ({ecrituresFiltrees.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('grand_livre')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'grand_livre'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <FileText className="w-4 h-4" />
          <span>Grand Livre ({grandLivreData.length} comptes mouvementés)</span>
        </button>

        <button
          onClick={() => setActiveTab('balance')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'balance'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Scale className="w-4 h-4" />
          <span>Balance Générale</span>
          {balanceResult.estEquilibree ? (
            <span className="w-2 h-2 rounded-full bg-emerald-500" title="Équilibrée" />
          ) : (
            <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" title="Écart détecté" />
          )}
        </button>

        <button
          onClick={() => setActiveTab('etats_financiers')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'etats_financiers'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <PieChart className="w-4 h-4" />
          <span>Bilan & Compte de Résultat (SIG)</span>
          <span className="px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300">
            OHADA
          </span>
        </button>

        <button
          onClick={() => setActiveTab('cloture')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'cloture'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Lock className="w-4 h-4" />
          <span>Clôture Annuelle & PAF</span>
        </button>

        <button
          onClick={() => setActiveTab('plan_comptes')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'plan_comptes'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <FileSpreadsheet className="w-4 h-4" />
          <span>Plan de Comptes OHADA ({comptes.length || PLAN_SYSCOHADA_STANDARD.length})</span>
        </button>
      </div>

      {/* Barre de filtres universelle */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[200px] relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Rechercher compte, libellé, pièce, tiers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          />
        </div>

        {/* Filtre Journal */}
        <select
          value={selectedJournal}
          onChange={(e) => setSelectedJournal(e.target.value)}
          className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
        >
          <option value="all">Tous les journaux</option>
          {journaux.map((j) => (
            <option key={j.id} value={j.id}>
              {j.code} — {j.libelle}
            </option>
          ))}
        </select>

        {/* Filtre Site / Boutique */}
        {entrepots.length > 0 && (
          <select
            value={selectedSiteId}
            onChange={(e) => setSelectedSiteId(e.target.value)}
            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
          >
            <option value="all">Tous les sites</option>
            {entrepots.map((e) => (
              <option key={e.id} value={e.id}>{e.nom}</option>
            ))}
          </select>
        )}

        {/* Filtres Dates */}
        <div className="flex items-center gap-1.5 text-xs">
          <input
            type="date"
            value={dateDebut}
            onChange={(e) => setDateDebut(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
            title="Date de début"
          />
          <span className="text-slate-400">à</span>
          <input
            type="date"
            value={dateFin}
            onChange={(e) => setDateFin(e.target.value)}
            className="px-2.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300"
            title="Date de fin"
          />
        </div>

        {(searchQuery || selectedJournal !== 'all' || selectedSiteId !== 'all' || dateDebut || dateFin) && (
          <button
            onClick={() => {
              setSearchQuery('');
              setSelectedJournal('all');
              setSelectedCompte('all');
              setSelectedSiteId('all');
              setDateDebut('');
              setDateFin('');
            }}
            className="text-xs text-rose-600 hover:underline font-semibold"
          >
            Réinitialiser
          </button>
        )}
      </div>

      {/* ========================================================================= */}
      {/* ONGLET 1 : JOURNAUX & ÉCRITURES */}
      {/* ========================================================================= */}
      {activeTab === 'journaux' && (
        <Card title="Journal général des écritures comptables" badge={`${ecrituresFiltrees.length} lignes`}>
          {ecrituresFiltrees.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-sm">
              Aucune écriture comptable trouvée pour les filtres sélectionnés.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Date</th>
                    <th className="py-2.5 px-3">Journal</th>
                    <th className="py-2.5 px-3">N° Pièce / Réf</th>
                    <th className="py-2.5 px-3">Compte</th>
                    <th className="py-2.5 px-3">Intitulé compte</th>
                    <th className="py-2.5 px-3">Libellé écriture</th>
                    <th className="py-2.5 px-3">Tiers</th>
                    <th className="py-2.5 px-3 text-right">Débit (FCFA)</th>
                    <th className="py-2.5 px-3 text-right">Crédit (FCFA)</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ecrituresFiltrees.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatDate(e.date_ecriture)}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                          {e.piece?.journal?.code || 'OD'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono font-medium text-sky-600 dark:text-sky-400 whitespace-nowrap">
                        {e.piece?.reference_document || e.piece?.numero_piece || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {e.compte_numero}
                      </td>
                      <td className="py-2.5 px-3 text-slate-700 dark:text-slate-300 truncate max-w-[180px]">
                        {e.compte_libelle}
                      </td>
                      <td className="py-2.5 px-3 text-slate-800 dark:text-slate-200">
                        {e.libelle_ligne || e.piece?.libelle || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400 truncate max-w-[140px]">
                        {e.tiers_nom || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {e.debit > 0 ? formatCurrency(e.debit) : '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                        {e.credit > 0 ? formatCurrency(e.credit) : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-bold bg-slate-50 dark:bg-slate-800/80">
                    <td colSpan={7} className="py-3 px-3 text-right uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Totaux des mouvements filtrés :
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(balanceResult.totalDebit)}
                    </td>
                    <td className="py-3 px-3 text-right font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(balanceResult.totalCredit)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 2 : GRAND LIVRE */}
      {/* ========================================================================= */}
      {activeTab === 'grand_livre' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs text-slate-500">
              Visualisation détaillée de chaque compte avec calcul du solde progressif au fil des écritures.
            </p>
          </div>

          {grandLivreData.length === 0 ? (
            <Card title="Grand Livre Général">
              <div className="text-center py-12 text-slate-400 text-sm">
                Aucune écriture comptable trouvée dans cette période.
              </div>
            </Card>
          ) : (
            grandLivreData.map((compteItem) => (
              <Card
                key={compteItem.compte_numero}
                title={`${compteItem.compte_numero} — ${compteItem.compte_libelle}`}
                badge={`Classe ${compteItem.classe}`}
                actions={
                  <div className="flex items-center gap-3 text-xs font-mono font-semibold">
                    <span className="text-slate-500">
                      Débit : <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(compteItem.totalDebit)}</strong>
                    </span>
                    <span className="text-slate-500">
                      Crédit : <strong className="text-slate-800 dark:text-slate-200">{formatCurrency(compteItem.totalCredit)}</strong>
                    </span>
                    <span className={`px-2 py-0.5 rounded font-bold ${
                      compteItem.soldeFinal >= 0
                        ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                        : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                    }`}>
                      Solde : {formatCurrency(Math.abs(compteItem.soldeFinal))} {compteItem.soldeFinal >= 0 ? 'D' : 'C'}
                    </span>
                  </div>
                }
              >
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 text-slate-500 text-[11px] uppercase">
                        <th className="py-2 px-3">Date</th>
                        <th className="py-2 px-3">Pièce / Réf</th>
                        <th className="py-2 px-3">Libellé</th>
                        <th className="py-2 px-3">Tiers</th>
                        <th className="py-2 px-3 text-right">Débit</th>
                        <th className="py-2 px-3 text-right">Crédit</th>
                        <th className="py-2 px-3 text-right">Solde progressif</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {compteItem.ecritures.map((l) => (
                        <tr key={l.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                          <td className="py-2 px-3 text-slate-500 whitespace-nowrap">{formatDate(l.date_ecriture)}</td>
                          <td className="py-2 px-3 font-mono font-medium text-sky-600 dark:text-sky-400 whitespace-nowrap">{l.piece_ref}</td>
                          <td className="py-2 px-3 text-slate-800 dark:text-slate-200">{l.libelle}</td>
                          <td className="py-2 px-3 text-slate-500">{l.tiers_nom || '—'}</td>
                          <td className="py-2 px-3 text-right font-mono">{l.debit > 0 ? formatCurrency(l.debit) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono">{l.credit > 0 ? formatCurrency(l.credit) : '—'}</td>
                          <td className="py-2 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                            {formatCurrency(Math.abs(l.soldeProgressif))} {l.soldeProgressif >= 0 ? 'D' : 'C'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            ))
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 3 : BALANCE GÉNÉRALE DES COMPTES */}
      {/* ========================================================================= */}
      {activeTab === 'balance' && (
        <Card
          title="Balance générale des comptes (6 Colonnes SYSCOHADA)"
          actions={
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Exporter CSV</span>
            </button>
          }
        >
          {balanceResult.estEquilibree ? (
            <Callout variant="success" title="Principe de la partie double respecté">
              L'égalité fondamentale <strong>Total Débit = Total Crédit ({formatCurrency(balanceResult.totalDebit)})</strong> et <strong>Total Soldes Débiteurs = Total Soldes Créditeurs ({formatCurrency(balanceResult.totalSoldeDebiteur)})</strong> est parfaitement vérifiée.
            </Callout>
          ) : (
            <Callout variant="danger" title="Alerte d'équilibre comptable">
              Un écart de <strong>{formatCurrency(balanceResult.ecart)}</strong> est constaté entre les mouvements Débit et Crédit. Vérifiez les écritures asymétriques.
            </Callout>
          )}

          <div className="overflow-x-auto mt-4">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3" rowSpan={2}>N° Compte</th>
                  <th className="py-2.5 px-3" rowSpan={2}>Intitulé du compte (OHADA)</th>
                  <th className="py-2.5 px-3 text-center border-l border-slate-200 dark:border-slate-700" colSpan={2}>
                    Mouvements de la période
                  </th>
                  <th className="py-2.5 px-3 text-center border-l border-slate-200 dark:border-slate-700" colSpan={2}>
                    Soldes de clôture
                  </th>
                </tr>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-semibold text-[10px]">
                  <th className="py-1.5 px-3 text-right border-l border-slate-200 dark:border-slate-700">Débit</th>
                  <th className="py-1.5 px-3 text-right">Crédit</th>
                  <th className="py-1.5 px-3 text-right border-l border-slate-200 dark:border-slate-700">Débiteur</th>
                  <th className="py-1.5 px-3 text-right">Créditeur</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {balanceResult.lignes.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="text-center py-8 text-slate-400">
                      Aucune donnée dans la balance pour cette période.
                    </td>
                  </tr>
                ) : (
                  balanceResult.lignes.map((l) => (
                    <tr key={l.numero} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td className="py-2 px-3 font-mono font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                        {l.numero}
                      </td>
                      <td className="py-2 px-3 text-slate-800 dark:text-slate-200">
                        {l.libelle}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300 border-l border-slate-100 dark:border-slate-800">
                        {l.totalDebit > 0 ? formatCurrency(l.totalDebit) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono text-slate-700 dark:text-slate-300">
                        {l.totalCredit > 0 ? formatCurrency(l.totalCredit) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-sky-700 dark:text-sky-300 border-l border-slate-100 dark:border-slate-800">
                        {l.soldeDebiteur > 0 ? formatCurrency(l.soldeDebiteur) : '—'}
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-semibold text-emerald-700 dark:text-emerald-300">
                        {l.soldeCrediteur > 0 ? formatCurrency(l.soldeCrediteur) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-bold bg-slate-100 dark:bg-slate-800/80 text-xs">
                  <td colSpan={2} className="py-3 px-3 uppercase text-slate-800 dark:text-slate-200">
                    TOTAUX GÉNÉRAUX :
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100 border-l border-slate-200 dark:border-slate-700">
                    {formatCurrency(balanceResult.totalDebit)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                    {formatCurrency(balanceResult.totalCredit)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-sky-700 dark:text-sky-300 border-l border-slate-200 dark:border-slate-700">
                    {formatCurrency(balanceResult.totalSoldeDebiteur)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-emerald-700 dark:text-emerald-300">
                    {formatCurrency(balanceResult.totalSoldeCrediteur)}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 4 : ÉTATS FINANCIERS SYSCOHADA (BILAN & COMPTE DE RÉSULTAT / SIG) */}
      {/* ========================================================================= */}
      {activeTab === 'etats_financiers' && (
        <div className="space-y-6">
          {/* Sélecteur de sous-onglet */}
          <div className="bg-white dark:bg-slate-900 p-2 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
              <button
                onClick={() => setSousOngletEtats('resultat')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  sousOngletEtats === 'resultat'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <BarChart2 className="w-4 h-4" />
                <span>Compte de Résultat & SIG</span>
              </button>
              <button
                onClick={() => setSousOngletEtats('bilan')}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-2 ${
                  sousOngletEtats === 'bilan'
                    ? 'bg-white dark:bg-slate-900 text-sky-600 dark:text-sky-400 shadow-xs'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                }`}
              >
                <Scale className="w-4 h-4" />
                <span>Bilan Actif / Passif OHADA</span>
              </button>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="px-3.5 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 flex items-center gap-1.5 transition-colors"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimer l'état officiel</span>
              </button>
            </div>
          </div>

          {/* VUE 1 : COMPTE DE RÉSULTAT & SOLDES INTERMÉDIAIRES DE GESTION (SIG) */}
          {sousOngletEtats === 'resultat' && (
            <div className="space-y-4">
              {/* Carte résultat net d'exercice */}
              <div
                className={`p-5 rounded-2xl border ${
                  compteDeResultat.sensResultat === 'benefice'
                    ? 'bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-transparent border-emerald-500/30'
                    : compteDeResultat.sensResultat === 'perte'
                    ? 'bg-gradient-to-r from-rose-500/10 via-red-500/5 to-transparent border-rose-500/30'
                    : 'bg-slate-50 border-slate-200 dark:bg-slate-800'
                } flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4`}
              >
                <div>
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    Système Normal SYSCOHADA Révisé
                  </span>
                  <h3 className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
                    {compteDeResultat.sensResultat === 'benefice'
                      ? 'Bénéfice Net de l\'Exercice'
                      : compteDeResultat.sensResultat === 'perte'
                      ? 'Perte Nette de l\'Exercice'
                      : 'Résultat à l\'Équilibre'}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Calculé en cascade à partir des comptes de charges (Classe 6) et de produits (Classe 7 et 8).
                  </p>
                </div>

                <div className="text-right">
                  <div
                    className={`text-2xl font-black font-mono ${
                      compteDeResultat.sensResultat === 'benefice'
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : compteDeResultat.sensResultat === 'perte'
                        ? 'text-rose-600 dark:text-rose-400'
                        : 'text-slate-600'
                    }`}
                  >
                    {compteDeResultat.sensResultat === 'benefice' ? '+' : ''}
                    {formatCurrency(compteDeResultat.resultatNet)}
                  </div>
                  <span
                    className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase mt-1 ${
                      compteDeResultat.sensResultat === 'benefice'
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                        : 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300'
                    }`}
                  >
                    {compteDeResultat.sensResultat === 'benefice' ? 'Solde Créditeur (Bénéfice)' : 'Solde Débiteur (Déficit)'}
                  </span>
                </div>
              </div>

              {/* Tableau en cascade des Soldes Intermédiaires de Gestion */}
              <Card title="Soldes Intermédiaires de Gestion (SIG OHADA)">
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-slate-500 font-semibold uppercase text-[11px]">
                        <th className="py-2.5 px-3 text-left">Postes & Soldes Intermédiaires</th>
                        <th className="py-2.5 px-3 text-left">Comptes SYSCOHADA</th>
                        <th className="py-2.5 px-3 text-right">Montant (FCFA)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {/* 1. Marge commerciale */}
                      <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Ventes de marchandises</td>
                        <td className="py-2 px-3 font-mono text-slate-500">701</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-600 font-medium">
                          +{formatCurrency(compteDeResultat.ventesMarchandises)}
                        </td>
                      </tr>
                      <tr className="bg-slate-50/50 dark:bg-slate-800/30">
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Achats de marchandises & variations de stock</td>
                        <td className="py-2 px-3 font-mono text-slate-500">601, 6031</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600 font-medium">
                          -{formatCurrency(compteDeResultat.achatsMarchandises + compteDeResultat.variationStocksMarchandises)}
                        </td>
                      </tr>
                      <tr className="bg-sky-50/60 dark:bg-sky-950/20 font-bold border-y border-sky-100 dark:border-sky-900/40">
                        <td className="py-2.5 px-3 text-sky-900 dark:text-sky-200">= MARGE COMMERCIALE</td>
                        <td className="py-2.5 px-3 text-sky-700 dark:text-sky-300 font-mono text-[10px]">SIG 1</td>
                        <td className="py-2.5 px-3 text-right font-mono text-sky-800 dark:text-sky-300 font-bold">
                          {formatCurrency(compteDeResultat.margeCommerciale)}
                        </td>
                      </tr>

                      {/* 2. Production de l'exercice */}
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Production vendue, stockée & immobilisée</td>
                        <td className="py-2 px-3 font-mono text-slate-500">702-706, 72, 73</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-600 font-medium">
                          +{formatCurrency(compteDeResultat.productionExercice)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Consommations de l'exercice (Matières, transports, services extérieurs)</td>
                        <td className="py-2 px-3 font-mono text-slate-500">602-608, 61, 62, 63</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600 font-medium">
                          -{formatCurrency(compteDeResultat.consommationExercice)}
                        </td>
                      </tr>
                      <tr className="bg-indigo-50/60 dark:bg-indigo-950/20 font-bold border-y border-indigo-100 dark:border-indigo-900/40">
                        <td className="py-2.5 px-3 text-indigo-900 dark:text-indigo-200">= VALEUR AJOUTÉE (VA)</td>
                        <td className="py-2.5 px-3 text-indigo-700 dark:text-indigo-300 font-mono text-[10px]">SIG 2</td>
                        <td className="py-2.5 px-3 text-right font-mono text-indigo-800 dark:text-indigo-300 font-bold">
                          {formatCurrency(compteDeResultat.valeurAjoutee)}
                        </td>
                      </tr>

                      {/* 3. Excédent Brut d'Exploitation */}
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Subventions d'exploitation</td>
                        <td className="py-2 px-3 font-mono text-slate-500">71</td>
                        <td className="py-2 px-3 text-right font-mono text-emerald-600 font-medium">
                          +{formatCurrency(compteDeResultat.subventionsExploitation)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Charges de personnel & Impôts/taxes</td>
                        <td className="py-2 px-3 font-mono text-slate-500">64, 66</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600 font-medium">
                          -{formatCurrency(compteDeResultat.chargesPersonnel + compteDeResultat.impotsTaxes)}
                        </td>
                      </tr>
                      <tr className="bg-amber-50/60 dark:bg-amber-950/20 font-bold border-y border-amber-100 dark:border-amber-900/40">
                        <td className="py-2.5 px-3 text-amber-900 dark:text-amber-200">= EXCÉDENT BRUT D'EXPLOITATION (EBE)</td>
                        <td className="py-2.5 px-3 text-amber-700 dark:text-amber-300 font-mono text-[10px]">SIG 3</td>
                        <td className="py-2.5 px-3 text-right font-mono text-amber-800 dark:text-amber-300 font-bold">
                          {formatCurrency(compteDeResultat.excedentBrutExploitation)}
                        </td>
                      </tr>

                      {/* 4. Résultat d'Exploitation */}
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Dotations aux amortissements & autres charges</td>
                        <td className="py-2 px-3 font-mono text-slate-500">65, 68, 69</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600 font-medium">
                          -{formatCurrency(compteDeResultat.dotationsAmortissements + compteDeResultat.autresChargesExploitation)}
                        </td>
                      </tr>
                      <tr className="bg-purple-50/60 dark:bg-purple-950/20 font-bold border-y border-purple-100 dark:border-purple-900/40">
                        <td className="py-2.5 px-3 text-purple-900 dark:text-purple-200">= RÉSULTAT D'EXPLOITATION (RE)</td>
                        <td className="py-2.5 px-3 text-purple-700 dark:text-purple-300 font-mono text-[10px]">SIG 4</td>
                        <td className="py-2.5 px-3 text-right font-mono text-purple-800 dark:text-purple-300 font-bold">
                          {formatCurrency(compteDeResultat.resultatExploitation)}
                        </td>
                      </tr>

                      {/* 5. Résultat Financier */}
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Résultat Financier (Produits 77 - Charges 67)</td>
                        <td className="py-2 px-3 font-mono text-slate-500">77, 67</td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          {compteDeResultat.resultatFinancier >= 0 ? '+' : ''}
                          {formatCurrency(compteDeResultat.resultatFinancier)}
                        </td>
                      </tr>

                      {/* 6. RAO */}
                      <tr className="font-semibold bg-slate-50 dark:bg-slate-800/40">
                        <td className="py-2 px-3 text-slate-800 dark:text-slate-200">= RÉSULTAT ACTIVITÉS ORDINAIRES (RAO)</td>
                        <td className="py-2 px-3 font-mono text-slate-500">RE + RF</td>
                        <td className="py-2 px-3 text-right font-mono font-bold">
                          {formatCurrency(compteDeResultat.resultatActivitesOrdinaires)}
                        </td>
                      </tr>

                      {/* 7. RHAO & Impôt */}
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Résultat Hors Activités Ordinaires (RHAO)</td>
                        <td className="py-2 px-3 font-mono text-slate-500">81-88</td>
                        <td className="py-2 px-3 text-right font-mono font-medium">
                          {formatCurrency(compteDeResultat.resultatHAO)}
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2 px-3 text-slate-700 dark:text-slate-300">Impôts sur les bénéfices / Acomptes BIC</td>
                        <td className="py-2 px-3 font-mono text-slate-500">89</td>
                        <td className="py-2 px-3 text-right font-mono text-rose-600 font-medium">
                          -{formatCurrency(compteDeResultat.impotsSurBenefices)}
                        </td>
                      </tr>

                      {/* LIGNE FINALE RÉSULTAT NET */}
                      <tr className="bg-slate-900 text-white font-extrabold text-sm border-t-2 border-slate-900">
                        <td className="py-3 px-3 uppercase tracking-wider">
                          RÉSULTAT NET DE L'EXERCICE ({compteDeResultat.sensResultat.toUpperCase()})
                        </td>
                        <td className="py-3 px-3 font-mono text-xs text-slate-300">Compte 131 / 139</td>
                        <td className="py-3 px-3 text-right font-mono text-base text-amber-400">
                          {compteDeResultat.sensResultat === 'benefice' ? '+' : ''}
                          {formatCurrency(compteDeResultat.resultatNet)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </Card>
            </div>
          )}

          {/* VUE 2 : BILAN OHADA (ACTIF / PASSIF) */}
          {sousOngletEtats === 'bilan' && (
            <div className="space-y-4">
              {/* Statut d'équilibre du bilan */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  bilanData.equilibre.estEquilibre
                    ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-800/40 text-emerald-800 dark:text-emerald-300'
                    : 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800/40 text-rose-800 dark:text-rose-300'
                }`}
              >
                <div className="flex items-center gap-3">
                  {bilanData.equilibre.estEquilibre ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  )}
                  <div>
                    <h4 className="text-xs font-bold uppercase">
                      {bilanData.equilibre.estEquilibre
                        ? 'Bilan OHADA Strictement Équilibré'
                        : 'Déséquilibre Détecté dans le Bilan'}
                    </h4>
                    <p className="text-[11px] opacity-80">
                      Total Actif : <strong>{formatCurrency(bilanData.actif.totalGeneralActif)}</strong> = Total Passif : <strong>{formatCurrency(bilanData.passif.totalGeneralPassif)}</strong>
                    </p>
                  </div>
                </div>

                <div className="text-right font-mono font-bold text-xs">
                  Écart : {formatCurrency(bilanData.equilibre.ecart)}
                </div>
              </div>

              {/* Deux colonnes Actif vs Passif */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* COLONNE ACTIF */}
                <Card title="ACTIF (Emplois)" badge={formatCurrency(bilanData.actif.totalGeneralActif)}>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {/* Actif Immobilisé */}
                    <div className="py-2.5">
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                        <span>ACTIF IMMOBILISÉ (Classe 2)</span>
                        <span className="font-mono text-sky-600">{formatCurrency(bilanData.actif.actifImmobilise.total)}</span>
                      </div>
                      <div className="pl-3 space-y-1 text-slate-500 text-[11px]">
                        <div className="flex justify-between">
                          <span>Immobilisations incorporelles</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.actifImmobilise.immobilisationsIncorporelles)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Immobilisations corporelles (matériel, mobilier)</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.actifImmobilise.immobilisationsCorporelles)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Immobilisations financières</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.actifImmobilise.immobilisationsFinancieres)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Actif Circulant */}
                    <div className="py-2.5">
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                        <span>ACTIF CIRCULANT (Classes 3 & 4)</span>
                        <span className="font-mono text-sky-600">{formatCurrency(bilanData.actif.actifCirculant.total)}</span>
                      </div>
                      <div className="pl-3 space-y-1 text-slate-500 text-[11px]">
                        <div className="flex justify-between">
                          <span>Stocks de marchandises & matières</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.actifCirculant.stocksMarchandises)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Créances clients (compte 411)</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.actifCirculant.creancesClients)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Autres créances (TVA déductible, acomptes)</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.actifCirculant.autresCreances)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Trésorerie Actif */}
                    <div className="py-2.5">
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                        <span>TRÉSORERIE ACTIF (Classe 5)</span>
                        <span className="font-mono text-sky-600">{formatCurrency(bilanData.actif.tresorerieActif.total)}</span>
                      </div>
                      <div className="pl-3 space-y-1 text-slate-500 text-[11px]">
                        <div className="flex justify-between">
                          <span>Banques locales (comptes courants)</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.tresorerieActif.banques)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Mobile Money (Orange, Moov, Wave)</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.tresorerieActif.mobileMoney)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Caisses physiques (espèces)</span>
                          <span className="font-mono">{formatCurrency(bilanData.actif.tresorerieActif.caisses)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Total Actif */}
                    <div className="pt-3 font-bold text-sm flex items-center justify-between bg-sky-50 dark:bg-sky-950/20 -mx-4 -mb-4 p-4 rounded-b-2xl">
                      <span className="uppercase text-sky-900 dark:text-sky-200">TOTAL GÉNÉRAL ACTIF</span>
                      <span className="font-mono text-sky-700 dark:text-sky-300">{formatCurrency(bilanData.actif.totalGeneralActif)}</span>
                    </div>
                  </div>
                </Card>

                {/* COLONNE PASSIF */}
                <Card title="PASSIF (Ressources)" badge={formatCurrency(bilanData.passif.totalGeneralPassif)}>
                  <div className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
                    {/* Capitaux Propres & Dettes Financières */}
                    <div className="py-2.5">
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                        <span>CAPITAUX PROPRES & RESSOURCES (Classe 1)</span>
                        <span className="font-mono text-emerald-600">{formatCurrency(bilanData.passif.capitauxPropres.total)}</span>
                      </div>
                      <div className="pl-3 space-y-1 text-slate-500 text-[11px]">
                        <div className="flex justify-between">
                          <span>Capital social (compte 101)</span>
                          <span className="font-mono">{formatCurrency(bilanData.passif.capitauxPropres.capitalSocial)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Report à nouveau & réserves</span>
                          <span className="font-mono">{formatCurrency(bilanData.passif.capitauxPropres.reportANouveau)}</span>
                        </div>
                        <div className="flex justify-between font-semibold text-slate-700 dark:text-slate-300">
                          <span>Résultat Net de l'exercice (compte 13)</span>
                          <span className="font-mono text-amber-600">{formatCurrency(bilanData.passif.capitauxPropres.resultatNetExercice)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Emprunts & dettes financières (compte 16)</span>
                          <span className="font-mono">{formatCurrency(bilanData.passif.capitauxPropres.dettesFinancieres)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Passif Circulant */}
                    <div className="py-2.5">
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                        <span>PASSIF CIRCULANT (Classe 4)</span>
                        <span className="font-mono text-emerald-600">{formatCurrency(bilanData.passif.passifCirculant.total)}</span>
                      </div>
                      <div className="pl-3 space-y-1 text-slate-500 text-[11px]">
                        <div className="flex justify-between">
                          <span>Dettes fournisseurs (compte 401)</span>
                          <span className="font-mono">{formatCurrency(bilanData.passif.passifCirculant.dettesFournisseurs)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Dettes fiscales & sociales (TVA 18%, personnel)</span>
                          <span className="font-mono">{formatCurrency(bilanData.passif.passifCirculant.dettesFiscalesSociales)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span>Autres dettes d'exploitation</span>
                          <span className="font-mono">{formatCurrency(bilanData.passif.passifCirculant.autresDettes)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Trésorerie Passif */}
                    <div className="py-2.5">
                      <div className="flex items-center justify-between font-bold text-slate-800 dark:text-slate-200 mb-1">
                        <span>TRÉSORERIE PASSIF (Classe 5)</span>
                        <span className="font-mono text-emerald-600">{formatCurrency(bilanData.passif.tresoreriePassif.total)}</span>
                      </div>
                      <div className="pl-3 space-y-1 text-slate-500 text-[11px]">
                        <div className="flex justify-between">
                          <span>Découverts bancaires & crédits d'escompte (compte 56)</span>
                          <span className="font-mono">{formatCurrency(bilanData.passif.tresoreriePassif.decouvertsBancaires)}</span>
                        </div>
                      </div>
                    </div>

                    {/* Total Passif */}
                    <div className="pt-3 font-bold text-sm flex items-center justify-between bg-emerald-50 dark:bg-emerald-950/20 -mx-4 -mb-4 p-4 rounded-b-2xl">
                      <span className="uppercase text-emerald-900 dark:text-emerald-200">TOTAL GÉNÉRAL PASSIF</span>
                      <span className="font-mono text-emerald-700 dark:text-emerald-300">{formatCurrency(bilanData.passif.totalGeneralPassif)}</span>
                    </div>
                  </div>
                </Card>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 5 : CLÔTURE D'EXERCICE COMPTABLE & PISTE D'AUDIT FIABLE (PAF) */}
      {/* ========================================================================= */}
      {activeTab === 'cloture' && (
        <div className="space-y-6">
          {/* Guide explicatif */}
          <Callout variant="info" title="Procédure Réglementaire de Clôture d'Exercice (SYSCOHADA)">
            La clôture annuelle d'exercice est une opération irréversible qui garantit l'inviolabilité des comptes :
            elle solde les comptes de gestion (Classes 6 et 7), affecte le résultat au Bilan (compte 13), verrouille
            les écritures et génère automatiquement la pièce d'À-Nouveaux pour l'exercice suivant (Bilan d'Ouverture N+1).
          </Callout>

          {/* Liste des exercices comptables et statut */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {exercices.map((exo) => {
              const isOuvert = exo.statut === 'ouvert';

              return (
                <div
                  key={exo.id}
                  className={`p-5 rounded-2xl border transition-all ${
                    isOuvert
                      ? 'bg-white dark:bg-slate-900 border-sky-300 dark:border-sky-800 shadow-sm'
                      : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-800 opacity-90'
                  }`}
                >
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xl font-bold font-mono text-slate-900 dark:text-white">
                      Exercice {exo.annee}
                    </span>
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase flex items-center gap-1 ${
                        isOuvert
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                          : 'bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-300'
                      }`}
                    >
                      {isOuvert ? <Unlock className="w-3 h-3" /> : <Lock className="w-3 h-3" />}
                      <span>{isOuvert ? 'En cours (Ouvert)' : 'Clôturé & Verrouillé'}</span>
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 mb-4">
                    Du <strong>{formatDate(exo.date_debut)}</strong> au <strong>{formatDate(exo.date_fin)}</strong>
                  </p>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    {isOuvert ? (
                      <button
                        onClick={() => {
                          setSelectedExoCloture(exo);
                          setClotureModalOpen(true);
                        }}
                        disabled={!canEdit}
                        className="w-full py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-semibold text-xs transition-colors flex items-center justify-center gap-2 shadow-sm disabled:opacity-50"
                      >
                        <Lock className="w-3.5 h-3.5" />
                        <span>Clôturer cet exercice</span>
                      </button>
                    ) : (
                      <div className="w-full flex items-center justify-between text-xs text-slate-500 font-medium">
                        <span className="flex items-center gap-1.5 text-emerald-600 font-bold">
                          <CheckCircle2 className="w-4 h-4" /> Scellé (PAF Certifiée)
                        </span>
                        <button
                          onClick={handleExportFEC}
                          className="text-sky-600 hover:underline flex items-center gap-1"
                        >
                          <Download className="w-3.5 h-3.5" />
                          <span>Archive FEC</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Checklist d'intégrité avant clôture */}
          <Card title="Checklist d'Audit & Conformité Pré-Clôture">
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5">
                  {balanceResult.estEquilibree ? (
                    <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  ) : (
                    <AlertTriangle className="w-5 h-5 text-rose-600" />
                  )}
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Équilibre rigoureux de la Balance Générale
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Débit total ({formatCurrency(balanceResult.totalDebit)}) = Crédit total ({formatCurrency(balanceResult.totalCredit)})
                    </p>
                  </div>
                </div>
                <span className={`text-xs font-bold ${balanceResult.estEquilibree ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {balanceResult.estEquilibree ? 'Conforme (Écart : 0 FCFA)' : `Écart : ${formatCurrency(balanceResult.ecart)}`}
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Validation de l'ensemble des pièces comptables
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Toutes les pièces de l'exercice sont validées sans écriture en statut brouillon
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-emerald-600">
                  {pieces.length} pièces prêtes
                </span>
              </div>

              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50">
                <div className="flex items-center gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  <div>
                    <h5 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                      Piste d'Audit Fiable & Scellement Numérique SHA-256
                    </h5>
                    <p className="text-[11px] text-slate-500">
                      Empreinte cryptographique générée automatiquement lors du scellement de la clôture
                    </p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-sky-600">
                  SHA-256 Prêt
                </span>
              </div>
            </div>
          </Card>
        </div>
      )}

      {/* Modal Confirmation de Clôture */}
      {clotureModalOpen && selectedExoCloture && (
        <Modal
          open={true}
          onClose={() => setClotureModalOpen(false)}
          title={`Clôture Officielle de l'Exercice ${selectedExoCloture.annee}`}
        >
          <div className="space-y-4">
            <Callout variant="danger" title="Avertissement d'irréversibilité">
              La clôture de l'exercice <strong>{selectedExoCloture.annee}</strong> est définitive.
              Aucune écriture ne pourra plus être ajoutée ou modifiée sur cet exercice.
            </Callout>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 space-y-2 text-xs">
              <div className="flex justify-between">
                <span className="text-slate-500">Exercice à clôturer :</span>
                <span className="font-bold font-mono">Année {selectedExoCloture.annee}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Résultat net déterminé :</span>
                <span className={`font-bold font-mono ${compteDeResultat.resultatNet >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(compteDeResultat.resultatNet)} ({compteDeResultat.sensResultat.toUpperCase()})
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Écriture d'À-Nouveaux :</span>
                <span className="font-bold text-sky-600">Exercice {selectedExoCloture.annee + 1} (Génération auto)</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setClotureModalOpen(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={() => handleCloturerExercice(selectedExoCloture.id)}
                disabled={clotureLoading || !balanceResult.estEquilibree}
                className="px-5 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {clotureLoading ? 'Clôture en cours...' : 'Confirmer la Clôture Définitive'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 4 : PLAN DE COMPTES OHADA */}
      {/* ========================================================================= */}
      {activeTab === 'plan_comptes' && (
        <Card title="Nomenclature du Plan Comptable SYSCOHADA Révisé">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
            {[
              { classe: 1, nom: 'Ressources durables', desc: 'Capital, réserves, emprunts', color: 'from-amber-500 to-amber-600' },
              { classe: 2, nom: 'Actif immobilisé', desc: 'Immobilisations corporelles & incorporelles', color: 'from-blue-500 to-blue-600' },
              { classe: 3, nom: 'Stocks & En-cours', desc: 'Marchandises, matières, emballages', color: 'from-emerald-500 to-emerald-600' },
              { classe: 4, nom: 'Comptes de tiers', desc: 'Clients, fournisseurs, personnel, État (TVA 18%)', color: 'from-violet-500 to-violet-600' },
              { classe: 5, nom: 'Comptes de trésorerie', desc: 'Banque, caisse, Mobile Money (Orange, Moov, Wave)', color: 'from-cyan-500 to-cyan-600' },
              { classe: 6, nom: 'Charges activités ordinaires', desc: 'Achats marchandises, loyers, salaires', color: 'from-rose-500 to-rose-600' },
              { classe: 7, nom: 'Produits activités ordinaires', desc: 'Ventes marchandises, prestations', color: 'from-indigo-500 to-indigo-600' },
            ].map((cl) => (
              <div key={cl.classe} className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
                <div className="flex items-center gap-2 mb-1">
                  <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${cl.color} text-white flex items-center justify-center font-bold text-xs`}>
                    {cl.classe}
                  </div>
                  <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">{cl.nom}</h4>
                </div>
                <p className="text-[11px] text-slate-500">{cl.desc}</p>
              </div>
            ))}
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Numéro</th>
                  <th className="py-2.5 px-3">Intitulé SYSCOHADA</th>
                  <th className="py-2.5 px-3">Classe</th>
                  <th className="py-2.5 px-3">Nature</th>
                  <th className="py-2.5 px-3">Lettrable</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {(comptes.length > 0 ? comptes : PLAN_SYSCOHADA_STANDARD).map((c) => (
                  <tr key={c.numero} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">{c.numero}</td>
                    <td className="py-2 px-3 font-medium text-slate-800 dark:text-slate-200">{c.libelle}</td>
                    <td className="py-2 px-3">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        Classe {c.classe}
                      </span>
                    </td>
                    <td className="py-2 px-3 text-slate-600 dark:text-slate-400 capitalize">{c.type}</td>
                    <td className="py-2 px-3">
                      {c.lettrable ? (
                        <span className="text-emerald-600 font-bold">Oui</span>
                      ) : (
                        <span className="text-slate-400">Non</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* MODAL : NOUVELLE PIÈCE COMPTABLE / ÉCRITURE DOUBLE ENTRÉE */}
      {/* ========================================================================= */}
      {newPieceModal && (
        <Modal
          open={true}
          onClose={() => setNewPieceModal(false)}
          title="Saisie d'une Pièce Comptable (Partie Double OHADA)"
          size="lg"
        >
          <div className="space-y-4">
            <Callout variant="info" title="Principe de la partie double">
              Le montant total au <strong>Débit</strong> doit être strictement égal au montant total au <strong>Crédit</strong>.
            </Callout>

            {/* En-tête de la pièce */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Journal comptable *
                </label>
                <select
                  value={pieceForm.journal_id}
                  onChange={(e) => setPieceForm({ ...pieceForm, journal_id: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                >
                  {journaux.map((j) => (
                    <option key={j.id} value={j.id}>{j.code} — {j.libelle}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Date de la pièce *
                </label>
                <input
                  type="date"
                  value={pieceForm.date_piece}
                  onChange={(e) => setPieceForm({ ...pieceForm, date_piece: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Référence doc externe
                </label>
                <input
                  type="text"
                  placeholder="ex: FACT-2026-089"
                  value={pieceForm.reference_document}
                  onChange={(e) => setPieceForm({ ...pieceForm, reference_document: e.target.value })}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Libellé général de l'opération *
              </label>
              <input
                type="text"
                placeholder="ex: Règlement facture client Société ABC par virement"
                value={pieceForm.libelle}
                onChange={(e) => setPieceForm({ ...pieceForm, libelle: e.target.value })}
                className="w-full px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
              />
            </div>

            {/* Lignes d'écritures double entrée */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Lignes d'écritures (Comptes, Débit, Crédit)
                </span>
                <button
                  type="button"
                  onClick={addLigne}
                  className="text-xs text-sky-600 dark:text-sky-400 font-semibold hover:underline flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Ajouter une ligne</span>
                </button>
              </div>

              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {lignesForm.map((ligne, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 grid grid-cols-12 gap-2 items-center"
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Compte OHADA</label>
                      <select
                        value={ligne.compte_numero}
                        onChange={(e) => updateLigne(idx, 'compte_numero', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-slate-800 dark:text-slate-200"
                      >
                        {(comptes.length > 0 ? comptes : PLAN_SYSCOHADA_STANDARD).map((c) => (
                          <option key={c.numero} value={c.numero}>
                            {c.numero} - {c.libelle.slice(0, 30)}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="col-span-12 sm:col-span-3">
                      <label className="block text-[10px] text-slate-500 mb-0.5">Tiers (optionnel)</label>
                      <input
                        type="text"
                        placeholder="Nom du tiers"
                        value={ligne.tiers_nom}
                        onChange={(e) => updateLigne(idx, 'tiers_nom', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs text-slate-800 dark:text-slate-200"
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5 text-right">Débit (FCFA)</label>
                      <input
                        type="number"
                        min="0"
                        value={ligne.debit}
                        onChange={(e) => updateLigne(idx, 'debit', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-right text-slate-800 dark:text-slate-200"
                      />
                    </div>

                    <div className="col-span-5 sm:col-span-2">
                      <label className="block text-[10px] text-slate-500 mb-0.5 text-right">Crédit (FCFA)</label>
                      <input
                        type="number"
                        min="0"
                        value={ligne.credit}
                        onChange={(e) => updateLigne(idx, 'credit', e.target.value)}
                        className="w-full px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-xs font-mono text-right text-slate-800 dark:text-slate-200"
                      />
                    </div>

                    <div className="col-span-2 sm:col-span-1 text-center pt-3 sm:pt-0">
                      <button
                        type="button"
                        onClick={() => removeLigne(idx)}
                        className="p-1 rounded text-slate-400 hover:text-rose-500 transition-colors"
                        title="Supprimer la ligne"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Barre de contrôle d'équilibre en bas du formulaire */}
              <div className="mt-3 p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 flex items-center justify-between text-xs font-mono font-bold">
                <div>
                  Total Débit : <span className="text-sky-600 dark:text-sky-400">{formatCurrency(totalDebitSaisie)}</span>
                </div>
                <div>
                  Total Crédit : <span className="text-emerald-600 dark:text-emerald-400">{formatCurrency(totalCreditSaisie)}</span>
                </div>
                <div>
                  {estEquilibreeSaisie ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <Check className="w-4 h-4" /> Équilibré
                    </span>
                  ) : (
                    <span className="text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4" /> Écart : {formatCurrency(Math.abs(totalDebitSaisie - totalCreditSaisie))}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Actions modal */}
            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-200 dark:border-slate-700">
              <button
                type="button"
                onClick={() => setNewPieceModal(false)}
                className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={handleSavePiece}
                disabled={saving || !estEquilibreeSaisie}
                className="px-5 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold disabled:opacity-50 transition-colors flex items-center gap-1.5 shadow-sm"
              >
                {saving ? 'Validation...' : 'Valider et Enregistrer'}
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
