import { useState } from 'react';
import { Plus, Edit2, Trash2, Tags, Package } from 'lucide-react';
import type { Categorie, ProduitWithCategorie } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Card, InfoBox } from '@/components/adminlte';

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
    <div className="space-y-5">
      {/* AdminLTE Master Card for Categories */}
      <Card
        title="Gestion des Catégories de Produits"
        variant="info"
        outline={true}
        collapsible={true}
        maximizable={true}
        tools={
          canCreate ? (
            <button
              onClick={openAdd}
              className="btn-lte btn-lte-sm btn-lte-primary"
            >
              <Plus className="w-3.5 h-3.5" /> Nouvelle catégorie
            </button>
          ) : undefined
        }
      >
        {loading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(3)].map((_, i) => (
              <div key={i} className="h-32 bg-gray-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : categories.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Tags className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>Aucune catégorie enregistrée</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {categories.map((c) => (
              <div
                key={c.id}
                className="bg-white dark:bg-slate-900 rounded-md border border-gray-200 dark:border-slate-800 shadow-sm overflow-hidden flex flex-col justify-between"
                style={{ borderTop: `3px solid ${c.couleur}` }}
              >
                <div className="p-4">
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: c.couleur + '25', color: c.couleur }}
                      >
                        <Tags className="w-4 h-4" />
                      </div>
                      <h4 className="font-bold text-gray-900 dark:text-white text-sm">
                        {c.nom}
                      </h4>
                    </div>
                    <div className="flex items-center gap-1">
                      {canEdit && (
                        <button
                          onClick={() => openEdit(c)}
                          className="btn-lte btn-lte-sm btn-lte-outline-secondary p-1"
                          title="Modifier"
                        >
                          <Edit2 className="w-3 h-3" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(c)}
                          className="btn-lte btn-lte-sm btn-lte-danger p-1"
                          title="Supprimer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>

                  {c.description ? (
                    <p className="text-xs text-gray-500 line-clamp-2 mt-1">{c.description}</p>
                  ) : (
                    <p className="text-xs text-gray-400 italic mt-1">Aucune description</p>
                  )}
                </div>

                <div className="px-4 py-2 bg-gray-50 dark:bg-slate-800/50 border-t border-gray-200 dark:border-slate-800 flex items-center justify-between text-xs text-gray-500">
                  <span className="flex items-center gap-1.5 font-medium">
                    <Package className="w-3.5 h-3.5 text-gray-400" />
                    {countProduits(c.id)} article{countProduits(c.id) > 1 ? 's' : ''}
                  </span>
                  <span
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: c.couleur }}
                    title={c.couleur}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editing ? 'Modifier la catégorie' : 'Nouvelle catégorie'}
        size="md"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div>
            <label className="form-label-lte">Nom de la catégorie <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              className="form-control-lte text-sm"
              placeholder="Ex: Électronique, Alimentation, etc."
            />
          </div>
          <div>
            <label className="form-label-lte">Description</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              className="form-control-lte text-sm resize-none"
              placeholder="Description optionnelle de la catégorie"
            />
          </div>
          <div>
            <label className="form-label-lte">Couleur d'identification</label>
            <div className="flex flex-wrap gap-2 pt-1">
              {colorOptions.map((c) => (
                <button
                  type="button"
                  key={c.value}
                  onClick={() => setCouleur(c.value)}
                  className={`w-7 h-7 rounded-md transition-all ${
                    couleur === c.value ? 'ring-2 ring-offset-2 ring-brand-blue scale-110' : 'hover:scale-105 opacity-80 hover:opacity-100'
                  }`}
                  style={{ backgroundColor: c.value }}
                  title={c.name}
                />
              ))}
            </div>
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
              {saving ? 'Enregistrement...' : editing ? 'Modifier' : 'Ajouter'}
            </button>
          </div>
        </form>
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
