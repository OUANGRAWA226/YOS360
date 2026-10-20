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
  genererExportFEC,
  telechargerFichier,
  type ResultatBalance,
  type CompteGrandLivre,
} from '@/lib/comptaSyscohada';

type Props = {
  role: Role | null;
  entrepots: Entrepot[];
  loading: boolean;
};

type TabType = 'journaux' | 'grand_livre' | 'balance' | 'plan_comptes';

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
