import { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Package,
  AlertTriangle,
  ArrowLeftRight,
  Barcode,
  Layers,
  Printer,
  Scale,
  Tag as TagIcon,
  Boxes as BoxesIcon,
  DollarSign,
} from 'lucide-react';
import type { ProduitWithCategorie, Categorie, Lot } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatCurrency, formatNumber } from '@/lib/format';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { canEditPrixAchat, can, type Role } from '@/lib/permissions';
import { LotManager } from '@/components/LotManager';
import { Barcode39 } from '@/components/Barcode39';
import { Card, InfoBox } from '@/components/adminlte';
import { PackagingUnitsModal, VariantsModal, BOMKitModal } from '@/components/ProductAdvancedModules';
import { calculerValorisationStock } from '@/lib/stockAdvanced';

type Props = {
  produits: ProduitWithCategorie[];
  categories: Categorie[];
  lots: Lot[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

type FormState = {
  nom: string;
  sku: string;
  description: string;
  categorie_id: string;
  quantite: string;
  seuil_alerte: string;
  prix_unitaire: string;
  prix_vente: string;
  unite: string;
  emplacement: string;
  code_barres: string;
  perissable: boolean;
  alerte_peremption_jours: string;
  methode_valorisation: 'cmup' | 'fifo';
  quantite_economique: string;
  type_produit: 'simple' | 'compose' | 'service' | 'variante_parent';
};

const emptyForm: FormState = {
  nom: '', sku: '', description: '', categorie_id: '', quantite: '0',
  seuil_alerte: '10', prix_unitaire: '0', prix_vente: '0', unite: 'pièce',
  emplacement: '', code_barres: '', perissable: false, alerte_peremption_jours: '30',
  methode_valorisation: 'cmup', quantite_economique: '0',
  type_produit: 'simple',
};

export function Produits({ produits, categories, lots, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'produits', 'create');
  const canEdit = can(role, 'produits', 'edit');
  const canDelete = can(role, 'produits', 'delete');
  const editPrixAchat = canEditPrixAchat(role);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState('all');
  const [filterStatus, setFilterStatus] = useState('all');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ProduitWithCategorie | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProduitWithCategorie | null>(null);
  const [moveTarget, setMoveTarget] = useState<ProduitWithCategorie | null>(null);
  const [lotsTarget, setLotsTarget] = useState<ProduitWithCategorie | null>(null);
  const [labelTarget, setLabelTarget] = useState<ProduitWithCategorie | null>(null);
  const [unitsTarget, setUnitsTarget] = useState<ProduitWithCategorie | null>(null);
  const [variantsTarget, setVariantsTarget] = useState<ProduitWithCategorie | null>(null);
  const [bomTarget, setBomTarget] = useState<ProduitWithCategorie | null>(null);

  const filtered = useMemo(() => {
    return produits.filter((p) => {
      const matchSearch =
        p.nom.toLowerCase().includes(search.toLowerCase()) ||
        (p.sku || '').toLowerCase().includes(search.toLowerCase());
      const matchCat = filterCat === 'all' || p.categorie_id === filterCat;
      const matchStatus =
        filterStatus === 'all' ||
        (filterStatus === 'alert' && p.quantite <= p.seuil_alerte) ||
        (filterStatus === 'ok' && p.quantite > p.seuil_alerte) ||
        (filterStatus === 'out' && p.quantite === 0);
      return matchSearch && matchCat && matchStatus;
    });
  }, [produits, search, filterCat, filterStatus]);

  const openAdd = () => {
    setEditing(null);
    setForm(emptyForm);
    setModalOpen(true);
  };

  const openEdit = (p: ProduitWithCategorie) => {
    setEditing(p);
    setForm({
      nom: p.nom,
      sku: p.sku || '',
      description: p.description || '',
      categorie_id: p.categorie_id || '',
      quantite: String(p.quantite),
      seuil_alerte: String(p.seuil_alerte),
      prix_unitaire: String(p.prix_unitaire),
      prix_vente: String(p.prix_vente),
      unite: p.unite,
      emplacement: p.emplacement || '',
      code_barres: p.code_barres || '',
      perissable: p.perissable,
      alerte_peremption_jours: String(p.alerte_peremption_jours),
      methode_valorisation: p.methode_valorisation,
      quantite_economique: String(p.quantite_economique),
      type_produit: p.type_produit || 'simple',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nom.trim()) {
      showToast('Le nom du produit est obligatoire', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      sku: form.sku.trim() || null,
      description: form.description.trim() || null,
      categorie_id: form.categorie_id || null,
      quantite: parseInt(form.quantite) || 0,
      seuil_alerte: parseInt(form.seuil_alerte) || 0,
      prix_vente: parseFloat(form.prix_vente) || 0,
      unite: form.unite.trim() || 'pièce',
      emplacement: form.emplacement.trim() || null,
      code_barres: form.code_barres.trim() || null,
      perissable: form.perissable,
      alerte_peremption_jours: parseInt(form.alerte_peremption_jours) || 30,
      methode_valorisation: form.methode_valorisation,
      quantite_economique: parseInt(form.quantite_economique) || 0,
      type_produit: form.type_produit,
    } as Record<string, unknown>;
    // Prix d'achat: champ sensible, réservé aux rôles autorisés
    if (editPrixAchat) {
      payload.prix_unitaire = parseFloat(form.prix_unitaire) || 0;
    }

    const result = editing
      ? await writeRow('produits', 'update', payload, editing.id)
      : await writeRow('produits', 'insert', payload);
    if (result.offline) {
      await applyLocalCache('produits', editing ? 'update' : 'insert', { ...payload, id: editing?.id, updated_at: new Date().toISOString() }, editing?.id);
      showToast(editing ? 'Modification enregistrée localement (hors-ligne)' : 'Produit enregistré localement (hors-ligne)', 'info');
    } else if (result.error) {
      setSaving(false);
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast(editing ? 'Produit modifié avec succès' : 'Produit ajouté avec succès');
    }
    setSaving(false);
    setModalOpen(false);
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('produits', 'delete', {}, deleteTarget.id);
    if (result.offline) {
      await applyLocalCache('produits', 'delete', {}, deleteTarget.id);
      showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast('Produit supprimé');
    }
    onRefresh();
  };

  const moveStock = async (type: 'entree' | 'sortie', quantite: number, motif: string) => {
    if (!moveTarget || quantite <= 0) return;
    if (type === 'sortie' && quantite > moveTarget.quantite) {
      showToast('Stock insuffisant pour cette sortie', 'error');
      return;
    }
    const result = await writeRow('mouvements', 'insert', {
      produit_id: moveTarget.id,
      type,
      quantite,
      motif: motif || null,
    });
    if (result.offline) {
      showToast('Mouvement enregistré localement, sera synchronisé', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast(type === 'entree' ? 'Entrée de stock enregistrée' : 'Sortie de stock enregistrée');
    }
    setMoveTarget(null);
    onRefresh();
  };

  const totalValeurVente = useMemo(() => {
    return produits.reduce((sum, p) => sum + p.prix_vente * p.quantite, 0);
  }, [produits]);

  const totalAlerteCount = useMemo(() => {
    return produits.filter((p) => p.quantite <= p.seuil_alerte).length;
  }, [produits]);

  const valorisationStock = useMemo(() => {
    return calculerValorisationStock(produits, lots, 'cmup');
  }, [produits, lots]);

  return (
    <div className="space-y-5">
      {/* AdminLTE v4 Metric Info-Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          title="Articles au Catalogue"
          value={formatNumber(produits.length)}
          variant="primary"
          icon={Package}
          description="Total références actives"
        />
        <InfoBox
          title="Valorisation Stock (CMUP)"
          value={formatCurrency(valorisationStock.valeurTotale)}
          variant="info"
          icon={DollarSign}
          description={`${formatNumber(valorisationStock.totalArticles)} unités valorisées`}
        />
        <InfoBox
          title="Potentiel Vente Public"
          value={formatCurrency(totalValeurVente)}
          variant="success"
          icon={Package}
          description="Chiffre d'affaires potentiel"
        />
        <InfoBox
          title="Articles en Alerte / Rupture"
          value={formatNumber(totalAlerteCount)}
          variant="warning"
          icon={AlertTriangle}
          description="Stocks à réapprovisionner"
        />
      </div>

      {/* AdminLTE v4 Card Outline for Products Table */}
      <Card
        title="Catalogue des Articles & Stocks"
        variant="primary"
        outline={true}
        collapsible={true}
        maximizable={true}
        tools={
          canCreate ? (
            <button
              onClick={openAdd}
              className="btn-lte btn-lte-sm btn-lte-primary"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Nouveau produit</span>
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
              placeholder="Rechercher par nom ou SKU..."
              className="form-control-lte pl-9"
            />
          </div>
          <select
            value={filterCat}
            onChange={(e) => setFilterCat(e.target.value)}
            className="form-control-lte sm:w-52"
          >
            <option value="all">Toutes catégories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>{c.nom}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="form-control-lte sm:w-44"
          >
            <option value="all">Tous statuts</option>
            <option value="ok">En stock</option>
            <option value="alert">Stock faible</option>
            <option value="out">Rupture</option>
          </select>
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
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>Aucun produit ne correspond aux critères</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 -mb-4 sm:-mb-5">
            <table className="table-adminlte">
              <thead>
                <tr>
                  <th className="text-left">Produit</th>
                  <th className="text-left hidden md:table-cell">Catégorie</th>
                  <th className="text-left hidden lg:table-cell">SKU</th>
                  <th className="text-left hidden xl:table-cell">Code-barres</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right hidden sm:table-cell">Prix vente</th>
                  <th className="text-center">Statut</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const isAlert = p.quantite <= p.seuil_alerte;
                  const isOut = p.quantite === 0;
                  return (
                    <tr key={p.id}>
                      <td>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-semibold text-gray-900 dark:text-white">{p.nom}</p>
                            {p.type_produit === 'compose' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-500/20 text-amber-500 border border-amber-500/30">
                                KIT / BOM
                              </span>
                            )}
                            {p.type_produit === 'variante_parent' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-purple-500/20 text-purple-400 border border-purple-500/30">
                                VARIANTES
                              </span>
                            )}
                            {p.type_produit === 'service' && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-sky-500/20 text-sky-400 border border-sky-500/30">
                                SERVICE
                              </span>
                            )}
                          </div>
                          {p.emplacement && (
                            <p className="text-xs text-gray-400">Empl: {p.emplacement}</p>
                          )}
                        </div>
                      </td>
                      <td className="hidden md:table-cell">
                        {p.categories ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-semibold"
                            style={{
                              backgroundColor: p.categories.couleur + '20',
                              color: p.categories.couleur,
                            }}
                          >
                            {p.categories.nom}
                          </span>
                        ) : (
                          <span className="text-gray-400 text-xs">—</span>
                        )}
                      </td>
                      <td className="hidden lg:table-cell text-gray-500 font-mono text-xs">
                        {p.sku || '—'}
                      </td>
                      <td className="hidden xl:table-cell text-gray-400 font-mono text-xs">
                        {p.code_barres || '—'}
                      </td>
                      <td className="text-right">
                        <span className={`font-bold ${isOut ? 'text-[#dc3545]' : isAlert ? 'text-[#ffc107]' : 'text-gray-900 dark:text-white'}`}>
                          {formatNumber(p.quantite)}
                        </span>
                        <span className="text-xs text-gray-400 ml-1">{p.unite}</span>
                      </td>
                      <td className="text-right hidden sm:table-cell font-semibold text-gray-800 dark:text-gray-200">
                        {formatCurrency(p.prix_vente)}
                      </td>
                      <td className="text-center">
                        {isOut ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300">
                            <AlertTriangle className="w-3 h-3" /> Rupture
                          </span>
                        ) : isAlert ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                            <AlertTriangle className="w-3 h-3" /> Faible
                          </span>
                        ) : (
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded text-xs font-semibold bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300">
                            En stock
                          </span>
                        )}
                      </td>
                      <td className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setUnitsTarget(p)}
                            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                            title="Conditionnements & Unités multiples"
                          >
                            <Scale className="w-3.5 h-3.5 text-sky-500" />
                          </button>
                          <button
                            onClick={() => setVariantsTarget(p)}
                            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                            title="Déclinaisons & Variantes"
                          >
                            <TagIcon className="w-3.5 h-3.5 text-purple-500" />
                          </button>
                          <button
                            onClick={() => setBomTarget(p)}
                            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                            title="Composants Kit / Nomenclature (BOM)"
                          >
                            <BoxesIcon className="w-3.5 h-3.5 text-amber-500" />
                          </button>
                          <button
                            onClick={() => setMoveTarget(p)}
                            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                            title="Mouvement de stock"
                          >
                            <ArrowLeftRight className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && (
                            <button
                              onClick={() => openEdit(p)}
                              className="btn-lte btn-lte-sm btn-lte-outline-primary"
                              title="Modifier"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            onClick={() => setLotsTarget(p)}
                            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                            title="Lots & péremptions"
                          >
                            <Layers className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setLabelTarget(p)}
                            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
                            title="Étiquette code-barres"
                          >
                            <Barcode className="w-3.5 h-3.5" />
                          </button>
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(p)}
                              className="btn-lte btn-lte-sm btn-lte-danger"
                              title="Supprimer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Add/Edit modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier le produit' : 'Nouveau produit'}
        size="lg"
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
              <input
                type="text"
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="Nom du produit"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type d'article</label>
              <select
                value={form.type_produit}
                onChange={(e) => setForm({ ...form, type_produit: e.target.value as any })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="simple">Article Standard (Stock simple)</option>
                <option value="compose">Kit / Produit composé (BOM)</option>
                <option value="variante_parent">Article Parent de Variantes</option>
                <option value="service">Prestation de Service (Sans stock)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">SKU / Référence</label>
              <input
                type="text"
                value={form.sku}
                onChange={(e) => setForm({ ...form, sku: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 focus:border-transparent"
                placeholder="REF-001"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Catégorie</label>
              <select
                value={form.categorie_id}
                onChange={(e) => setForm({ ...form, categorie_id: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="">Aucune</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>{c.nom}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Quantité initiale</label>
              <input
                type="number"
                value={form.quantite}
                onChange={(e) => setForm({ ...form, quantite: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                disabled={!!editing}
              />
              {editing && (
                <p className="text-xs text-slate-400 mt-1">Utilisez les mouvements pour ajuster le stock</p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Seuil d'alerte</label>
              <input
                type="number"
                value={form.seuil_alerte}
                onChange={(e) => setForm({ ...form, seuil_alerte: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            {editPrixAchat && (
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prix d'achat</label>
              <input
                type="number"
                step="0.01"
                value={form.prix_unitaire}
                onChange={(e) => setForm({ ...form, prix_unitaire: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            )}
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Prix de vente</label>
              <input
                type="number"
                step="0.01"
                value={form.prix_vente}
                onChange={(e) => setForm({ ...form, prix_vente: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Unité</label>
              <input
                type="text"
                value={form.unite}
                onChange={(e) => setForm({ ...form, unite: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="pièce, kg, litre..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Emplacement</label>
              <input
                type="text"
                value={form.emplacement}
                onChange={(e) => setForm({ ...form, emplacement: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
                placeholder="A1, Étagère 3..."
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code-barres</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={form.code_barres}
                  onChange={(e) => setForm({ ...form, code_barres: e.target.value })}
                  className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 font-mono"
                  placeholder="Scan ou saisie..."
                />
                <button
                  type="button"
                  onClick={() => {
                    const base = (form.sku || form.nom || 'PROD').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'PROD';
                    setForm({ ...form, code_barres: base + String(Math.floor(Math.random() * 9000) + 1000) });
                  }}
                  className="px-3 py-2.5 rounded-xl bg-slate-100 text-slate-600 text-sm font-medium hover:bg-slate-200 transition-colors whitespace-nowrap"
                >
                  Générer
                </button>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Valorisation</label>
              <select
                value={form.methode_valorisation}
                onChange={(e) => setForm({ ...form, methode_valorisation: e.target.value as 'cmup' | 'fifo' })}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white"
              >
                <option value="cmup">CMUP (coût moyen)</option>
                <option value="fifo">FIFO (premier entré, premier sorti)</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Qté réappro. suggérée</label>
              <input
                type="number"
                value={form.quantite_economique}
                onChange={(e) => setForm({ ...form, quantite_economique: e.target.value })}
                min="0"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
              />
            </div>
            <div className="sm:col-span-2 flex items-center gap-3 bg-slate-50 rounded-xl p-3">
              <input
                type="checkbox"
                id="perissable"
                checked={form.perissable}
                onChange={(e) => setForm({ ...form, perissable: e.target.checked })}
                className="w-4 h-4 accent-sky-600"
              />
              <label htmlFor="perissable" className="text-sm font-medium text-slate-700 flex-1">Produit périssable (lots + dates de péremption)</label>
              {form.perissable && (
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={form.alerte_peremption_jours}
                    onChange={(e) => setForm({ ...form, alerte_peremption_jours: e.target.value })}
                    min="1"
                    className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500"
                  />
                  <span className="text-xs text-slate-500">jours d'alerte</span>
                </div>
              )}
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none"
                placeholder="Description optionnelle"
              />
            </div>
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
              className="px-4 py-2.5 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : editing ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Move stock modal */}
      {moveTarget && (
        <MoveStockModal
          produit={moveTarget}
          onClose={() => setMoveTarget(null)}
          onConfirm={moveStock}
        />
      )}

      {/* Lots modal */}
      {lotsTarget && (
        <LotManager
          produit={lotsTarget}
          lots={lots.filter((l) => l.produit_id === lotsTarget.id)}
          role={role}
          onClose={() => setLotsTarget(null)}
          onChanged={onRefresh}
        />
      )}

      {/* Label modal */}
      {labelTarget && (
        <LabelModal produit={labelTarget} onClose={() => setLabelTarget(null)} />
      )}

      {/* Unités de conditionnement */}
      {unitsTarget && (
        <PackagingUnitsModal produit={unitsTarget} onClose={() => setUnitsTarget(null)} />
      )}

      {/* Variantes matricielles */}
      {variantsTarget && (
        <VariantsModal produit={variantsTarget} onClose={() => setVariantsTarget(null)} />
      )}

      {/* Nomenclature & Kits */}
      {bomTarget && (
        <BOMKitModal produit={bomTarget} catalogueProduits={produits} onClose={() => setBomTarget(null)} />
      )}

      {/* Delete confirm */}
      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer le produit"
        message={`Voulez-vous vraiment supprimer « ${deleteTarget?.nom} » ? Tous les mouvements associés seront également supprimés.`}
        confirmLabel="Supprimer"
      />
    </div>
  );
}

function LabelModal({ produit, onClose }: { produit: ProduitWithCategorie; onClose: () => void }) {
  const code = produit.code_barres || produit.sku || produit.id.slice(0, 8).toUpperCase();
  return (
    <Modal open={true} onClose={onClose} title={`Étiquette — ${produit.nom}`} size="sm">
      <div className="space-y-4">
        <div className="flex flex-col items-center bg-white border border-slate-200 rounded-xl p-6">
          <p className="font-semibold text-slate-900 text-center">{produit.nom}</p>
          {produit.sku && <p className="text-xs text-slate-500 font-mono">{produit.sku}</p>}
          <div className="mt-3">
            <Barcode39 value={code} height={60} moduleWidth={2} />
          </div>
          <p className="text-sm font-semibold text-slate-900 mt-2">{produit.prix_vente.toFixed(2)} €</p>
        </div>
        <button
          onClick={() => window.print()}
          className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors"
        >
          <Printer className="w-4 h-4" /> Imprimer l'étiquette
        </button>
        <p className="text-xs text-slate-400 text-center">Astuce : utilisez « Code-barres » dans la fiche produit pour générer automatiquement un code à partir du SKU.</p>
      </div>
    </Modal>
  );
}

function MoveStockModal({
  produit,
  onClose,
  onConfirm,
}: {
  produit: ProduitWithCategorie;
  onClose: () => void;
  onConfirm: (type: 'entree' | 'sortie', quantite: number, motif: string) => void;
}) {
  const [type, setType] = useState<'entree' | 'sortie'>('entree');
  const [quantite, setQuantite] = useState('1');
  const [motif, setMotif] = useState('');

  return (
    <Modal open={true} onClose={onClose} title={`Mouvement — ${produit.nom}`} size="sm">
      <div className="space-y-4">
        <div className="bg-slate-50 rounded-xl p-3 text-sm text-slate-600">
          Stock actuel: <span className="font-semibold text-slate-900">{produit.quantite} {produit.unite}</span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => setType('entree')}
            className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${
              type === 'entree'
                ? 'bg-emerald-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Entrée (+)
          </button>
          <button
            onClick={() => setType('sortie')}
            className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${
              type === 'sortie'
                ? 'bg-red-600 text-white shadow-sm'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Sortie (−)
          </button>
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Quantité</label>
          <input
            type="number"
            value={quantite}
            onChange={(e) => setQuantite(e.target.value)}
            min="1"
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Motif</label>
          <input
            type="text"
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500"
            placeholder={type === 'entree' ? 'Réapprovisionnement, commande...' : 'Vente, perte...'}
          />
        </div>
        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            onClick={onClose}
            className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors"
          >
            Annuler
          </button>
          <button
            onClick={() => onConfirm(type, parseInt(quantite) || 0, motif)}
            className={`px-4 py-2.5 text-sm font-medium text-white rounded-xl transition-colors shadow-sm ${
              type === 'entree' ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            Confirmer
          </button>
        </div>
      </div>
    </Modal>
  );
}
