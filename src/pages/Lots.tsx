import { useState, useMemo } from 'react';
import {
  Boxes,
  Plus,
  Search,
  AlertTriangle,
  Clock,
  ShieldAlert,
  ShieldCheck,
  CheckCircle2,
  Calendar,
  Layers,
  Sparkles,
  Zap,
  Filter,
  Eye,
  Edit2,
  Trash2,
  AlertOctagon,
  ArrowRight,
  TrendingDown,
} from 'lucide-react';
import type { LotWithProduit, ProduitWithCategorie, Entrepot, LotStatut } from '@/lib/supabase';
import { Card, InfoBox, SmallBox, Callout } from '@/components/adminlte';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, formatCurrency } from '@/lib/format';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { getDluoStatut, calculerSortieFEFO, type FEFOAllocation } from '@/lib/stockAdvanced';

type Props = {
  lots: LotWithProduit[];
  produits: ProduitWithCategorie[];
  entrepots: Entrepot[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
  selectedSiteId?: string;
};

type LotForm = {
  produit_id: string;
  numero_lot: string;
  numero_serie: string;
  date_peremption: string;
  date_fabrication: string;
  quantite: string;
  prix_unitaire: string;
  entrepot_id: string;
  statut: LotStatut;
  fabricant: string;
  notes: string;
};

const emptyForm: LotForm = {
  produit_id: '',
  numero_lot: '',
  numero_serie: '',
  date_peremption: '',
  date_fabrication: '',
  quantite: '1',
  prix_unitaire: '0',
  entrepot_id: '',
  statut: 'actif',
  fabricant: '',
  notes: '',
};

export function Lots({
  lots,
  produits,
  entrepots,
  loading,
  onRefresh,
  role,
  selectedSiteId = 'all',
}: Props) {
  const canManage = can(role, 'produits', 'edit') || role === 'admin' || role === 'gerant';
  const [search, setSearch] = useState('');
  const [filterSite, setFilterSite] = useState<string>(selectedSiteId);
  const [filterStatutDluo, setFilterStatutDluo] = useState<string>('all');
  const [filterStatutLot, setFilterStatutLot] = useState<string>('all');

  // Modals
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<LotWithProduit | null>(null);
  const [form, setForm] = useState<LotForm>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LotWithProduit | null>(null);

  // Simulateur FEFO
  const [simulatorOpen, setSimulatorOpen] = useState(false);
  const [simProduitId, setSimProduitId] = useState<string>('');
  const [simQuantite, setSimQuantite] = useState<string>('10');
  const [simResult, setSimResult] = useState<{
    allocations: FEFOAllocation[];
    quantiteRestanteNonAllouee: number;
    estTotalementSatisfait: boolean;
  } | null>(null);

  // Filtrage des lots
  const filteredLots = useMemo(() => {
    return lots.filter((lot) => {
      // Filtre site
      if (filterSite !== 'all' && lot.entrepot_id !== filterSite) return false;

      // Filtre statut lot
      const statutLot = lot.statut || 'actif';
      if (filterStatutLot !== 'all' && statutLot !== filterStatutLot) return false;

      // Filtre DLUO
      const dluo = getDluoStatut(lot.date_peremption);
      if (filterStatutDluo !== 'all' && dluo.statut !== filterStatutDluo) return false;

      // Recherche texte
      const q = search.toLowerCase();
      if (!q) return true;
      const matchLot = lot.numero_lot.toLowerCase().includes(q);
      const matchSerie = (lot.numero_serie || '').toLowerCase().includes(q);
      const matchProd = (lot.produits?.nom || '').toLowerCase().includes(q);
      const matchFab = (lot.fabricant || '').toLowerCase().includes(q);
      return matchLot || matchSerie || matchProd || matchFab;
    });
  }, [lots, filterSite, filterStatutLot, filterStatutDluo, search]);

  // Statistiques DLUO & Lots
  const stats = useMemo(() => {
    let totalQte = 0;
    let alerteJ30 = 0;
    let critiqueJ7 = 0;
    let perimes = 0;
    let quarantaine = 0;

    lots.forEach((lot) => {
      totalQte += lot.quantite;
      if (lot.statut === 'quarantaine') {
        quarantaine++;
      }
      const dluo = getDluoStatut(lot.date_peremption);
      if (dluo.statut === 'perime') perimes++;
      else if (dluo.statut === 'critique_j7') critiqueJ7++;
      else if (dluo.statut === 'alerte_j30') alerteJ30++;
    });

    return { totalLots: lots.length, totalQte, alerteJ30, critiqueJ7, perimes, quarantaine };
  }, [lots]);

  const openAdd = () => {
    setEditingLot(null);
    const dateToday = new Date().toISOString().slice(0, 10);
    const numAuto = `LOT-${new Date().getFullYear()}-${Math.floor(Math.random() * 9000 + 1000)}`;
    setForm({
      ...emptyForm,
      produit_id: produits[0]?.id || '',
      entrepot_id: entrepots[0]?.id || '',
      numero_lot: numAuto,
      date_fabrication: dateToday,
    });
    setModalOpen(true);
  };

  const openEdit = (l: LotWithProduit) => {
    setEditingLot(l);
    setForm({
      produit_id: l.produit_id,
      numero_lot: l.numero_lot,
      numero_serie: l.numero_serie || '',
      date_peremption: l.date_peremption || '',
      date_fabrication: l.date_fabrication || '',
      quantite: String(l.quantite),
      prix_unitaire: String(l.prix_unitaire || 0),
      entrepot_id: l.entrepot_id || '',
      statut: l.statut || 'actif',
      fabricant: l.fabricant || '',
      notes: l.notes || '',
    });
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!form.produit_id) {
      showToast('Veuillez sélectionner un produit', 'error');
      return;
    }
    if (!form.numero_lot.trim()) {
      showToast('Le numéro de lot est obligatoire', 'error');
      return;
    }

    setSaving(true);
    const payload = {
      produit_id: form.produit_id,
      numero_lot: form.numero_lot.trim(),
      numero_serie: form.numero_serie.trim() || null,
      date_peremption: form.date_peremption || null,
      date_fabrication: form.date_fabrication || null,
      quantite: parseInt(form.quantite) || 0,
      prix_unitaire: parseFloat(form.prix_unitaire) || 0,
      entrepot_id: form.entrepot_id || null,
      statut: form.statut,
      fabricant: form.fabricant.trim() || null,
      notes: form.notes.trim() || null,
    };

    const res = editingLot
      ? await writeRow('lots', 'update', payload, editingLot.id)
      : await writeRow('lots', 'insert', payload);

    setSaving(false);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast(editingLot ? 'Lot mis à jour avec succès' : 'Nouveau lot enregistré avec succès');
    setModalOpen(false);
    onRefresh();
  };

  const toggleQuarantaine = async (lot: LotWithProduit) => {
    const nouveauStatut = lot.statut === 'quarantaine' ? 'actif' : 'quarantaine';
    const res = await writeRow('lots', 'update', { statut: nouveauStatut }, lot.id);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }
    showToast(
      nouveauStatut === 'quarantaine'
        ? `Lot ${lot.numero_lot} placé en quarantaine (bloqué à la vente)`
        : `Lot ${lot.numero_lot} réactivé pour la vente`,
      nouveauStatut === 'quarantaine' ? 'info' : 'info'
    );
    onRefresh();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const res = await writeRow('lots', 'delete', {}, deleteTarget.id);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }
    showToast('Lot supprimé');
    setDeleteTarget(null);
    onRefresh();
  };

  const handleSimulateFEFO = () => {
    if (!simProduitId) {
      showToast('Sélectionnez un produit à simuler', 'error');
      return;
    }
    const qte = parseInt(simQuantite) || 0;
    if (qte <= 0) {
      showToast('Quantité invalide', 'error');
      return;
    }

    const res = calculerSortieFEFO(lots, simProduitId, qte, filterSite !== 'all' ? filterSite : null);
    setSimResult(res);
  };

  return (
    <div className="space-y-6">
      {/* 1. Page Header AdminLTE v4 */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Boxes className="w-7 h-7 text-sky-600 dark:text-sky-400" />
            Traçabilité des Lots & Péremptions (FEFO)
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gestion fine des DLUO, numéros de série et règles de déstockage prioritaire First Expired, First Out
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setSimProduitId(produits[0]?.id || '');
              setSimQuantite('10');
              setSimResult(null);
              setSimulatorOpen(true);
            }}
            className="btn-lte btn-lte-outline flex items-center gap-1.5"
          >
            <Zap className="w-4 h-4 text-amber-500" />
            Simulateur FEFO
          </button>
          {canManage && (
            <button
              onClick={openAdd}
              className="btn-lte btn-lte-primary flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nouveau Lot
            </button>
          )}
        </div>
      </div>

      {/* 2. Info Boxes de Santé des Stocks */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <InfoBox
          title="Total des Lots"
          value={stats.totalLots}
          icon={Layers}
          color="info"
          subText={`${formatNumber(stats.totalQte)} unités tracées`}
        />
        <InfoBox
          title="Alerte DLUO J-30"
          value={stats.alerteJ30}
          icon={Clock}
          color="warning"
          subText="À écouler en priorité"
        />
        <InfoBox
          title="Critique DLUO J-7"
          value={stats.critiqueJ7}
          icon={AlertTriangle}
          color="danger"
          subText="Péril imminent"
        />
        <InfoBox
          title="Lots Périmés"
          value={stats.perimes}
          icon={ShieldAlert}
          color="danger"
          subText="Retrait immédiat"
        />
        <InfoBox
          title="En Quarantaine"
          value={stats.quarantaine}
          icon={AlertOctagon}
          color="secondary"
          subText="Bloqués à la vente"
        />
      </div>

      {/* 3. Filtres & Outils de Recherche */}
      <Card noPadding>
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3 bg-slate-50/50 dark:bg-slate-800/30">
          <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[280px]">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher par lot, série, produit, fabricant..."
                className="form-control-lte pl-9 w-full text-xs"
              />
            </div>

            {/* Filtre Site */}
            <select
              value={filterSite}
              onChange={(e) => setFilterSite(e.target.value)}
              className="form-control-lte text-xs w-auto min-w-[150px]"
            >
              <option value="all">Tous les sites / dépôts</option>
              {entrepots.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nom}
                </option>
              ))}
            </select>

            {/* Filtre DLUO */}
            <select
              value={filterStatutDluo}
              onChange={(e) => setFilterStatutDluo(e.target.value)}
              className="form-control-lte text-xs w-auto min-w-[150px]"
            >
              <option value="all">Toutes les DLUO</option>
              <option value="critique_j7">⚠️ Urgence Critique (≤ 7j)</option>
              <option value="alerte_j30">⏰ Alerte Péremption (≤ 30j)</option>
              <option value="perime">⛔ Produits Périmés</option>
              <option value="conforme">✅ Conformes</option>
              <option value="sans_dluo">⚪ Sans DLUO</option>
            </select>

            {/* Filtre Statut Lot */}
            <select
              value={filterStatutLot}
              onChange={(e) => setFilterStatutLot(e.target.value)}
              className="form-control-lte text-xs w-auto min-w-[130px]"
            >
              <option value="all">Tous les statuts</option>
              <option value="actif">Actif (en vente)</option>
              <option value="quarantaine">En Quarantaine</option>
              <option value="rejete">Rejeté / Avarié</option>
              <option value="epuise">Épuisé (qte = 0)</option>
            </select>
          </div>

          <div className="text-xs text-slate-500 font-medium">
            {filteredLots.length} lot(s) affiché(s)
          </div>
        </div>

        {/* 4. Tableau des Lots */}
        <div className="overflow-x-auto">
          <table className="table-adminlte text-xs">
            <thead>
              <tr>
                <th>Produit / Article</th>
                <th>N° de Lot & Série</th>
                <th>Site d'affectation</th>
                <th>Date Péremption (DLUO)</th>
                <th>Fabricant</th>
                <th className="text-right">Stock Actuel</th>
                <th className="text-right">Prix Entrée FIFO</th>
                <th className="text-center">Statut Lot</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredLots.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12 text-center text-slate-400">
                    <Boxes className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    Aucun lot correspondant aux critères de recherche.
                  </td>
                </tr>
              ) : (
                filteredLots.map((lot) => {
                  const dluo = getDluoStatut(lot.date_peremption);
                  const depot = entrepots.find((e) => e.id === lot.entrepot_id);
                  const isQuarantaine = lot.statut === 'quarantaine';

                  return (
                    <tr
                      key={lot.id}
                      className={
                        dluo.statut === 'perime'
                          ? 'bg-red-500/5 hover:bg-red-500/10'
                          : isQuarantaine
                          ? 'bg-amber-500/5 hover:bg-amber-500/10'
                          : ''
                      }
                    >
                      <td className="font-semibold text-slate-900 dark:text-slate-100">
                        <div className="flex flex-col">
                          <span>{lot.produits?.nom || 'Article supprimé'}</span>
                          <span className="text-[11px] font-mono text-slate-400">
                            {lot.produits?.sku || 'Sans SKU'}
                          </span>
                        </div>
                      </td>

                      <td>
                        <div className="flex flex-col">
                          <span className="font-mono font-bold text-sky-600 dark:text-sky-400">
                            {lot.numero_lot}
                          </span>
                          {lot.numero_serie && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              S/N : {lot.numero_serie}
                            </span>
                          )}
                        </div>
                      </td>

                      <td>
                        <span className="inline-flex items-center gap-1 text-slate-600 dark:text-slate-300">
                          {depot?.nom || 'Stock Central'}
                        </span>
                      </td>

                      <td>
                        <div className="flex flex-col gap-1 items-start">
                          <span className="font-medium text-slate-700 dark:text-slate-200">
                            {lot.date_peremption ? formatDate(lot.date_peremption) : '—'}
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold ${dluo.badgeClass}`}
                          >
                            {dluo.badgeLabel}
                          </span>
                        </div>
                      </td>

                      <td className="text-slate-600 dark:text-slate-300">
                        {lot.fabricant || '—'}
                      </td>

                      <td className="text-right">
                        <span
                          className={`font-bold font-mono text-sm ${
                            lot.quantite === 0
                              ? 'text-slate-400'
                              : lot.quantite <= 5
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        >
                          {formatNumber(lot.quantite)} {lot.produits?.unite || 'pcs'}
                        </span>
                      </td>

                      <td className="text-right font-mono font-semibold text-slate-600 dark:text-slate-300">
                        {formatCurrency(lot.prix_unitaire || 0)}
                      </td>

                      <td className="text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                            isQuarantaine
                              ? 'bg-amber-500/20 text-amber-500 border border-amber-500/30'
                              : lot.statut === 'rejete'
                              ? 'bg-red-500/20 text-red-500 border border-red-500/30'
                              : lot.quantite === 0
                              ? 'bg-slate-500/20 text-slate-400'
                              : 'bg-emerald-500/20 text-emerald-500 border border-emerald-500/30'
                          }`}
                        >
                          {lot.statut || 'actif'}
                        </span>
                      </td>

                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => toggleQuarantaine(lot)}
                            className={`p-1.5 rounded transition-colors ${
                              isQuarantaine
                                ? 'text-emerald-500 hover:bg-emerald-500/10'
                                : 'text-amber-500 hover:bg-amber-500/10'
                            }`}
                            title={
                              isQuarantaine
                                ? 'Lever la quarantaine et autoriser la vente'
                                : 'Placer en quarantaine (bloquer à la vente)'
                            }
                          >
                            {isQuarantaine ? (
                              <ShieldCheck className="w-4 h-4" />
                            ) : (
                              <ShieldAlert className="w-4 h-4" />
                            )}
                          </button>

                          {canManage && (
                            <>
                              <button
                                onClick={() => openEdit(lot)}
                                className="p-1.5 rounded text-slate-400 hover:text-sky-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                title="Modifier le lot"
                              >
                                <Edit2 className="w-4 h-4" />
                              </button>
                              <button
                                onClick={() => setDeleteTarget(lot)}
                                className="p-1.5 rounded text-slate-400 hover:text-red-500 hover:bg-red-500/10 transition-colors"
                                title="Supprimer le lot"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 5. Modal Création / Modification de Lot */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingLot ? `Modifier le lot ${editingLot.numero_lot}` : 'Création d\'un Nouveau Lot & DLUO'}
        size="lg"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label-lte">
                Article / Produit <span className="text-red-500">*</span>
              </label>
              <select
                value={form.produit_id}
                onChange={(e) => setForm({ ...form, produit_id: e.target.value })}
                className="form-select-lte text-xs"
                required
              >
                <option value="">Sélectionnez un produit</option>
                {produits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} {p.sku ? `(${p.sku})` : ''} — Stock: {p.quantite}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="form-label-lte">
                Site / Dépôt de Stockage
              </label>
              <select
                value={form.entrepot_id}
                onChange={(e) => setForm({ ...form, entrepot_id: e.target.value })}
                className="form-select-lte text-xs"
              >
                <option value="">Dépôt Central / Aucun</option>
                {entrepots.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nom}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label-lte">
                Numéro de Lot <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                required
                value={form.numero_lot}
                onChange={(e) => setForm({ ...form, numero_lot: e.target.value })}
                placeholder="Ex: LOT-2026-0048"
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="form-label-lte">
                Numéro de Série (Optionnel)
              </label>
              <input
                type="text"
                value={form.numero_serie}
                onChange={(e) => setForm({ ...form, numero_serie: e.target.value })}
                placeholder="Ex: SN-984729103"
                className="form-control-lte text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label-lte">
                Date de Fabrication
              </label>
              <input
                type="date"
                value={form.date_fabrication}
                onChange={(e) => setForm({ ...form, date_fabrication: e.target.value })}
                className="form-control-lte text-xs"
              />
            </div>

            <div>
              <label className="form-label-lte flex items-center justify-between">
                <span>Date de Péremption (DLUO)</span>
                <span className="text-[10px] text-brand-blue font-normal">Déstockage FEFO</span>
              </label>
              <input
                type="date"
                value={form.date_peremption}
                onChange={(e) => setForm({ ...form, date_peremption: e.target.value })}
                className="form-control-lte text-xs font-semibold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="form-label-lte">
                Quantité en Stock
              </label>
              <input
                type="number"
                min="0"
                value={form.quantite}
                onChange={(e) => setForm({ ...form, quantite: e.target.value })}
                className="form-control-lte text-xs font-mono font-semibold"
              />
            </div>

            <div>
              <label className="form-label-lte">
                Prix Unitaire d'Entrée (FIFO)
              </label>
              <input
                type="number"
                min="0"
                value={form.prix_unitaire}
                onChange={(e) => setForm({ ...form, prix_unitaire: e.target.value })}
                className="form-control-lte text-xs font-mono"
              />
            </div>

            <div>
              <label className="form-label-lte">
                Statut du Lot
              </label>
              <select
                value={form.statut}
                onChange={(e) => setForm({ ...form, statut: e.target.value as LotStatut })}
                className="form-select-lte text-xs font-semibold"
              >
                <option value="actif">Actif (autorisé à la vente)</option>
                <option value="quarantaine">Quarantaine (bloqué)</option>
                <option value="rejete">Rejeté / Avarié</option>
                <option value="epuise">Épuisé</option>
              </select>
            </div>
          </div>

          <div>
            <label className="form-label-lte">
              Fabricant / Laboratoire / Origine
            </label>
            <input
              type="text"
              value={form.fabricant}
              onChange={(e) => setForm({ ...form, fabricant: e.target.value })}
              placeholder="Ex: Laboratoires UEMOA / Usine Bobo"
              className="form-control-lte text-xs"
            />
          </div>

          <div>
            <label className="form-label-lte">
              Notes & Remarques
            </label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="Instructions de conservation, température requise, certification..."
              className="form-control-lte text-xs resize-none"
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
              className="btn-lte btn-lte-sm btn-lte-primary flex items-center gap-2 disabled:opacity-50"
            >
              {saving && <span className="animate-spin">⏳</span>}
              {editingLot ? 'Enregistrer les modifications' : 'Créer le lot'}
            </button>
          </div>
        </form>
      </Modal>

      {/* 6. Simulateur FEFO Interactif */}
      <Modal
        isOpen={simulatorOpen}
        onClose={() => setSimulatorOpen(false)}
        title="Simulateur d'Algorithme FEFO (First Expired, First Out)"
        size="lg"
      >
        <div className="space-y-4">
          <Callout type="info" title="Principe de fonctionnement FEFO">
            Lorsqu'une commande client ou une vente en caisse est validée, l'algorithme FEFO alloue en
            priorité les lots dont la <strong>Date Limite d'Utilisation Optimale (DLUO)</strong> est la
            plus proche afin de minimiser les pertes par péremption.
          </Callout>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Article périssable à déstocker
              </label>
              <select
                value={simProduitId}
                onChange={(e) => setSimProduitId(e.target.value)}
                className="form-control-lte text-xs"
              >
                {produits.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nom} (Stock global: {p.quantite})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                Quantité demandée
              </label>
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  value={simQuantite}
                  onChange={(e) => setSimQuantite(e.target.value)}
                  className="form-control-lte text-xs font-mono font-bold"
                />
                <button
                  type="button"
                  onClick={handleSimulateFEFO}
                  className="btn-lte btn-lte-primary flex items-center gap-1.5 flex-shrink-0"
                >
                  <Zap className="w-4 h-4 text-amber-300" />
                  Calculer
                </button>
              </div>
            </div>
          </div>

          {simResult && (
            <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold text-slate-800 dark:text-slate-200">
                  Résultat de l'allocation FEFO :
                </span>
                <span
                  className={`px-2.5 py-0.5 rounded text-xs font-bold ${
                    simResult.estTotalementSatisfait
                      ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30'
                      : 'bg-amber-500/15 text-amber-500 border border-amber-500/30'
                  }`}
                >
                  {simResult.estTotalementSatisfait
                    ? 'Quantité totale disponible couverte'
                    : `Manque ${simResult.quantiteRestanteNonAllouee} unité(s) en stock actif`}
                </span>
              </div>

              {simResult.allocations.length === 0 ? (
                <div className="p-4 rounded-xl bg-slate-100 dark:bg-slate-800/50 text-center text-slate-400 text-xs">
                  Aucun lot actif disponible pour ce produit sur le dépôt sélectionné.
                </div>
              ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                  <table className="table-adminlte text-xs">
                    <thead>
                      <tr>
                        <th>Ordre FEFO</th>
                        <th>N° Lot</th>
                        <th>DLUO</th>
                        <th>Statut DLUO</th>
                        <th className="text-right">Stock du Lot</th>
                        <th className="text-right">Quantité à Sortir</th>
                      </tr>
                    </thead>
                    <tbody>
                      {simResult.allocations.map((alloc, idx) => (
                        <tr key={alloc.lot.id}>
                          <td className="font-bold text-sky-500">#{idx + 1}</td>
                          <td className="font-mono font-semibold">{alloc.lot.numero_lot}</td>
                          <td>
                            {alloc.lot.date_peremption
                              ? formatDate(alloc.lot.date_peremption)
                              : 'Sans DLUO'}
                          </td>
                          <td>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                alloc.statutDluo === 'perime'
                                  ? 'bg-red-500/20 text-red-500'
                                  : alloc.statutDluo === 'critique_j7'
                                  ? 'bg-amber-500/20 text-amber-500'
                                  : 'bg-emerald-500/20 text-emerald-500'
                              }`}
                            >
                              {alloc.statutDluo} ({alloc.joursRestants}j)
                            </span>
                          </td>
                          <td className="text-right font-mono">{alloc.lot.quantite}</td>
                          <td className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            +{alloc.quantiteAllouee}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* 7. Dialog de confirmation de suppression */}
      <ConfirmDialog
        isOpen={!!deleteTarget}
        title="Supprimer ce lot ?"
        message={`Êtes-vous sûr de vouloir supprimer le lot ${deleteTarget?.numero_lot} ? Cette action est irréversible.`}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        variant="danger"
      />
    </div>
  );
}
