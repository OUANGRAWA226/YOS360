import { useState, useMemo } from 'react';
import { Plus, Search, Trash2, Send, CheckCircle2, XCircle, ArrowRight, PackageCheck } from 'lucide-react';
import type { TransfertWithRelations, ProduitWithCategorie, Entrepot, StockEntrepot } from '@/lib/supabase';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatShortDate, generateReference, statutLabel, statutColor } from '@/lib/format';

type Props = {
  transferts: TransfertWithRelations[];
  produits: ProduitWithCategorie[];
  entrepots: Entrepot[];
  stocksEntrepot: StockEntrepot[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

export function Transferts({ transferts, produits, entrepots, stocksEntrepot, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'transferts', 'create');
  const canEdit = can(role, 'transferts', 'edit');
  const canDelete = can(role, 'transferts', 'delete');
  const [search, setSearch] = useState('');
  const [filterStatut, setFilterStatut] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<TransfertWithRelations | null>(null);
  const [saving, setSaving] = useState(false);

  // form
  const [produitId, setProduitId] = useState('');
  const [sourceId, setSourceId] = useState('');
  const [destId, setDestId] = useState('');
  const [quantite, setQuantite] = useState('1');
  const [note, setNote] = useState('');

  const stockInSource = useMemo(() => {
    if (!produitId || !sourceId) return null;
    const s = stocksEntrepot.find((x) => x.produit_id === produitId && x.entrepot_id === sourceId);
    return s ? s.quantite : 0;
  }, [produitId, sourceId, stocksEntrepot]);

  const filtered = useMemo(() => {
    return transferts.filter((t) => {
      const q = search.toLowerCase();
      const matchSearch =
        (t.reference || '').toLowerCase().includes(q) ||
        (t.produits?.nom || '').toLowerCase().includes(q);
      const matchStatut = filterStatut === 'all' || t.statut === filterStatut;
      return matchSearch && matchStatut;
    });
  }, [transferts, search, filterStatut]);

  const openCreate = () => {
    setProduitId(produits[0]?.id || '');
    setSourceId(entrepots[0]?.id || '');
    setDestId(entrepots[1]?.id || entrepots[0]?.id || '');
    setQuantite('1');
    setNote('');
    setCreateOpen(true);
  };

  const save = async () => {
    if (!produitId || !sourceId || !destId) { showToast('Veuillez remplir tous les champs', 'error'); return; }
    if (sourceId === destId) { showToast('Les sites source et destination doivent être différents', 'error'); return; }
    const qte = parseInt(quantite);
    if (!qte || qte <= 0) { showToast('La quantité doit être positive', 'error'); return; }
    if (!navigator.onLine) { showToast('La création de transfert nécessite une connexion internet', 'error'); return; }
    setSaving(true);
    const result = await writeRow('transferts', 'insert', {
      reference: generateReference('TRF'),
      produit_id: produitId,
      quantite: qte,
      entrepot_source_id: sourceId,
      entrepot_dest_id: destId,
      statut: 'en_preparation',
      note: note.trim() || null,
    });
    setSaving(false);
    if (result.offline) { showToast('Transfert enregistré localement, sera synchronisé', 'info'); }
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast('Bon de transfert créé');
    setCreateOpen(false);
    onRefresh();
  };

  const setStatus = async (t: TransfertWithRelations, statut: string) => {
    const result = await writeRow('transferts', 'update', { statut }, t.id);
    if (result.offline) { showToast('Statut enregistré localement (hors-ligne)', 'info'); return; }
    if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    showToast(statut === 'envoye' ? 'Transfert envoyé — stock basculé vers le site de destination' : statut === 'recu' ? 'Transfert réceptionné' : 'Transfert annulé');
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('transferts', 'delete', {}, deleteTarget.id);
    if (result.offline) showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast('Transfert supprimé');
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Transferts inter-sites</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Bons de transfert : envoi puis réception</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} disabled={entrepots.length < 2} className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700 transition-colors shadow-sm shadow-sky-600/20 disabled:opacity-50 disabled:cursor-not-allowed">
            <Plus className="w-5 h-5" /> Nouveau transfert
          </button>
        )}
      </div>

      {entrepots.length < 2 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 text-sm text-amber-800">
          Créez au moins deux sites dans « Entrepôts » pour pouvoir effectuer des transferts.
        </div>
      )}

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par référence, produit..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
          <option value="all">Tous statuts</option>
          <option value="en_preparation">En préparation</option>
          <option value="envoye">Envoyé</option>
          <option value="recu">Reçu</option>
          <option value="annule">Annulé</option>
        </select>
      </div>

      {loading ? (
        <div className="p-8 space-y-3">{[...Array(4)].map((_, i) => <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />)}</div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <PackageCheck className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucun transfert</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 font-semibold text-slate-600">Référence</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Produit</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Trajet</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Qté</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Statut</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Dates</th>
                  <th className="text-right px-6 py-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((t) => {
                  const sc = statutColor(t.statut);
                  const canEnvoyer = canEdit && t.statut === 'en_preparation';
                  const canRecevoir = canEdit && t.statut === 'envoye';
                  const canAnnuler = canEdit && t.statut === 'en_preparation';
                  return (
                    <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-slate-700">{t.reference}</td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{t.produits?.nom || '—'}</p>
                        {t.produits?.sku && <p className="text-xs font-mono text-slate-400">{t.produits.sku}</p>}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <div className="flex items-center justify-center gap-1.5 text-xs">
                          <span className="font-medium text-slate-700">{t.entrepots_source?.nom || '—'}</span>
                          <ArrowRight className="w-3.5 h-3.5 text-sky-500" />
                          <span className="font-medium text-slate-700">{t.entrepots_dest?.nom || '—'}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-slate-900">{formatNumber(t.quantite)}</td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{statutLabel(t.statut)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">
                        {t.envoye_at && <div>Envoyé: {formatShortDate(t.envoye_at)}</div>}
                        {t.recu_at && <div>Reçu: {formatShortDate(t.recu_at)}</div>}
                        {!t.envoye_at && !t.recu_at && '—'}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          {canEnvoyer && (
                            <button onClick={() => setStatus(t, 'envoye')} className="p-2 rounded-lg hover:bg-sky-50 text-slate-400 hover:text-sky-600 transition-colors" title="Marquer envoyé (le stock bascule)"><Send className="w-4 h-4" /></button>
                          )}
                          {canRecevoir && (
                            <button onClick={() => setStatus(t, 'recu')} className="p-2 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Confirmer la réception"><CheckCircle2 className="w-4 h-4" /></button>
                          )}
                          {canAnnuler && (
                            <button onClick={() => setStatus(t, 'annule')} className="p-2 rounded-lg hover:bg-amber-50 text-slate-400 hover:text-amber-600 transition-colors" title="Annuler"><XCircle className="w-4 h-4" /></button>
                          )}
                          {canDelete && t.statut !== 'envoye' && (
                            <button onClick={() => setDeleteTarget(t)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Supprimer"><Trash2 className="w-4 h-4" /></button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouveau bon de transfert" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Produit *</label>
            <select value={produitId} onChange={(e) => setProduitId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
              {produits.map((p) => <option key={p.id} value={p.id}>{p.nom} (Stock total: {p.quantite} {p.unite})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site source *</label>
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                {entrepots.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site destination *</label>
              <select value={destId} onChange={(e) => setDestId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                {entrepots.filter((e) => e.id !== sourceId).map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quantité *</label>
            <input type="number" value={quantite} onChange={(e) => setQuantite(e.target.value)} min="1"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            {stockInSource !== null && (
              <p className={`text-xs mt-1 ${stockInSource >= parseInt(quantite) ? 'text-slate-500' : 'text-red-600 font-medium'}`}>
                Stock disponible sur le site source : {stockInSource}
              </p>
            )}
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motif, transporteur..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
            <button onClick={save} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors shadow-sm disabled:opacity-50">
              {saving ? 'Création...' : 'Créer le transfert'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer le transfert"
        message={`Supprimer le transfert ${deleteTarget?.reference} ? Les transferts déjà envoyés ne peuvent pas être supprimés.`}
        confirmLabel="Supprimer"
      />
    </div>
  );
}
