import { useState, useMemo } from 'react';
import { Plus, Search, ArrowDownCircle, ArrowUpCircle, Trash2, ArrowLeftRight, Zap } from 'lucide-react';
import type { MouvementWithProduit, ProduitWithCategorie, Entrepot, Lot, StockEntrepot } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, daysUntil } from '@/lib/format';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Card, InfoBox } from '@/components/adminlte';

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

  const totalEntrees = useMemo(() => {
    return mouvements.filter((m) => m.type === 'entree').reduce((s, m) => s + m.quantite, 0);
  }, [mouvements]);

  const totalSorties = useMemo(() => {
    return mouvements.filter((m) => m.type === 'sortie').reduce((s, m) => s + m.quantite, 0);
  }, [mouvements]);

  return (
    <div className="space-y-5">
      {/* Metric Info-Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InfoBox
          title="Total Entrées de Stock"
          value={`+${formatNumber(totalEntrees)}`}
          variant="success"
          icon={ArrowDownCircle}
          description="Approvisionnements & retours"
        />
        <InfoBox
          title="Total Sorties de Stock"
          value={`-${formatNumber(totalSorties)}`}
          variant="danger"
          icon={ArrowUpCircle}
          description="Ventes & transferts déstockés"
        />
        <InfoBox
          title="Total Flux Journalisés"
          value={formatNumber(mouvements.length)}
          variant="info"
          icon={ArrowLeftRight}
          description="Traçabilité complète des mouvements"
        />
      </div>

      {/* AdminLTE Card for Movements */}
      <Card
        title="Journal des Mouvements de Stock"
        variant="primary"
        outline={true}
        collapsible={true}
        maximizable={true}
        tools={
          canCreate ? (
            <button
              onClick={openAdd}
              disabled={produits.length === 0}
              className="btn-lte btn-lte-sm btn-lte-primary disabled:opacity-50"
            >
              <Plus className="w-3.5 h-3.5" /> Nouveau mouvement
            </button>
          ) : undefined
        }
      >
        {/* Filters Toolbar */}
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par produit, motif, référence..."
              className="form-control-lte pl-9"
            />
          </div>
          <div className="flex gap-1.5">
            <button
              onClick={() => setFilterType('all')}
              className={`btn-lte btn-lte-sm ${
                filterType === 'all'
                  ? 'btn-lte-primary'
                  : 'btn-lte-outline-secondary'
              }`}
            >
              Tous
            </button>
            <button
              onClick={() => setFilterType('entree')}
              className={`btn-lte btn-lte-sm ${
                filterType === 'entree'
                  ? 'btn-lte-success'
                  : 'btn-lte-outline-secondary'
              }`}
            >
              Entrées (+)
            </button>
            <button
              onClick={() => setFilterType('sortie')}
              className={`btn-lte btn-lte-sm ${
                filterType === 'sortie'
                  ? 'btn-lte-danger'
                  : 'btn-lte-outline-secondary'
              }`}
            >
              Sorties (−)
            </button>
          </div>
        </div>

        {/* Table Content */}
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <ArrowLeftRight className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>Aucun mouvement trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 -mb-4 sm:-mb-5">
            <table className="table-adminlte">
              <thead>
                <tr>
                  <th className="text-left">Type</th>
                  <th className="text-left">Produit</th>
                  <th className="text-right">Quantité</th>
                  <th className="text-left hidden md:table-cell">Motif</th>
                  <th className="text-left hidden lg:table-cell">Détails</th>
                  <th className="text-left hidden sm:table-cell">Date</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((m) => (
                  <tr key={m.id}>
                    <td>
                      {m.type === 'entree' ? (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-green-100 text-[#198754] dark:bg-green-900/40 dark:text-green-300">
                          <ArrowDownCircle className="w-3.5 h-3.5" /> Entrée
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-xs font-semibold bg-red-100 text-[#dc3545] dark:bg-red-900/40 dark:text-red-300">
                          <ArrowUpCircle className="w-3.5 h-3.5" /> Sortie
                        </span>
                      )}
                    </td>
                    <td>
                      <p className="font-semibold text-gray-900 dark:text-white leading-tight">
                        {m.produits?.nom || 'Produit supprimé'}
                      </p>
                      {m.produits?.sku && (
                        <p className="text-xs text-gray-400 font-mono">{m.produits.sku}</p>
                      )}
                    </td>
                    <td className="text-right">
                      <span className={`font-bold ${m.type === 'entree' ? 'text-[#198754]' : 'text-[#dc3545]'}`}>
                        {m.type === 'entree' ? '+' : '−'}{formatNumber(m.quantite)}
                      </span>
                    </td>
                    <td className="hidden md:table-cell text-gray-600 dark:text-gray-300 text-xs">
                      {m.motif || '—'}
                    </td>
                    <td className="hidden lg:table-cell text-gray-500 text-xs">
                      {m.type === 'entree' && m.fournisseur && `Fournisseur: ${m.fournisseur}`}
                      {m.type === 'sortie' && m.destinataire && `Destinataire: ${m.destinataire}`}
                      {m.reference && <div className="text-gray-400">Réf: {m.reference}</div>}
                      {!m.fournisseur && !m.destinataire && !m.reference && '—'}
                    </td>
                    <td className="hidden sm:table-cell text-gray-500 text-xs whitespace-nowrap">
                      {formatDate(m.created_at)}
                    </td>
                    <td className="text-right">
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(m)}
                          className="btn-lte btn-lte-sm btn-lte-danger ml-auto"
                          title="Supprimer (le stock sera ajusté)"
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
