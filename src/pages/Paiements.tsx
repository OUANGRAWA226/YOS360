import { useState, useMemo } from 'react';
import { Plus, Search, Trash2, HandCoins, Smartphone, AlertCircle, Phone, CalendarClock, ArrowDownLeft, ArrowUpRight, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PaiementWithRelations, Client, Fournisseur, CommandeWithRelations, ModePaiement, SensPaiement, Entreprise } from '@/lib/supabase';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { modePaiementLabel, MODES_PAIEMENT } from '@/lib/format';
import { formatCurrency, daysUntil } from '@/lib/format';
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

export function Paiements({ paiements, clients, fournisseurs, commandes, entreprise, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'paiements', 'create');
  const canDelete = can(role, 'paiements', 'delete');
  const devise = entreprise?.devise || 'XOF';
  const [search, setSearch] = useState('');
  const [filterSens, setFilterSens] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PaiementWithRelations | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [sens, setSens] = useState<SensPaiement>('encaissement');
  const [commandeId, setCommandeId] = useState('');
  const [partenaireId, setPartenaireId] = useState('');
  const [montant, setMontant] = useState('');
  const [mode, setMode] = useState<ModePaiement>('especes');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');

  // Créances clients : ventes avec solde restant
  const creancesClients = useMemo(() => {
    return commandes
      .filter((c) => c.type === 'vente' && c.statut !== 'annulee')
      .map((c) => {
        const paye = paiements.filter((p) => p.commande_id === c.id && p.sens === 'encaissement').reduce((s, p) => s + p.montant, 0);
        return { cmd: c, paye, reste: c.montant_total - paye };
      })
      .filter(({ reste }) => reste > 0.009)
      .sort((a, b) => {
        const ea = a.cmd.date_echeance ? daysUntil(a.cmd.date_echeance) : 9999;
        const eb = b.cmd.date_echeance ? daysUntil(b.cmd.date_echeance) : 9999;
        return ea - eb;
      });
  }, [commandes, paiements]);

  // Dettes fournisseurs : achats avec solde restant
  const dettesFournisseurs = useMemo(() => {
    return commandes
      .filter((c) => c.type === 'achat' && c.statut !== 'annulee')
      .map((c) => {
        const paye = paiements.filter((p) => p.commande_id === c.id && p.sens === 'decaissement').reduce((s, p) => s + p.montant, 0);
        return { cmd: c, paye, reste: c.montant_total - paye };
      })
      .filter(({ reste }) => reste > 0.009);
  }, [commandes, paiements]);

  // Relances : créances échues (échéance dépassée) ou sans échéance depuis 30 jours
  const relances = useMemo(() => {
    return creancesClients.filter(({ cmd }) => {
      if (!cmd.date_echeance) {
        return (Date.now() - new Date(cmd.date_commande).getTime()) / 86400000 > 30;
      }
      return daysUntil(cmd.date_echeance) < 0;
    });
  }, [creancesClients]);

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
  const totalCreances = creancesClients.reduce((s, c) => s + c.reste, 0);
  const totalDettes = dettesFournisseurs.reduce((s, c) => s + c.reste, 0);

  const openAdd = (presetSens: SensPaiement = 'encaissement') => {
    setSens(presetSens);
    setCommandeId(''); setPartenaireId(''); setMontant(''); setMode('especes'); setReference(''); setNote('');
    setModalOpen(true);
  };

  const save = async () => {
    const mnt = parseFloat(montant);
    if (!mnt || mnt <= 0) { showToast('Le montant doit être positif', 'error'); return; }
    if (!navigator.onLine) { showToast('L\u2019enregistrement d\u2019un paiement nécessite une connexion internet', 'error'); return; }
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
    if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
    showToast('Paiement enregistré');
    setModalOpen(false);
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('paiements', 'delete', {}, deleteTarget.id);
    if (result.offline) showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast('Paiement supprimé');
    onRefresh();
  };

  const relancer = (c: { cmd: CommandeWithRelations; reste: number }) => {
    const clientNom = c.cmd.clients?.nom || c.cmd.client_walkin || 'Client';
    const tel = c.cmd.clients?.telephone;
    const msg = `Bonjour ${clientNom}, nous vous rappelons que votre facture ${c.cmd.numero_document || c.cmd.reference || ''} présente un solde de ${formatCurrency(c.reste, devise)}. Merci de votre règlement.`;
    if (tel) {
      const telClean = tel.replace(/[^+0-9]/g, '');
      window.open(`https://wa.me/${telClean.replace('+', '')}?text=${encodeURIComponent(msg)}`, '_blank');
    } else {
      navigator.clipboard?.writeText(msg).then(
        () => showToast('Message de relance copié (pas de téléphone enregistré)', 'info'),
        () => showToast(`Relance: ${msg}`, 'info'),
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Content Header (Page header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <HandCoins className="w-7 h-7 text-primary" />
            Paiements & Créances
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Encaissements clients, règlements fournisseurs, balance des créances et alertes de relances
          </p>
        </div>
        {canCreate && (
          <button onClick={() => openAdd('encaissement')} className="btn-lte btn-lte-success">
            <Plus className="w-4 h-4" /> Nouveau paiement
          </button>
        )}
      </div>

      {/* AdminLTE Info-Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          title="Total Encaissé"
          value={formatCurrency(totalEncaisse, devise)}
          icon={ArrowDownLeft}
          variant="success"
          description="Flux entrants clients"
        />
        <InfoBox
          title="Total Décaissé"
          value={formatCurrency(totalDecaisse, devise)}
          icon={ArrowUpRight}
          variant="danger"
          description="Règlements fournisseurs"
        />
        <InfoBox
          title="Créances Clients"
          value={formatCurrency(totalCreances, devise)}
          icon={AlertCircle}
          variant="warning"
          description="Reste dû à encaisser"
        />
        <InfoBox
          title="Dettes Fournisseurs"
          value={formatCurrency(totalDettes, devise)}
          icon={CalendarClock}
          variant="info"
          description="Reste dû à payer"
        />
      </div>

      {/* Relances Card */}
      {relances.length > 0 && (
        <Card
          title={`Relances Créances à Traiter (${relances.length})`}
          icon={Phone}
          variant="danger"
          outline
        >
          <div className="space-y-2">
            {relances.slice(0, 6).map(({ cmd, reste }) => {
              const echu = cmd.date_echeance ? daysUntil(cmd.date_echeance) : null;
              return (
                <div
                  key={cmd.id}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2.5"
                >
                  <div>
                    <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">
                      {cmd.clients?.nom || cmd.client_walkin || 'Client comptoir'} —{' '}
                      <span className="text-danger font-bold">{formatCurrency(reste, devise)}</span>
                    </p>
                    <p className="text-xs text-slate-500">
                      Doc : {cmd.numero_document || cmd.reference || '—'}
                      {echu !== null && echu < 0
                        ? ` · échue depuis ${-echu} jour(s)`
                        : ' · sans échéance fixée depuis plus de 30 jours'}
                    </p>
                  </div>
                  {canCreate && (
                    <button
                      onClick={() => relancer({ cmd, reste })}
                      className="btn-lte btn-lte-danger btn-lte-sm self-start sm:self-auto"
                    >
                      <Phone className="w-3.5 h-3.5" /> Enregistrer relance
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </Card>
      )}

      {/* Table Card */}
      <Card
        title={`Registre des flux financiers (${filtered.length})`}
        icon={HandCoins}
        variant="primary"
        outline
        tools={
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Client, réf, n° document..."
                className="form-control-lte pl-9 py-1 text-xs"
              />
            </div>
            <div className="inline-flex rounded border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 p-0.5">
              {(['all', 'encaissement', 'decaissement'] as const).map((s) => (
                <button
                  key={s}
                  onClick={() => setFilterSens(s)}
                  className={`px-3 py-1 rounded text-xs font-semibold transition-all ${
                    filterSens === s
                      ? s === 'decaissement'
                        ? 'bg-danger text-white'
                        : s === 'encaissement'
                        ? 'bg-success text-white'
                        : 'bg-primary text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                  }`}
                >
                  {s === 'all' ? 'Tous' : s === 'encaissement' ? 'Encaissements' : 'Décaissements'}
                </button>
              ))}
            </div>
          </div>
        }
        noPadding
      >
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <HandCoins className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">Aucun paiement enregistré</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-adminlte">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3">Sens</th>
                  <th className="text-left px-4 py-3">Partenaire</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Document</th>
                  <th className="text-left px-4 py-3">Mode</th>
                  <th className="text-right px-4 py-3">Montant</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Référence</th>
                  <th className="text-left px-4 py-3 hidden lg:table-cell">Date</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-3">
                      <span
                        className={`badge-adminlte ${
                          p.sens === 'encaissement'
                            ? 'bg-success-subtle text-success border border-success/20'
                            : 'bg-danger-subtle text-danger border border-danger/20'
                        }`}
                      >
                        {p.sens === 'encaissement' ? '+ Encaissement' : '- Décaissement'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100">
                      {p.clients?.nom || p.fournisseurs?.nom || 'Client Comptoir'}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-primary">
                      {p.commandes?.numero_document || p.commandes?.reference || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 text-xs text-slate-700 dark:text-slate-300">
                        {MODES_PAIEMENT.find((m) => m.value === p.mode)?.mobile && (
                          <Smartphone className="w-3.5 h-3.5 text-warning" />
                        )}
                        {modePaiementLabel(p.mode)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-extrabold text-xs">
                      <span className={p.sens === 'encaissement' ? 'text-success' : 'text-danger'}>
                        {formatCurrency(p.montant, devise)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-slate-500">
                      {p.reference || '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">
                      {new Date(p.date_paiement).toLocaleDateString('fr-FR')}
                    </td>
                    <td className="px-4 py-3 text-right">
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(p)}
                          className="btn-lte btn-lte-danger btn-lte-sm"
                          title="Supprimer la transaction"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add payment modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="Nouveau paiement" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => setSens('encaissement')} className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${sens === 'encaissement' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Encaissement (client)
            </button>
            <button onClick={() => setSens('decaissement')} className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${sens === 'decaissement' ? 'bg-red-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
              Décaissement (fournisseur)
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Document concerné (facture, commande...)</label>
            <select value={commandeId} onChange={(e) => {
              setCommandeId(e.target.value);
              const c = commandes.find((cc) => cc.id === e.target.value);
              if (c) setPartenaireId(c.type === 'vente' ? (c.client_id || '') : (c.fournisseur_id || ''));
            }} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
              <option value="">Aucun document (paiement libre)</option>
              {commandes
                .filter((c) => c.type === (sens === 'encaissement' ? 'vente' : 'achat') && c.statut !== 'annulee')
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.numero_document || c.reference || c.id.slice(0, 8)} — {c.clients?.nom || c.fournisseurs?.nom || 'Comptoir'} ({formatCurrency(c.montant_total, devise)})
                  </option>
                ))}
            </select>
          </div>

          {!commandeId && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">{sens === 'encaissement' ? 'Client' : 'Fournisseur'}</label>
              <select value={partenaireId} onChange={(e) => setPartenaireId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                <option value="">—</option>
                {(sens === 'encaissement' ? clients : fournisseurs).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
              </select>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Montant ({devise}) *</label>
              <input type="number" step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} min="0"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mode de paiement *</label>
              <select value={mode} onChange={(e) => setMode(e.target.value as ModePaiement)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                {MODES_PAIEMENT.map((m) => <option key={m.value} value={m.value}>{m.label}{m.mobile ? ' (Mobile Money)' : ''}</option>)}
              </select>
            </div>
          </div>

          {MODES_PAIEMENT.find((m) => m.value === mode)?.mobile && (
            <div className="bg-orange-50 border border-orange-200 rounded-xl p-3 text-xs text-orange-800">
              Paiement Mobile Money : saisissez l'identifiant de transaction (ID) du SMS de confirmation comme référence pour la traçabilité.
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Référence transaction</label>
            <input type="text" value={reference} onChange={(e) => setReference(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-sky-500"
              placeholder={MODES_PAIEMENT.find((m) => m.value === mode)?.mobile ? 'MP240101.1234.A12345' : 'N° chèque, virement...'} />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
            <button onClick={save} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
              {saving ? 'Enregistrement...' : 'Enregistrer le paiement'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer le paiement"
        message="La suppression de ce paiement modifiera le solde du document concerné."
        confirmLabel="Supprimer"
      />
    </div>
  );
}

// garde d'échéance (affichée dans le bandeau relances)
export function EcheanceBadge({ dateEcheance }: { dateEcheance: string | null }) {
  if (!dateEcheance) return <span className="text-xs text-slate-400">Pas d'échéance</span>;
  const d = daysUntil(dateEcheance);
  if (d < 0) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-red-50 text-red-700"><CalendarClock className="w-3 h-3" /> Échue depuis {-d} j</span>;
  if (d <= 7) return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700"><CalendarClock className="w-3 h-3" /> Dans {d} j</span>;
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700"><CalendarClock className="w-3 h-3" /> Dans {d} j</span>;
}
