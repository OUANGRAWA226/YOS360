import { useState, useMemo } from 'react';
import { Plus, Search, Edit2, Trash2, Users, Mail, Phone, MapPin, Eye, Award, DollarSign } from 'lucide-react';
import type { Client, CommandeWithRelations, PaiementWithRelations, Entreprise, CategorieClient } from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { getInitials, formatCurrency, formatNumber } from '@/lib/format';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Card, InfoBox } from '@/components/adminlte';
import { Client360Modal } from '@/components/Client360Modal';
import { PALIERS_CONFIG } from '@/lib/comptaSyscohada';

type Props = {
  clients: Client[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
  commandes?: CommandeWithRelations[];
  paiements?: PaiementWithRelations[];
  entreprise?: Entreprise | null;
};

type FormState = {
  nom: string;
  email: string;
  telephone: string;
  adresse: string;
  ville: string;
  code_postal: string;
  pays: string;
  note: string;
  ifu: string;
  rccm: string;
  encours_max: string;
  delai_paiement_jours: string;
  categorie_client: CategorieClient;
};

const emptyForm: FormState = {
  nom: '',
  email: '',
  telephone: '',
  adresse: '',
  ville: '',
  code_postal: '',
  pays: 'Burkina Faso',
  note: '',
  ifu: '',
  rccm: '',
  encours_max: '500000',
  delai_paiement_jours: '30',
  categorie_client: 'detail',
};

const avatarColors = [
  'bg-sky-500', 'bg-emerald-500', 'bg-orange-500', 'bg-violet-500', 'bg-rose-500', 'bg-amber-500', 'bg-teal-500',
];

function colorForName(name: string) {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return avatarColors[Math.abs(hash) % avatarColors.length];
}

export function Clients({ clients, loading, onRefresh, role, commandes = [], paiements = [], entreprise }: Props) {
  const canCreate = can(role, 'clients', 'create');
  const canEdit = can(role, 'clients', 'edit');
  const canDelete = can(role, 'clients', 'delete');
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<Client | null>(null);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Client | null>(null);
  const [client360Target, setClient360Target] = useState<Client | null>(null);

  const filtered = useMemo(() => {
    return clients.filter((c) => {
      const q = search.toLowerCase();
      return c.nom.toLowerCase().includes(q) || (c.ville || '').toLowerCase().includes(q) || (c.email || '').toLowerCase().includes(q);
    });
  }, [clients, search]);

  const openAdd = () => { setEditing(null); setForm(emptyForm); setModalOpen(true); };
  const openEdit = (c: Client) => {
    setEditing(c);
    setForm({
      nom: c.nom,
      email: c.email || '',
      telephone: c.telephone || '',
      adresse: c.adresse || '',
      ville: c.ville || '',
      code_postal: c.code_postal || '',
      pays: c.pays || 'Burkina Faso',
      note: c.note || '',
      ifu: c.ifu || '',
      rccm: c.rccm || '',
      encours_max: String(c.encours_max || 500000),
      delai_paiement_jours: String(c.delai_paiement_jours || 30),
      categorie_client: c.categorie_client || 'detail',
    });
    setModalOpen(true);
  };

  const save = async () => {
    if (!form.nom.trim()) { showToast('Le nom est obligatoire', 'error'); return; }
    setSaving(true);
    const payload = {
      nom: form.nom.trim(),
      email: form.email.trim() || null,
      telephone: form.telephone.trim() || null,
      adresse: form.adresse.trim() || null,
      ville: form.ville.trim() || null,
      code_postal: form.code_postal.trim() || null,
      pays: form.pays.trim() || 'Burkina Faso',
      note: form.note.trim() || null,
      ifu: form.ifu.trim() || null,
      rccm: form.rccm.trim() || null,
      encours_max: parseFloat(form.encours_max) || 0,
      delai_paiement_jours: parseInt(form.delai_paiement_jours) || 30,
      categorie_client: form.categorie_client,
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
                {filtered.map((c) => {
                  const palierKey = c.palier_fidelite || 'bronze';
                  const cfgPalier = PALIERS_CONFIG[palierKey] || PALIERS_CONFIG.bronze;

                  return (
                    <tr key={c.id}>
                      <td>
                        <div className="flex items-center gap-2.5">
                          <div className={`w-8 h-8 rounded-full ${colorForName(c.nom)} flex items-center justify-center text-white font-bold text-xs shadow-sm flex-shrink-0`}>
                            {getInitials(c.nom)}
                          </div>
                          <div>
                            <p className="font-semibold text-gray-900 dark:text-white leading-tight">{c.nom}</p>
                            <div className="flex items-center gap-1.5 mt-0.5">
                              <span
                                className="px-1.5 py-0.2 rounded text-[10px] font-bold text-white uppercase"
                                style={{ backgroundColor: cfgPalier.couleur }}
                              >
                                {cfgPalier.label}
                              </span>
                              {(c.points_fidelite || 0) > 0 && (
                                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-bold">
                                  {formatNumber(c.points_fidelite || 0)} pts
                                </span>
                              )}
                              {c.categorie_client && c.categorie_client !== 'detail' && (
                                <span className="text-[10px] font-semibold text-sky-600 dark:text-sky-400 uppercase">
                                  • {c.categorie_client}
                                </span>
                              )}
                            </div>
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
                          <button
                            onClick={() => setClient360Target(c)}
                            className="btn-lte btn-lte-sm btn-lte-outline-info text-sky-600 dark:text-sky-400"
                            title="Vue Client 360° & Fidélité"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le client' : 'Nouveau client'} size="lg">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="form-label-lte">Nom / Raison Sociale <span className="text-red-500">*</span></label>
              <input
                type="text"
                required
                value={form.nom}
                onChange={(e) => setForm({ ...form, nom: e.target.value })}
                className="form-control-lte text-sm"
                placeholder="Ex: Entreprise ABC ou Nom Prénom"
              />
            </div>
            <div>
              <label className="form-label-lte">Catégorie tarifaire <span className="text-red-500">*</span></label>
              <select
                value={form.categorie_client}
                onChange={(e) => setForm({ ...form, categorie_client: e.target.value as any })}
                className="form-select-lte text-sm"
              >
                <option value="detail">Détail (Standard)</option>
                <option value="demi_gros">Demi-gros</option>
                <option value="grossiste">Grossiste</option>
                <option value="vip">Client VIP</option>
              </select>
            </div>
            <div>
              <label className="form-label-lte">Adresse Email</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="form-control-lte text-sm"
                placeholder="contact@exemple.com"
              />
            </div>
            <div>
              <label className="form-label-lte">Téléphone (WhatsApp)</label>
              <input
                type="tel"
                value={form.telephone}
                onChange={(e) => setForm({ ...form, telephone: e.target.value })}
                className="form-control-lte text-sm"
                placeholder="+226 70 00 00 00"
              />
            </div>
            <div>
              <label className="form-label-lte">Numéro IFU</label>
              <input
                type="text"
                placeholder="Identifiant Fiscal Unique"
                value={form.ifu}
                onChange={(e) => setForm({ ...form, ifu: e.target.value })}
                className="form-control-lte text-sm font-mono"
              />
            </div>
            <div>
              <label className="form-label-lte">Numéro RCCM</label>
              <input
                type="text"
                placeholder="Registre de Commerce"
                value={form.rccm}
                onChange={(e) => setForm({ ...form, rccm: e.target.value })}
                className="form-control-lte text-sm font-mono"
              />
            </div>
            <div>
              <label className="form-label-lte">Plafond de crédit autorisé (FCFA)</label>
              <input
                type="number"
                min="0"
                value={form.encours_max}
                onChange={(e) => setForm({ ...form, encours_max: e.target.value })}
                className="form-control-lte text-sm font-mono text-right"
              />
            </div>
            <div>
              <label className="form-label-lte">Délai accordé de paiement (Jours)</label>
              <input
                type="number"
                min="0"
                value={form.delai_paiement_jours}
                onChange={(e) => setForm({ ...form, delai_paiement_jours: e.target.value })}
                className="form-control-lte text-sm"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label-lte">Adresse géographique</label>
              <input
                type="text"
                value={form.adresse}
                onChange={(e) => setForm({ ...form, adresse: e.target.value })}
                className="form-control-lte text-sm"
                placeholder="Ex: Secteur 15, Rue 12.34..."
              />
            </div>
            <div>
              <label className="form-label-lte">Ville</label>
              <input
                type="text"
                value={form.ville}
                onChange={(e) => setForm({ ...form, ville: e.target.value })}
                className="form-control-lte text-sm"
                placeholder="Ouagadougou"
              />
            </div>
            <div>
              <label className="form-label-lte">Pays</label>
              <input
                type="text"
                value={form.pays}
                onChange={(e) => setForm({ ...form, pays: e.target.value })}
                className="form-control-lte text-sm"
                placeholder="Burkina Faso"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="form-label-lte">Note interne</label>
              <textarea
                value={form.note}
                onChange={(e) => setForm({ ...form, note: e.target.value })}
                rows={2}
                className="form-control-lte text-sm resize-none"
                placeholder="Notes internes confidentielles..."
              />
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
              {saving ? 'Enregistrement...' : editing ? 'Modifier le client' : 'Créer le client'}
            </button>
          </div>
        </form>
      </Modal>

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} title="Supprimer le client" message={`Voulez-vous vraiment supprimer « ${deleteTarget?.nom} » ?`} confirmLabel="Supprimer" />

      {client360Target && (
        <Client360Modal
          client={client360Target}
          commandes={commandes}
          paiements={paiements}
          entreprise={entreprise}
          onClose={() => setClient360Target(null)}
        />
      )}
    </div>
  );
}
