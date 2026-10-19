import { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Users, Mail, Phone, MapPin } from 'lucide-react';
import type { Client } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { getInitials } from '@/lib/format';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Card, InfoBox } from '@/components/adminlte';

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
    <div className="space-y-5">
      {/* AdminLTE Card for Clients */}
      <Card
        title="Répertoire des Clients"
        variant="primary"
        outline={true}
        collapsible={true}
        maximizable={true}
        tools={
          canCreate ? (
            <button onClick={openAdd} className="btn-lte btn-lte-sm btn-lte-primary">
              <Plus className="w-3.5 h-3.5" /> Nouveau client
            </button>
          ) : undefined
        }
      >
        {/* Search Toolbar */}
        <div className="mb-4">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Rechercher par nom, ville, email, téléphone..."
              className="form-control-lte pl-9"
            />
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="h-10 bg-gray-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-400">
            <Users className="w-12 h-12 text-gray-300 mx-auto mb-3" />
            <p>Aucun client trouvé</p>
          </div>
        ) : (
          <div className="overflow-x-auto -mx-4 sm:-mx-5 -mb-4 sm:-mb-5">
            <table className="table-adminlte">
              <thead>
                <tr>
                  <th className="text-left">Client</th>
                  <th className="text-left">Coordonnées</th>
                  <th className="text-left hidden sm:table-cell">Ville & Pays</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <div className="flex items-center gap-2.5">
                        <div className={`w-8 h-8 rounded-full ${colorForName(c.nom)} flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0`}>
                          {getInitials(c.nom)}
                        </div>
                        <div>
                          <p className="font-semibold text-gray-900 dark:text-white leading-tight">{c.nom}</p>
                          {c.note && <p className="text-[11px] text-gray-400 truncate max-w-xs">{c.note}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="text-xs">
                      {c.email && (
                        <p className="text-gray-700 dark:text-gray-300 flex items-center gap-1.5">
                          <Mail className="w-3 h-3 text-gray-400" /> {c.email}
                        </p>
                      )}
                      {c.telephone && (
                        <p className="text-gray-500 flex items-center gap-1.5 mt-0.5">
                          <Phone className="w-3 h-3 text-gray-400" /> {c.telephone}
                        </p>
                      )}
                      {!c.email && !c.telephone && <span className="text-gray-400">—</span>}
                    </td>
                    <td className="hidden sm:table-cell text-xs text-gray-600 dark:text-gray-300">
                      {[c.ville, c.pays].filter(Boolean).join(', ') || '—'}
                    </td>
                    <td className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {canEdit && (
                          <button
                            onClick={() => openEdit(c)}
                            className="btn-lte btn-lte-sm btn-lte-outline-primary"
                            title="Modifier"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => setDeleteTarget(c)}
                            className="btn-lte btn-lte-sm btn-lte-danger"
                            title="Supprimer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

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
