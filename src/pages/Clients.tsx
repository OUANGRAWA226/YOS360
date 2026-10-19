import { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Users, Mail, Phone, MapPin } from 'lucide-react';
import type { Client } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { getInitials } from '@/lib/format';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';

type Props = {
  clients: Client[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

type FormState = {
  nom: string; email: string; telephone: string; adresse: string; ville: string; code_postal: string; pays: string; note: string;
};

const emptyForm: FormState = {
  nom: '', email: '', telephone: '', adresse: '', ville: '', code_postal: '', pays: 'France', note: '',
};

const avatarColors = [
  'bg-sky-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500',
];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function Clients({ clients, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'clients', 'create');
  const canEdit = can(role, 'clients', 'edit');
  const canDelete = can(role, 'clients', 'delete');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase();
      return c.nom.toLowerCase().includes(q) || (c.ville || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
    });
  }, [clients, search]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({ nom: c.nom, email: c.email || '', telephone: c.telephone || '', adresse: c.adresse || '', ville: c.ville || '', code_postal: c.code_postal || '', pays: c.pays, note: c.note || '' });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nom.trim()) { showToast('Le nom est obligatoire', 'error'); return; }
    setSaving(true);
    const payload = {
      nom: form.nom.trim(), email: form.email.trim() || null, telephone: form.telephone.trim() || null,
      adresse: form.adresse.trim() || null, ville: form.ville.trim() || null, code_postal: form.code_postal.trim() || null,
      pays: form.pays.trim() || 'France', note: form.note.trim() || null,
    };
    const result = editing
      ? await writeRow('clients', 'update', payload, editing.id)
      : await writeRow('clients', 'insert', payload);
    setSaving(false);
    if (result.offline) {
      await applyLocalCache('clients', editing ? 'update' : 'insert', { ...payload, id: editing?.id }, editing?.id);
      showToast('Enregistré localement (hors-ligne)', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast(editing ? 'Client modifié' : 'Client ajouté');
    }
    setModalOpen(false); onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('clients', 'delete', {}, deleteTarget.id);
    if (result.offline) {
      await applyLocalCache('clients', 'delete', {}, deleteTarget.id);
      showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    } else if (result.error) {
      showToast('Erreur: ' + result.error, 'error');
      return;
    } else {
      showToast('Client supprimé');
    }
    onRefresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Clients</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{clients.length} client{clients.length > 1 ? 's' : ''}</p>
        </div>
        {canCreate && <button onClick={openAdd} className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-medium hover:bg-emerald-700 transition-colors shadow-sm shadow-emerald-600/20">
          <Plus className="w-5 h-5" /> Ajouter
        </button>}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par nom, ville, email..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => <div key={i} className="h-48 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <Users className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucun client trouvé</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((c) => (
            <div key={c.id} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 hover:shadow-md transition-shadow group">
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-xl ${colorForName(c.nom)} flex items-center justify-center text-white font-semibold text-sm`}>
                    {getInitials(c.nom)}
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{c.nom}</h3>
                  </div>
                </div>
                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                  {canEdit && <button onClick={() => openEdit(c)} className="p-2 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors"><Edit2 className="w-4 h-4" /></button>}
                  {canDelete && <button onClick={() => setDeleteTarget(c)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><Trash2 className="w-4 h-4" /></button>}
                </div>
              </div>
              <div className="space-y-2 text-sm">
                {c.email && <div className="flex items-center gap-2 text-slate-600"><Mail className="w-4 h-4 text-slate-400" /> {c.email}</div>}
                {c.telephone && <div className="flex items-center gap-2 text-slate-600"><Phone className="w-4 h-4 text-slate-400" /> {c.telephone}</div>}
                {(c.ville || c.adresse) && (
                  <div className="flex items-center gap-2 text-slate-600"><MapPin className="w-4 h-4 text-slate-400" />
                    {[c.adresse, c.code_postal, c.ville, c.pays].filter(Boolean).join(', ')}
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le client' : 'Nouveau client'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Nom *</label><input type="text" value={form.nom} onChange={(e) => setForm({ ...form, nom: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Email</label><input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label><input type="tel" value={form.telephone} onChange={(e) => setForm({ ...form, telephone: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label><input type="text" value={form.adresse} onChange={(e) => setForm({ ...form, adresse: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Ville</label><input type="text" value={form.ville} onChange={(e) => setForm({ ...form, ville: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Code postal</label><input type="text" value={form.code_postal} onChange={(e) => setForm({ ...form, code_postal: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
            <div><label className="block text-sm font-medium text-slate-700 mb-1">Pays</label><input type="text" value={form.pays} onChange={(e) => setForm({ ...form, pays: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" /></div>
            <div className="sm:col-span-2"><label className="block text-sm font-medium text-slate-700 mb-1">Note</label><textarea value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none" /></div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={() => setModalOpen(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
            <button onClick={save} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">{saving ? 'Enregistrement...' : editing ? 'Modifier' : 'Ajouter'}</button>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} title="Supprimer le client" message={`Voulez-vous vraiment supprimer « ${deleteTarget?.nom} » ?`} confirmLabel="Supprimer" />
    </div>
  );
}
