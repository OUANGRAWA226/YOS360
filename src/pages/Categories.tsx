import { useState } from 'react';
import { Plus, Edit2, Trash2, Tags, Package } from 'lucide-react';
import type { Categorie, ProduitWithCategorie } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';

type Props = {
  categories: Categorie[];
  produits: ProduitWithCategorie[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

const colorOptions = [
  { name: 'Bleu', value: '#0ea5e9' },
  { name: 'Émeraude', value: '#10b981' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Rose', value: '#ec4899' },
  { name: 'Violet', value: '#8b5cf6' },
  { name: 'Rouge', value: '#ef4444' },
  { name: 'Ambre', value: '#f59e0b' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Indigo', value: '#6366f1' },
  { name: 'Gris', value: '#64748b' },
];

export function Categories({ categories, produits, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'categories', 'create');
  const canEdit = can(role, 'categories', 'edit');
  const canDelete = can(role, 'categories', 'delete');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Categorie | null>(null);
  const [nom, setNom] = useState('');
  const [description, setDescription] = useState('');
  const [couleur, setCouleur] = useState('#0ea5e9');
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Categorie | null>(null);

  const openAdd = () => {
    setEditing(null);
    setNom('');
    setDescription('');
    setCouleur('#0ea5e9');
    setModalOpen(true);
  };

  const openEdit = (c: Categorie) => {
    setEditing(c);
    setNom(c.nom);
    setDescription(c.description || '');
    setCouleur(c.couleur);
    setModalOpen(true);
  };

  const save = async () => {
    if (!nom.trim()) {
      showToast('Le nom est obligatoire', 'error');
      return;
    }
    setSaving(true);
    const payload = {
      nom: nom.trim(),
      description: description.trim() || null,
      couleur,
    };
    const result = editing
      ? await writeRow('categories', 'update', payload, editing.id)
      : await writeRow('categories', 'insert', payload);
    setSaving(false);
    if (result.offline) {
      await applyLocalCache('categories', editing ? 'update' : 'insert', { ...payload, id: editing?.id }, editing?.id);
      showToast('Enregistré localement (hors-ligne)', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast(editing ? 'Catégorie modifiée' : 'Catégorie ajoutée');
    }
    setModalOpen(false);
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('categories', 'delete', {}, deleteTarget.id);
    if (result.offline) {
      await applyLocalCache('categories', 'delete', {}, deleteTarget.id);
      showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast('Catégorie supprimée');
    }
    onRefresh();
  };

  const countProduits = (catId: string) => produits.filter((p) => p.categorie_id === catId).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Catégories</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{categories.length} catégorie{categories.length > 1 ? 's' : ''}</p>
        </div>
        {canCreate && (
        <button
          onClick={openAdd}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-violet-600 text-white rounded-xl font-medium hover:bg-violet-700 transition-colors shadow-sm shadow-violet-600/20"
        >
          <Plus className="w-5 h-5" />
          Ajouter une catégorie
        </button>
        )}
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-40 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />
          ))}
        </div>
      ) : categories.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Tags className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucune catégorie pour le moment</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {categories.map((c) => (
            <div
              key={c.id}
              className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-md transition-shadow group"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center"
                  style={{ backgroundColor: c.couleur + '20' }}
                >
                  <Tags className="w-5 h-5" style={{ color: c.couleur }} />
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canEdit && <button
                    onClick={() => openEdit(c)}
                    className="p-2 rounded-lg hover:bg-sky-50 text-slate-400 hover:text-sky-600 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>}
                  {canDelete && <button
                    onClick={() => setDeleteTarget(c)}
                    className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>}
                </div>
              </div>
              <h3 className="font-semibold text-slate-900 text-lg">{c.nom}</h3>
              {c.description && (
                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{c.description}</p>
              )}
              <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-2 text-sm text-slate-500">
                <Package className="w-4 h-4" />
                {countProduits(c.id)} produit{countProduits(c.id) > 1 ? 's' : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
            <input
              type="text"
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 focus:border-transparent"
              placeholder="Nom de la catégorie"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
              placeholder="Description optionnelle"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-2">Couleur</label>
            <div className="flex flex-wrap gap-2">
              {colorOptions.map((c) => (
                <button
                  key={c.value}
                  onClick={() => setCouleur(c.value)}
                  className={`w-8 h-8 rounded-lg transition-all ${
                    couleur === c.value ? 'ring-2 ring-offset-2 ring-slate-400 scale-110' : 'hover:scale-105'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
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
              className="px-4 py-2.5 text-sm font-medium text-white bg-violet-600 rounded-xl hover:bg-violet-700 transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : editing ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer la catégorie"
        message={`Voulez-vous vraiment supprimer « ${deleteTarget?.nom} » ? Les produits de cette catégorie ne seront pas supprimés mais n'auront plus de catégorie.`}
        confirmLabel="Supprimer"
      />
    </div>
  );
}
