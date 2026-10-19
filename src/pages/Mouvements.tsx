import { useState, useMemo } from 'react';
import { Plus, Search, ArrowDownCircle, ArrowUpCircle, Trash2, ArrowLeftRight, Zap } from 'lucide-react';
import type { MouvementWithProduit, ProduitWithCategorie, Entrepot, Lot, StockEntrepot } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, daysUntil } from '@/lib/format';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';

type Props = {
  mouvements: MouvementWithProduit[];
  produits: ProduitWithCategorie[];
  entrepots: Entrepot[];
  lots: Lot[];
  stocksEntrepot: StockEntrepot[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

export function Mouvements({ mouvements, produits, entrepots, lots, stocksEntrepot, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'mouvements', 'create');
  const canDelete = can(role, 'mouvements', 'delete');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<MouvementWithProduit | null>(null);

  // form
  const [produitId, setProduitId] = useState('');
  const [type, setType] = useState<'entree' | 'sortie'>('entree');
  const [quantite, setQuantite] = useState('1');
  const [motif, setMotif] = useState('');
  const [fournisseur, setFournisseur] = useState('');
  const [destinataire, setDestinataire] = useState('');
  const [reference, setReference] = useState('');
  const [entrepotId, setEntrepotId] = useState('');
  const [lotId, setLotId] = useState('');
  const [prixUnitaire, setPrixUnitaire] = useState('0');
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return mouvements.filter((m) => {
      const matchSearch =
        (m.produits?.nom || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.motif || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.reference || '').toLowerCase().includes(search.toLowerCase());
      const matchType = filterType === 'all' || m.type === filterType;
      return matchSearch && matchType;
    });
  }, [mouvements, search, filterType]);

  const produitLots = useMemo(() => {
    if (!produitId) return [];
    // Tri FEFO : premier expiré, premier sorti
    return lots
      .filter((l) => l.produit_id === produitId && l.quantite > 0)
      .sort((a, b) => (a.date_peremption || '9999').localeCompare(b.date_peremption || '9999'));
  }, [produitId, lots]);

  const lotChoisi = produitLots.find((l) => l.id === lotId) || null;

  const openAdd = () => {
    setProduitId(produits[0]?.id || '');
    setType('entree');
    setQuantite('1');
    setMotif('');
    setFournisseur('');
    setDestinataire('');
    setReference('');
    setEntrepotId(entrepots[0]?.id || '');
    setLotId('');
    setPrixUnitaire('0');
    setModalOpen(true);
  };

  const save = async () => {
    if (!produitId) {
      showToast('Veuillez sélectionner un produit', 'error');
      return;
    }
    const qte = parseInt(quantite);
    if (!qte || qte <= 0) {
      showToast('La quantité doit être positive', 'error');
      return;
    }
    const produit = produits.find((p) => p.id === produitId);
    if (type === 'sortie' && produit && qte > produit.quantite) {
      showToast('Stock insuffisant pour cette sortie', 'error');
      return;
    }
    if (lotChoisi && type === 'sortie' && qte > lotChoisi.quantite) {
      showToast(`Le lot ${lotChoisi.numero_lot} ne contient que ${lotChoisi.quantite} unité(s)`, 'error');
      return;
    }
    setSaving(true);
    const payload = {
      produit_id: produitId,
      type,
      quantite: qte,
      motif: motif.trim() || null,
      fournisseur: type === 'entree' ? fournisseur.trim() || null : null,
      destinataire: type === 'sortie' ? destinataire.trim() || null : null,
      reference: reference.trim() || null,
      entrepot_id: entrepotId || null,
      lot_id: lotId || null,
      prix_unitaire: type === 'entree' ? (parseFloat(prixUnitaire) || 0) : 0,
    };
    const result = await writeRow('mouvements', 'insert', payload);
    setSaving(false);
    if (result.offline) {
      showToast('Mouvement enregistré localement, sera synchronisé', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast(type === 'entree' ? 'Entrée de stock enregistrée' : 'Sortie de stock enregistrée');
    }
    setModalOpen(false);
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('mouvements', 'delete', {}, deleteTarget.id);
    if (result.offline) {
      showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast('Mouvement supprimé, stock ajusté');
    }
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Mouvements de stock</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Historique des entrées et sorties</p>
        </div>
        {canCreate && (
        <button
          onClick={openAdd}
          disabled={produits.length === 0}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <Plus className="w-5 h-5" />
          Nouveau mouvement
        </button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
              <ArrowDownCircle className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total entrées</p>
              <p className="text-xl font-bold text-slate-900">
                {formatNumber(mouvements.filter((m) => m.type === 'entree').reduce((s, m) => s + m.quantite, 0))}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center">
              <ArrowUpCircle className="w-5 h-5 text-red-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total sorties</p>
              <p className="text-xl font-bold text-slate-900">
                {formatNumber(mouvements.filter((m) => m.type === 'sortie').reduce((s, m) => s + m.quantite, 0))}
              </p>
            </div>
          </div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
              <ArrowLeftRight className="w-5 h-5 text-sky-600" />
            </div>
            <div>
              <p className="text-sm text-slate-500">Total mouvements</p>
              <p className="text-xl font-bold text-slate-900">{formatNumber(mouvements.length)}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par produit, motif, référence..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
          />
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setFilterType('all')}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              filterType === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilterType('entree')}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              filterType === 'entree' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Entrées
          </button>
          <button
            onClick={() => setFilterType('sortie')}
            className={`px-4 py-2.5 rounded-xl text-sm font-medium transition-colors ${
              filterType === 'sortie' ? 'bg-red-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Sorties
          </button>
        </div>
      </div>

      {/* Table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-14 bg-slate-100 rounded-lg animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ArrowLeftRight className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Aucun mouvement trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 font-semibold text-slate-600">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Produit</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Quantité</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Motif</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden lg:table-cell">Détails</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Date</th>
                  <th className="text-right px-6 py-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((m) => (
                  <tr key={m.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-6 py-3">
                      {m.type === 'entree' ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700">
                          <ArrowDownCircle className="w-3.5 h-3.5" /> Entrée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-red-50 text-red-700">
                          <ArrowUpCircle className="w-3.5 h-3.5" /> Sortie
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <p className="font-medium text-slate-900">{m.produits?.nom || 'Produit supprimé'}</p>
                      {m.produits?.sku && (
                        <p className="text-xs text-slate-400 font-mono">{m.produits.sku}</p>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <span className={`font-semibold ${m.type === 'entree' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {m.type === 'entree' ? '+' : '−'}{formatNumber(m.quantite)}
                      </span>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell text-slate-600">
                      {m.motif || '—'}
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell text-slate-500 text-xs">
                      {m.type === 'entree' && m.fournisseur && `Fournisseur: ${m.fournisseur}`}
                      {m.type === 'sortie' && m.destinataire && `Destinataire: ${m.destinataire}`}
                      {m.reference && <div className="text-slate-400">Réf: {m.reference}</div>}
                      {!m.fournisseur && !m.destinataire && !m.reference && '—'}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-slate-500 text-xs whitespace-nowrap">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="px-6 py-3 text-right">
                      {canDelete && <button
                        onClick={() => setDeleteTarget(m)}
                        className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors ml-auto"
                        title="Supprimer (le stock sera ajusté)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Nouveau mouvement de stock"
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => setType('entree')}
              className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                type === 'entree'
                  ? 'bg-emerald-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Entrée de stock
            </button>
            <button
              onClick={() => setType('sortie')}
              className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${
                type === 'sortie'
                  ? 'bg-red-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Sortie de stock
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Produit *</label>
            <select
              value={produitId}
              onChange={(e) => setProduitId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
            >
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} (Stock: {p.quantite} {p.unite})
                </option>
              ))}
            </select>
            {entrepotId && produitId && (
              <p className="text-xs text-slate-400 mt-1">
                Stock sur le site sélectionné : {stocksEntrepot.find((s) => s.produit_id === produitId && s.entrepot_id === entrepotId)?.quantite ?? 0}
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantité *</label>
              <input
                type="number"
                value={quantite}
                onChange={(e) => setQuantite(e.target.value)}
                min="1"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Site / Entrepôt</label>
              <select
                value={entrepotId}
                onChange={(e) => setEntrepotId(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="">Sans site (stock global)</option>
                {entrepots.map((e) => (
                  <option key={e.id} value={e.id}>{e.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Motif</label>
              <input
                type="text"
                value={motif}
                onChange={(e) => setMotif(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder={type === 'entree' ? 'Réapprovisionnement...' : 'Vente, perte...'}
              />
            </div>
            {type === 'entree' ? (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Fournisseur</label>
                <input
                  type="text"
                  value={fournisseur}
                  onChange={(e) => setFournisseur(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Nom du fournisseur"
                />
              </div>
            ) : (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Destinataire</label>
                <input
                  type="text"
                  value={destinataire}
                  onChange={(e) => setDestinataire(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                  placeholder="Client, service..."
                />
              </div>
            )}
            {type === 'entree' && (
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Prix d'achat unitaire (alimente le CMUP)</label>
                <input
                  type="number"
                  step="0.01"
                  value={prixUnitaire}
                  onChange={(e) => setPrixUnitaire(e.target.value)}
                  min="0"
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Référence</label>
              <input
                type="text"
                value={reference}
                onChange={(e) => setReference(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="N° bon, facture..."
              />
            </div>
            {produitLots.length > 0 && (
              <div className="sm:col-span-2">
                <label className="block text-sm font-medium text-slate-700 mb-1 flex items-center gap-2">
                  <Zap className="w-4 h-4 text-sky-600" />
                  {type === 'sortie' ? 'Lot à sortir (FEFO — premier expiré en premier)' : 'Lot concerné'}
                </label>
                <select
                  value={lotId}
                  onChange={(e) => setLotId(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
                >
                  <option value="">Aucun lot spécifique</option>
                  {produitLots.map((l, i) => (
                    <option key={l.id} value={l.id}>
                      {l.numero_lot}
                      {l.date_peremption ? ` — exp. ${l.date_peremption}` : ''} ({l.quantite} dispo){i === 0 && type === 'sortie' ? ' ← FEFO' : ''}
                    </option>
                  ))}
                </select>
                {lotChoisi?.date_peremption && (
                  <p className="text-xs text-slate-400 mt-1">Péremption dans {daysUntil(lotChoisi.date_peremption)} jour(s)</p>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              onClick={() => setModalOpen(false)}
              className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
            >
              Annuler
            </button>
            <button
              onClick={save}
              disabled={saving}
              className={`px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-colors shadow-sm disabled:opacity-50 ${
                type === 'entree' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
              }`}
            >
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer le mouvement"
        message="La suppression de ce mouvement ajustera automatiquement le stock du produit correspondant."
        confirmLabel="Supprimer"
      />
    </div>
  );
}
