import { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Warehouse, MapPin, User } from 'lucide-react';
import type { Entrepot, StockEntrepot, ProduitWithCategorie } from '@/lib/supabase';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber } from '@/lib/format';

type Props = {
  entrepots: Entrepot[];
  stocksEntrepot: StockEntrepot[];
  produits: ProduitWithCategorie[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

export function Entrepots({ entrepots, stocksEntrepot, produits, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'entrepots', 'create');
  const canEdit = can(role, 'entrepots', 'edit');
  const canDelete = can(role, 'entrepots', 'delete');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Entrepot | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Entrepot | null>(null);
  const [nom, setNom] = useState('');
  const [code, setCode] = useState('');
  const [adresse, setAdresse] = useState('');
  const [ville, setVille] = useState('');
  const [responsable, setResponsable] = useState('');
  const [saving, setSaving] = useState(false);

  const stockByEntrepot = useMemo(() => {
    const map: Record<string, { refs: number; unites: number; valeur: number }> = {};
    entrepots.forEach((e) => { map[e.id] = { refs: 0, unites: 0, valeur: 0 }; });
    stocksEntrepot.forEach((s) => {
      if (!map[s.entrepot_id]) return;
      if (s.quantite > 0) map[s.entrepot_id].refs++;
      map[s.entrepot_id].unites += s.quantite;
      const p = produits.find((pr) => pr.id === s.produit_id);
      if (p) map[s.entrepot_id].valeur += s.quantite * Number(p.cmup || p.prix_vente);
    });
    return map;
  }, [entrepots, stocksEntrepot, produits]);

  const filtered = entrepots.filter((e) =>
    e.nom.toLowerCase().includes(search.toLowerCase()) ||
    (e.code || '').toLowerCase().includes(search.toLowerCase()) ||
    (e.ville || '').toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => {
    setEditing(null);
    setNom(''); setCode(''); setAdresse(''); setVille(''); setResponsable('');
    setModalOpen(true);
  };

  const openEdit = (e: Entrepot) => {
    setEditing(e);
    setNom(e.nom); setCode(e.code || ''); setAdresse(e.adresse || ''); setVille(e.ville || ''); setResponsable(e.responsable || '');
    setModalOpen(true);
  };

  const save = async () => {
    if (!nom.trim()) { showToast('Le nom est obligatoire', 'error'); return; }
    setSaving(true);
    const payload = {
      nom: nom.trim(),
      code: code.trim() || null,
      adresse: adresse.trim() || null,
      ville: ville.trim() || null,
      responsable: responsable.trim() || null,
    };
    const result = editing
      ? await writeRow('entrepots', 'update', payload, editing.id)
      : await writeRow('entrepots', 'insert', payload);
    if (!result.offline && !result.error) {
      await applyLocalCache('entrepots', editing ? 'update' : 'insert', { ...payload, id: editing?.id }, editing?.id);
    }
    setSaving(false);
    if (result.offline) showToast('Enregistré localement, sera synchronisé', 'info');
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast(editing ? 'Site mis à jour' : 'Site créé');
    setModalOpen(false);
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('entrepots', 'delete', {}, deleteTarget.id);
    if (!result.offline && !result.error) await applyLocalCache('entrepots', 'delete', {}, deleteTarget.id);
    if (result.offline) showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast('Site supprimé');
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Entrepôts & Boutiques</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Gérez vos sites et leur stock</p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700 transition-colors shadow-sm shadow-sky-600/20">
            <Plus className="w-5 h-5" /> Nouveau site
          </button>
        )}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un site..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-40 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Warehouse className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucun site</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map((e) => {
            const st = stockByEntrepot[e.id] || { refs: 0, unites: 0, valeur: 0 };
            return (
              <div key={e.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center">
                      <Warehouse className="w-5 h-5 text-sky-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-slate-900">{e.nom}</p>
                      {e.code && <p className="text-xs font-mono text-slate-400">{e.code}</p>}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {canEdit && <button onClick={() => openEdit(e)} className="p-2 rounded-lg hover:bg-sky-50 text-slate-400 hover:text-sky-600 transition-colors" title="Modifier"><Pencil className="w-4 h-4" /></button>}
                    {canDelete && <button onClick={() => setDeleteTarget(e)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Supprimer"><Trash2 className="w-4 h-4" /></button>}
                  </div>
                </div>
                <div className="mt-4 space-y-1.5 text-sm text-slate-600">
                  {(e.adresse || e.ville) && <p className="flex items-center gap-2"><MapPin className="w-4 h-4 text-slate-400" />{[e.adresse, e.ville].filter(Boolean).join(', ')}</p>}
                  {e.responsable && <p className="flex items-center gap-2"><User className="w-4 h-4 text-slate-400" />{e.responsable}</p>}
                </div>
                <div className="mt-4 grid grid-cols-3 gap-2 border-t border-slate-100 pt-4">
                  <div><p className="text-xs text-slate-400">Références</p><p className="font-bold text-slate-900">{formatNumber(st.refs)}</p></div>
                  <div><p className="text-xs text-slate-400">Unités</p><p className="font-bold text-slate-900">{formatNumber(st.unites)}</p></div>
                  <div><p className="text-xs text-slate-400">Valeur (CMUP)</p><p className="font-bold text-slate-900">{formatNumber(Math.round(st.valeur))}</p></div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le site' : 'Nouveau site'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label>
            <input type="text" value={nom} onChange={(e) => setNom(e.target.value)} placeholder="Ex: Entrepôt Nord"
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Code</label>
              <input type="text" value={code} onChange={(e) => setCode(e.target.value)} placeholder="EX: NORD1"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Responsable</label>
              <input type="text" value={responsable} onChange={(e) => setResponsable(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
            <input type="text" value={adresse} onChange={(e) => setAdresse(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Ville</label>
            <input type="text" value={ville} onChange={(e) => setVille(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
            <button onClick={save} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors shadow-sm disabled:opacity-50">
              {saving ? 'Enregistrement...' : 'Enregistrer'}
            </button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer le site"
        message={`Voulez-vous vraiment supprimer « ${deleteTarget?.nom} » ? Le stock rattaché à ce site sera perdu de l'affichage.`}
        confirmLabel="Supprimer"
      />
    </div>
  );
}
