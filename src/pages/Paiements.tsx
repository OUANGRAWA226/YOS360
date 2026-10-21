import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Trash2,
  HandCoins,
  Smartphone,
  AlertCircle,
  Phone,
  CalendarClock,
  ArrowDownLeft,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Filter,
  MessageCircle,
  TrendingDown,
  Layers,
  Scale,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type {
  PaiementWithRelations,
  Client,
  Fournisseur,
  CommandeWithRelations,
  ModePaiement,
  SensPaiement,
  Entreprise,
} from '@/lib/supabase';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { modePaiementLabel, MODES_PAIEMENT, formatCurrency, daysUntil, formatShortDate } from '@/lib/format';
import { InfoBox, Card, Callout } from '@/components/adminlte';

type Props = {
  paiements: PaiementWithRelations[];
  clients: Client[];
  fournisseurs: Fournisseur[];
  commandes: CommandeWithRelations[];
  entreprise: Entreprise | null;
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

export type AgingBucket = 'all' | '0_30' | '31_60' | '61_90' | '90_plus';

export function Paiements({
  paiements,
  clients,
  fournisseurs,
  commandes,
  entreprise,
  loading,
  onRefresh,
  role,
}: Props) {
  const canCreate = can(role, 'paiements', 'create');
  const canDelete = can(role, 'paiements', 'delete');
  const devise = entreprise?.devise || 'XOF';

  const [activeTab, setActiveTab] = useState<'flux' | 'balance_agee'>('balance_agee');
  const [selectedBucket, setSelectedBucket] = useState<AgingBucket>('all');
  const [search, setSearch] = useState('');
  const [filterSens, setFilterSens] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaiementWithRelations | null>(null);
  const [saving, setSaving] = useState(false);

  // Formulaire d'ajout
  const [sens, setSens] = useState<SensPaiement>('encaissement');
  const [commandeId, setCommandeId] = useState('');
  const [partenaireId, setPartenaireId] = useState('');
  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  // Créances clients : factures de vente avec solde restant
  const creancesClients = useMemo(() => {
    return commandes
      .filter((c) => c.type === 'vente' && c.statut !== 'annulee')
      .map((c) => {
        const paye = paiements
          .filter((p) => p.commande_id === c.id && p.sens === 'encaissement')
          .reduce((s, p) => s + p.montant, 0);
        const reste = c.montant_total - paye;
        const dateRef = c.date_commande || c.created_at;
        const ageJours = Math.max(
          0,
          Math.floor((Date.now() - new Date(dateRef).getTime()) / (1000 * 60 * 60 * 24))
        );

        let bucket: '0_30' | '31_60' | '61_90' | '90_plus' = '0_30';
        if (ageJours > 90) bucket = '90_plus';
        else if (ageJours > 60) bucket = '61_90';
        else if (ageJours > 30) bucket = '31_60';

        return { cmd: c, paye, reste, ageJours, bucket };
      })
      .filter(({ reste }) => reste > 0.009)
      .sort((a, b) => b.ageJours - a.ageJours);
  }, [commandes, paiements]);

  // Totaux par tranche de la Balance Âgée
  const statsBalanceAgee = useMemo(() => {
    const b0_30 = creancesClients.filter((c) => c.bucket === '0_30');
    const b31_60 = creancesClients.filter((c) => c.bucket === '31_60');
    const b61_90 = creancesClients.filter((c) => c.bucket === '61_90');
    const b90Plus = creancesClients.filter((c) => c.bucket === '90_plus');

    const sum0_30 = b0_30.reduce((s, c) => s + c.reste, 0);
    const sum31_60 = b31_60.reduce((s, c) => s + c.reste, 0);
    const sum61_90 = b61_90.reduce((s, c) => s + c.reste, 0);
    const sum90Plus = b90Plus.reduce((s, c) => s + c.reste, 0);
    const totalGeneral = sum0_30 + sum31_60 + sum61_90 + sum90Plus;

    return {
      b0_30: { count: b0_30.length, montant: sum0_30, pct: totalGeneral ? (sum0_30 / totalGeneral) * 100 : 0 },
      b31_60: { count: b31_60.length, montant: sum31_60, pct: totalGeneral ? (sum31_60 / totalGeneral) * 100 : 0 },
      b61_90: { count: b61_90.length, montant: sum61_90, pct: totalGeneral ? (sum61_90 / totalGeneral) * 100 : 0 },
      b90Plus: { count: b90Plus.length, montant: sum90Plus, pct: totalGeneral ? (sum90Plus / totalGeneral) * 100 : 0 },
      totalGeneral,
      countTotal: creancesClients.length,
    };
  }, [creancesClients]);

  // Filtrage créances selon la tranche sélectionnée
  const creancesFiltrees = useMemo(() => {
    return creancesClients.filter((c) => {
      if (selectedBucket !== 'all' && c.bucket !== selectedBucket) return false;
      const q = search.toLowerCase();
      if (!q) return true;
      return (
        (c.cmd.clients?.nom || '').toLowerCase().includes(q) ||
        (c.cmd.client_walkin || '').toLowerCase().includes(q) ||
        (c.cmd.numero_document || '').toLowerCase().includes(q) ||
        (c.cmd.reference || '').toLowerCase().includes(q)
      );
    });
  }, [creancesClients, selectedBucket, search]);

  // Dettes fournisseurs
  const dettesFournisseurs = useMemo(() => {
    return commandes
      .filter((c) => c.type === 'achat' && c.statut !== 'annulee')
      .map((c) => {
        const paye = paiements
          .filter((p) => p.commande_id === c.id && p.sens === 'decaissement')
          .reduce((s, p) => s + p.montant, 0);
        return { cmd: c, paye, reste: c.montant_total - paye };
      })
      .filter(({ reste }) => reste > 0.009);
  }, [commandes, paiements]);

  // Relances prioritaires (échues ou > 30j)
  const relances = useMemo(() => {
    return creancesClients.filter(({ cmd, ageJours }) => {
      if (cmd.date_echeance) {
        return daysUntil(cmd.date_echeance) < 0;
      }
      return ageJours > 30;
    });
  }, [creancesClients]);

  // Filtrage du registre des paiements
  const filtered = useMemo(() => {
    return paiements.filter((p) => {
      const q = search.toLowerCase();
      const matchSearch =
        (p.clients?.nom || '').toLowerCase().includes(q) ||
        (p.fournisseurs?.nom || '').toLowerCase().includes(q) ||
        (p.reference || '').toLowerCase().includes(q) ||
        (p.commandes?.numero_document || p.commandes?.reference || '').toLowerCase().includes(q);
      const matchSens = filterSens === 'all' || p.sens === filterSens;
      return matchSearch && matchSens;
    });
  }, [paiements, search, filterSens]);

  const totalEncaisse = paiements.filter((p) => p.sens === 'encaissement').reduce((s, p) => s + p.montant, 0);
  const totalDecaisse = paiements.filter((p) => p.sens === 'decaissement').reduce((s, p) => s + p.montant, 0);
  const totalCreances = statsBalanceAgee.totalGeneral;
  const totalDettes = dettesFournisseurs.reduce((s, c) => s + c.reste, 0);

  const openAdd = (presetSens: SensPaiement = 'encaissement') => {
    setSens(presetSens);
    setCommandeId('');
    setPartenaireId('');
    setMontant('');
    setMode('especes');
    setReference('');
    setNote('');
    setModalOpen(true);
  };

  const save = async () => {
    const mnt = parseFloat(montant);
    if (!mnt || mnt <= 0) {
      showToast('Le montant doit être positif', 'error');
      return;
    }
    if (!navigator.onLine) {
      showToast('L\'enregistrement d\'un paiement nécessite une connexion internet', 'error');
      return;
    }
    setSaving(true);
    const cmd = commandes.find((c) => c.id === commandeId);
    const { error } = await supabase.from('paiements').insert({
      commande_id: commandeId || null,
      client_id: sens === 'encaissement' ? (cmd?.client_id || partenaireId || null) : null,
      fournisseur_id: sens === 'decaissement' ? (cmd?.fournisseur_id || partenaireId || null) : null,
      sens,
      montant: mnt,
      mode,
      reference: reference.trim() || null,
      note: note.trim() || null,
    });
    setSaving(false);
    if (error) {
      showToast('Erreur: ' + error.message, 'error');
      return;
    }
    showToast('Paiement enregistré avec succès');
    setModalOpen(false);
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('paiements', 'delete', {}, deleteTarget.id);
    if (result.offline) showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else showToast('Paiement supprimé');
    onRefresh();
  };

  // Envoi de relance WhatsApp en 1-clic
  const relancer = (c: { cmd: CommandeWithRelations; reste: number }) => {
    const clientNom = c.cmd.clients?.nom || c.cmd.client_walkin || 'Client';
    const tel = c.cmd.clients?.telephone;
    const doc = c.cmd.numero_document || c.cmd.reference || '';
    const msg = `Bonjour ${clientNom},\nNous vous rappelons que votre facture ${doc} chez ${entreprise?.nom || 'notre établissement'} présente un solde restant de ${formatCurrency(c.reste, devise)}.\nMerci de procéder à son règlement par Orange Money, Moov Money, Wave ou en agence.\nCordialement,\nService Comptabilité.`;

    if (tel) {
      const cleanTel = tel.replace(/\D/g, '');
      window.open(`https://wa.me/${cleanTel}?text=${encodeURIComponent(msg)}`, '_blank');
      showToast(`Ouverture de WhatsApp pour ${clientNom}`);
    } else {
      navigator.clipboard?.writeText(msg);
      showToast('Message de relance copié dans le presse-papier (aucun N° de téléphone enregistré)');
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. AdminLTE v4 Info Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          title="Total Encaissé"
          value={formatCurrency(totalEncaisse, devise)}
          icon={ArrowDownLeft}
          color="bg-emerald-500"
          progress={100}
          description="Entrées de trésorerie"
        />
        <InfoBox
          title="Total Décaissé"
          value={formatCurrency(totalDecaisse, devise)}
          icon={ArrowUpRight}
          color="bg-slate-600"
          progress={100}
          description="Règlements fournisseurs"
        />
        <InfoBox
          title="Créances Clients (Balance Âgée)"
          value={formatCurrency(totalCreances, devise)}
          icon={TrendingDown}
          color="bg-amber-500"
          progress={statsBalanceAgee.b90Plus.pct}
          description={`${statsBalanceAgee.countTotal} factures à recouvrer`}
        />
        <InfoBox
          title="Dettes Fournisseurs"
          value={formatCurrency(totalDettes, devise)}
          icon={CalendarClock}
          color="bg-rose-500"
          progress={100}
          description="Reste dû à payer"
        />
      </div>

      {/* 2. Navigation par Onglets */}
      <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-px">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setActiveTab('balance_agee')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'balance_agee'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <Scale className="w-4 h-4" />
            <span>Balance Âgée & Gestion des Créances</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-amber-500/20 text-amber-500 font-bold">
              {statsBalanceAgee.countTotal}
            </span>
          </button>

          <button
            onClick={() => setActiveTab('flux')}
            className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
              activeTab === 'flux'
                ? 'border-sky-600 text-sky-600 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <HandCoins className="w-4 h-4" />
            <span>Registre des Flux Financiers</span>
            <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-slate-100 dark:bg-slate-800 font-bold">
              {paiements.length}
            </span>
          </button>
        </div>

        {canCreate && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => openAdd('encaissement')}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-500 text-white shadow-md shadow-emerald-600/20 transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Nouvel Encaissement</span>
            </button>
            <button
              onClick={() => openAdd('decaissement')}
              className="px-3 py-1.5 rounded-xl text-xs font-bold bg-slate-700 hover:bg-slate-600 text-white transition-all inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>Décaissement</span>
            </button>
          </div>
        )}
      </div>

      {/* 3. Onglet Balance Âgée Interactive (Phase 1.5) */}
      {activeTab === 'balance_agee' && (
        <div className="space-y-5">
          {/* Cartes interactives des 4 tranches d'ancienneté */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <button
              onClick={() => setSelectedBucket(selectedBucket === '0_30' ? 'all' : '0_30')}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                selectedBucket === '0_30'
                  ? 'ring-2 ring-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 border-emerald-500'
                  : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-emerald-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-300">0 à 30 jours</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                  {statsBalanceAgee.b0_30.count} fact.
                </span>
              </div>
              <p className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                {formatCurrency(statsBalanceAgee.b0_30.montant, devise)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Non échu / Risque faible ({Math.round(statsBalanceAgee.b0_30.pct)}%)</p>
            </button>

            <button
              onClick={() => setSelectedBucket(selectedBucket === '31_60' ? 'all' : '31_60')}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                selectedBucket === '31_60'
                  ? 'ring-2 ring-sky-500 bg-sky-50/50 dark:bg-sky-950/20 border-sky-500'
                  : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-sky-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-300">31 à 60 jours</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300">
                  {statsBalanceAgee.b31_60.count} fact.
                </span>
              </div>
              <p className="text-base font-extrabold text-sky-600 dark:text-sky-400">
                {formatCurrency(statsBalanceAgee.b31_60.montant, devise)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Retard modéré ({Math.round(statsBalanceAgee.b31_60.pct)}%)</p>
            </button>

            <button
              onClick={() => setSelectedBucket(selectedBucket === '61_90' ? 'all' : '61_90')}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                selectedBucket === '61_90'
                  ? 'ring-2 ring-amber-500 bg-amber-50/50 dark:bg-amber-950/20 border-amber-500'
                  : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-amber-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-300">61 à 90 jours</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                  {statsBalanceAgee.b61_90.count} fact.
                </span>
              </div>
              <p className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                {formatCurrency(statsBalanceAgee.b61_90.montant, devise)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Alerte relance ({Math.round(statsBalanceAgee.b61_90.pct)}%)</p>
            </button>

            <button
              onClick={() => setSelectedBucket(selectedBucket === '90_plus' ? 'all' : '90_plus')}
              className={`p-3.5 rounded-2xl border text-left transition-all ${
                selectedBucket === '90_plus'
                  ? 'ring-2 ring-rose-500 bg-rose-50/50 dark:bg-rose-950/20 border-rose-500'
                  : 'bg-white dark:bg-slate-800/80 border-slate-200 dark:border-slate-700 hover:border-rose-400'
              }`}
            >
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="font-bold text-slate-700 dark:text-slate-300">+ de 90 jours</span>
                <span className="px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300">
                  {statsBalanceAgee.b90Plus.count} fact.
                </span>
              </div>
              <p className="text-base font-extrabold text-rose-600 dark:text-rose-400">
                {formatCurrency(statsBalanceAgee.b90Plus.montant, devise)}
              </p>
              <p className="text-[10px] text-slate-400 mt-1">Créances critiques ({Math.round(statsBalanceAgee.b90Plus.pct)}%)</p>
            </button>
          </div>

          {/* Tableau des créances avec relance WhatsApp directe */}
          <Card
            title={`Détail des créances clients — ${
              selectedBucket === 'all'
                ? 'Toutes les tranches'
                : selectedBucket === '0_30'
                ? 'Tranche 0 à 30 jours'
                : selectedBucket === '31_60'
                ? 'Tranche 31 à 60 jours'
                : selectedBucket === '61_90'
                ? 'Tranche 61 à 90 jours'
                : 'Tranche +90 jours (Critiques)'
            } (${creancesFiltrees.length})`}
            headerAction={
              <div className="relative w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Filtrer par client ou n° facture..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            }
          >
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Client</th>
                    <th className="py-2.5 px-3 font-semibold">N° Facture / Document</th>
                    <th className="py-2.5 px-3 font-semibold">Date émission</th>
                    <th className="py-2.5 px-3 font-semibold text-center">Âge de la créance</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Montant Facture</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Reste Dû</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Actions Relance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {creancesFiltrees.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="text-center py-8 text-slate-400">
                        Aucune créance client dans cette tranche.
                      </td>
                    </tr>
                  ) : (
                    creancesFiltrees.map(({ cmd, reste, ageJours, bucket }) => (
                      <tr key={cmd.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                        <td className="py-3 px-3">
                          <p className="font-bold text-slate-800 dark:text-slate-100">
                            {cmd.clients?.nom || cmd.client_walkin || 'Client Comptoir'}
                          </p>
                          {cmd.clients?.telephone && (
                            <p className="text-[10px] text-slate-400 font-mono">{cmd.clients.telephone}</p>
                          )}
                        </td>
                        <td className="py-3 px-3 font-mono font-bold text-sky-600 dark:text-sky-400">
                          {cmd.numero_document || cmd.reference}
                        </td>
                        <td className="py-3 px-3 text-slate-500">{formatShortDate(cmd.date_commande)}</td>
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              bucket === '90_plus'
                                ? 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                                : bucket === '61_90'
                                ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                                : bucket === '31_60'
                                ? 'bg-sky-100 text-sky-800 dark:bg-sky-500/20 dark:text-sky-300'
                                : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            }`}
                          >
                            {ageJours} jour(s)
                          </span>
                        </td>
                        <td className="py-3 px-3 text-right text-slate-500">
                          {formatCurrency(cmd.montant_total, devise)}
                        </td>
                        <td className="py-3 px-3 text-right font-extrabold text-rose-600 dark:text-rose-400">
                          {formatCurrency(reste, devise)}
                        </td>
                        <td className="py-3 px-3 text-right">
                          <button
                            onClick={() => relancer({ cmd, reste })}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-500/10 dark:hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors inline-flex items-center gap-1.5"
                            title="Envoyer une relance WhatsApp personnalisée ou copier le message"
                          >
                            <MessageCircle className="w-3.5 h-3.5" />
                            <span>Relancer WhatsApp</span>
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* 4. Onglet Registre des Flux Financiers */}
      {activeTab === 'flux' && (
        <Card
          title={`Registre des flux financiers (${filtered.length})`}
          headerAction={
            <div className="flex items-center gap-2">
              <div className="relative w-48 sm:w-64">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  placeholder="Client, réf, n° document..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-200"
                />
              </div>
              <div className="inline-flex rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
                {(['all', 'encaissement', 'decaissement'] as const).map((s) => (
                  <button
                    key={s}
                    onClick={() => setFilterSens(s)}
                    className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                      filterSens === s
                        ? s === 'decaissement'
                          ? 'bg-rose-600 text-white'
                          : s === 'encaissement'
                          ? 'bg-emerald-600 text-white'
                          : 'bg-sky-600 text-white'
                        : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                    }`}
                  >
                    {s === 'all' ? 'Tous' : s === 'encaissement' ? 'Encaissements' : 'Décaissements'}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                <tr>
                  <th className="py-2.5 px-3 font-semibold">Sens</th>
                  <th className="py-2.5 px-3 font-semibold">Partenaire</th>
                  <th className="py-2.5 px-3 font-semibold">Document lié</th>
                  <th className="py-2.5 px-3 font-semibold">Moyen de règlement</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Montant</th>
                  <th className="py-2.5 px-3 font-semibold">Référence Transaction</th>
                  <th className="py-2.5 px-3 font-semibold">Date</th>
                  <th className="py-2.5 px-3 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="text-center py-8 text-slate-400">
                      Aucun paiement enregistré.
                    </td>
                  </tr>
                ) : (
                  filtered.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                      <td className="py-3 px-3">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                            p.sens === 'encaissement'
                              ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                              : 'bg-rose-100 text-rose-800 dark:bg-rose-500/20 dark:text-rose-300'
                          }`}
                        >
                          {p.sens === 'encaissement' ? '+ Encaissement' : '- Décaissement'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-900 dark:text-slate-100">
                        {p.clients?.nom || p.fournisseurs?.nom || 'Client Comptoir'}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-sky-600 dark:text-sky-400">
                        {p.commandes?.numero_document || p.commandes?.reference || '—'}
                      </td>
                      <td className="py-3 px-3">
                        <span className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
                          {MODES_PAIEMENT.find((m) => m.value === p.mode)?.mobile && (
                            <Smartphone className="w-3.5 h-3.5 text-amber-500" />
                          )}
                          {modePaiementLabel(p.mode)}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-right font-extrabold text-xs">
                        <span className={p.sens === 'encaissement' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}>
                          {formatCurrency(p.montant, devise)}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-500">
                        {p.reference || '—'}
                      </td>
                      <td className="py-3 px-3 text-xs text-slate-500">
                        {formatShortDate(p.created_at)}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(p)}
                            className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                            title="Supprimer ce paiement"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Modal Nouvel Enregistrement Paiement */}
      {/* Modal Nouvel Enregistrement Paiement */}
      {modalOpen && (
        <Modal
          title={sens === 'encaissement' ? 'Enregistrer un Encaissement Client' : 'Enregistrer un Décaissement Fournisseur'}
          open={modalOpen}
          onClose={() => setModalOpen(false)}
        >
          <form
            onSubmit={(e) => {
              e.preventDefault();
              save();
            }}
            className="space-y-4"
          >
            <div>
              <label className="form-label-lte">
                Facture / Commande rattachée
              </label>
              <select
                value={commandeId}
                onChange={(e) => {
                  const id = e.target.value;
                  setCommandeId(id);
                  const selected = commandes.find((c) => c.id === id);
                  if (selected) {
                    const paye = paiements
                      .filter((p) => p.commande_id === id && p.sens === sens)
                      .reduce((s, p) => s + p.montant, 0);
                    const reste = Math.max(selected.montant_total - paye, 0);
                    setMontant(String(reste));
                  }
                }}
                className="form-select-lte text-xs"
              >
                <option value="">Sélectionner une facture (optionnel)...</option>
                {commandes
                  .filter((c) => (sens === 'encaissement' ? c.type === 'vente' : c.type === 'achat'))
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.numero_document || c.reference} — {c.clients?.nom || c.fournisseurs?.nom || 'Comptoir'} (
                      {formatCurrency(c.montant_total, devise)})
                    </option>
                  ))}
              </select>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">
                  Montant à régler ({devise}) <span className="text-red-500">*</span>
                </label>
                <input
                  type="number"
                  required
                  value={montant}
                  onChange={(e) => setMontant(e.target.value)}
                  placeholder="ex. 50000"
                  className="form-control-lte text-xs font-bold font-mono"
                />
              </div>

              <div>
                <label className="form-label-lte">
                  Moyen de paiement <span className="text-red-500">*</span>
                </label>
                <select
                  value={mode}
                  onChange={(e) => setMode(e.target.value as ModePaiement)}
                  className="form-select-lte text-xs font-semibold"
                >
                  {MODES_PAIEMENT.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label} {m.mobile ? '📱' : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="form-label-lte">
                Référence Transaction Télécom / Chèque / Virement
              </label>
              <input
                type="text"
                placeholder={
                  mode === 'orange_money'
                    ? 'ex: MP261019.1234.A09876'
                    : mode === 'moov_money'
                    ? 'ex: TXN-FLO-987654'
                    : mode === 'wave'
                    ? 'ex: WAV-BF-009871'
                    : 'N° bordereau, chèque ou virement...'
                }
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="form-control-lte text-xs font-mono"
              />
            </div>

            <div>
              <label className="form-label-lte">
                Notes / Motif
              </label>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="ex. Acompte 50%, solde facture..."
                className="form-control-lte text-xs"
              />
            </div>

            <div className="modal-footer-lte">
              <button
                type="button"
                onClick={() => setModalOpen(false)}
                className="btn-lte btn-lte-sm btn-lte-outline-secondary"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-lte btn-lte-sm btn-lte-primary disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Valider le paiement'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* Confirmation Suppression */}
      {deleteTarget && (
        <ConfirmDialog
          open={Boolean(deleteTarget)}
          title="Supprimer ce paiement"
          message={`Êtes-vous sûr de vouloir supprimer le paiement de ${formatCurrency(
            deleteTarget.montant,
            devise
          )} ? Cette action mettra à jour le solde restant dû de la facture correspondante.`}
          confirmLabel="Supprimer"
          variant="danger"
          onConfirm={confirmDelete}
          onClose={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
