import { useState, useMemo } from 'react';
import { Plus, Search, Trash2, HandCoins, Smartphone, AlertCircle, Phone, CalendarClock } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { PaiementWithRelations, Client, Fournisseur, CommandeWithRelations, ModePaiement, SensPaiement, Entreprise } from '@/lib/supabase';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { modePaiementLabel, MODES_PAIEMENT } from '@/lib/format';
import { formatCurrency, daysUntil } from '@/lib/format';

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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Paiements & Créances</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Encaissements, décaissements, soldes et relances</p>
        </div>
        {canCreate && (
          <button onClick={() => openAdd('encaissement')} className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20">
            <Plus className="w-5 h-5" /> Nouveau paiement
          </button>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center"><HandCoins className="w-5 h-5 text-emerald-600" /></div>
          <div><p className="text-sm text-slate-500">Total encaissé</p><p className="text-xl font-bold text-slate-900">{formatCurrency(totalEncaisse, devise)}</p></div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><HandCoins className="w-5 h-5 text-red-600" /></div>
          <div><p className="text-sm text-slate-500">Total décaissé</p><p className="text-xl font-bold text-slate-900">{formatCurrency(totalDecaisse, devise)}</p></div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-sm text-slate-500">Créances clients</p><p className="text-xl font-bold text-slate-900">{formatCurrency(totalCreances, devise)}</p></div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center"><AlertCircle className="w-5 h-5 text-sky-600" /></div>
          <div><p className="text-sm text-slate-500">Dettes fournisseurs</p><p className="text-xl font-bold text-slate-900">{formatCurrency(totalDettes, devise)}</p></div>
        </div>
      </div>

      {/* Relances */}
      {relances.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-2xl p-5">
          <h3 className="font-semibold text-red-900 flex items-center gap-2 mb-3"><Phone className="w-5 h-5" /> Relances à faire ({relances.length})</h3>
          <div className="space-y-2">
            {relances.slice(0, 6).map(({ cmd, reste }) => {
              const echu = cmd.date_echeance ? daysUntil(cmd.date_echeance) : null;
              return (
                <div key={cmd.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 bg-white rounded-xl px-4 py-3">
                  <div>
                    <p className="font-medium text-slate-900 text-sm">{cmd.clients?.nom || cmd.client_walkin || 'Client comptoir'} — {formatCurrency(reste, devise)}</p>
                    <p className="text-xs text-slate-500">
                      {cmd.numero_document || cmd.reference || '—'}
                      {echu !== null && echu < 0 ? ` · échue depuis ${-echu} jour(s)` : ' · sans échéance depuis plus de 30 jours'}
                    </p>
                  </div>
                  {canCreate && (
                    <button onClick={() => relancer({ cmd, reste })} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-600 text-white text-xs font-medium hover:bg-red-700 transition-colors">
                      <Phone className="w-3.5 h-3.5" /> Relancer
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par client, référence, n° document..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <div className="flex gap-2">
          {(['all', 'encaissement', 'decaissement'] as const).map((s) => (
            <button key={s} onClick={() => setFilterSens(s)}
              className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                filterSens === s ? (s === 'decaissement' ? 'bg-red-600 text-white' : s === 'encaissement' ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}>
              {s === 'all' ? 'Tous' : s === 'encaissement' ? 'Encaissements' : 'Décaissements'}
            </button>
          ))}
        </div>
      </div>

      {/* Table paiements */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <HandCoins className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Aucun paiement enregistré</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 font-semibold text-slate-600">Sens</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Partenaire</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Document</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Mode</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Montant</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Référence</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden lg:table-cell">Date</th>
                  <th className="text-right px-6 py-3"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${p.sens === 'encaissement' ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-700'}`}>
                        {p.sens === 'encaissement' ? 'Encaissement' : 'Décaissement'}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {p.clients?.nom || p.fournisseurs?.nom || '—'}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell font-mono text-xs text-slate-500">
                      {p.commandes?.numero_document || p.commandes?.reference || '—'}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${MODES_PAIEMENT.find((m) => m.value === p.mode)?.mobile ? 'bg-orange-50 text-orange-700' : 'bg-slate-100 text-slate-700'}`}>
                        {MODES_PAIEMENT.find((m) => m.value === p.mode)?.mobile && <Smartphone className="w-3.5 h-3.5" />}
                        {modePaiementLabel(p.mode)}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatCurrency(p.montant, devise)}</td>
                    <td className="px-4 py-3 hidden md:table-cell font-mono text-xs text-slate-500">{p.reference || '—'}</td>
                    <td className="px-4 py-3 hidden lg:table-cell text-xs text-slate-500">{new Date(p.date_paiement).toLocaleDateString('fr-FR')}</td>
                    <td className="px-6 py-3 text-right">
                      {canDelete && (
                        <button onClick={() => setDeleteTarget(p)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Supprimer">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

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
