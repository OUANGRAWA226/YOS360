import { useState, useMemo } from 'react';
import { Plus, Search, Pencil, Trash2, Warehouse, MapPin, User, Package, DollarSign } from 'lucide-react';
import type { Entrepot, StockEntrepot, ProduitWithCategorie } from '@/lib/supabase';
import { writeRow, applyLocalCache } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber } from '@/lib/format';
import { InfoBox, Card } from '@/components/adminlte';

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

  const totalSites = entrepots.length;
  const totalUnitesGlobal = Object.values(stockByEntrepot).reduce((sum, s) => sum + s.unites, 0);
  const totalValeurGlobal = Object.values(stockByEntrepot).reduce((sum, s) => sum + s.valeur, 0);

  return (
    <div className="space-y-6">
      {/* Content Header (Page header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Warehouse className="w-7 h-7 text-primary" />
            Entrepôts & Boutiques
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Gérez vos dépôts, boutiques physiques et stocks multi-sites en temps réel
          </p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-lte btn-lte-primary">
            <Plus className="w-4 h-4" /> Nouveau site
          </button>
        )}
      </div>

      {/* AdminLTE Info-Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InfoBox
          title="Sites Répertoriés"
          value={totalSites}
          icon={Warehouse}
          variant="info"
          description="Entrepôts & points de vente"
        />
        <InfoBox
          title="Stock Total (Unités)"
          value={formatNumber(totalUnitesGlobal)}
          icon={Package}
          variant="success"
          description="Total physique disponible"
        />
        <InfoBox
          title="Valeur Globale (CMUP)"
          value={formatNumber(Math.round(totalValeurGlobal))}
          icon={DollarSign}
          variant="warning"
          description="Valorisation comptable"
        />
      </div>

      {/* Filter Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher par nom, code ou ville..."
            className="form-control-lte pl-9"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-44 bg-slate-100 dark:bg-slate-800 rounded-lg animate-pulse" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="p-12 text-center bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800">
          <Warehouse className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
          <p className="text-sm font-semibold text-slate-500">Aucun site ne correspond à votre recherche</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {filtered.map((e) => {
            const st = stockByEntrepot[e.id] || { refs: 0, unites: 0, valeur: 0 };
            return (
              <Card
                key={e.id}
                title={e.nom}
                icon={Warehouse}
                variant="primary"
                outline
                tools={
                  <div className="flex items-center gap-1">
                    {e.code && (
                      <span className="badge-adminlte bg-primary-subtle text-primary border border-primary/20 mr-1.5 font-mono text-[11px]">
                        {e.code}
                      </span>
                    )}
                    {canEdit && (
                      <button
                        onClick={() => openEdit(e)}
                        className="btn-lte btn-lte-secondary btn-lte-sm"
                        title="Modifier le site"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                    )}
                    {canDelete && (
                      <button
                        onClick={() => setDeleteTarget(e)}
                        className="btn-lte btn-lte-danger btn-lte-sm"
                        title="Supprimer le site"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                }
                footer={
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Références</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {formatNumber(st.refs)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Unités</p>
                      <p className="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                        {formatNumber(st.unites)}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase font-bold text-slate-400">Valeur (CMUP)</p>
                      <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                        {formatNumber(Math.round(st.valeur))}
                      </p>
                    </div>
                  </div>
                }
              >
                <div className="space-y-2 text-xs text-slate-600 dark:text-slate-400">
                  {(e.adresse || e.ville) ? (
                    <p className="flex items-center gap-2">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{[e.adresse, e.ville].filter(Boolean).join(', ')}</span>
                    </p>
                  ) : (
                    <p className="flex items-center gap-2 text-slate-400 italic">
                      <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Aucune adresse renseignée</span>
                    </p>
                  )}
                  {e.responsable && (
                    <p className="flex items-center gap-2">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>Responsable : <strong className="text-slate-700 dark:text-slate-300">{e.responsable}</strong></span>
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editing ? 'Modifier le site' : 'Nouveau site'} size="md">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            save();
          }}
          className="space-y-4"
        >
          <div>
            <label className="form-label-lte">Nom du site d'entreposage <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={nom}
              onChange={(e) => setNom(e.target.value)}
              placeholder="Ex: Entrepôt Central, Dépôt Nord..."
              className="form-control-lte text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label-lte">Code référence</label>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="EX: NORD1"
                className="form-control-lte text-sm font-mono uppercase"
              />
            </div>
            <div>
              <label className="form-label-lte">Responsable du site</label>
              <input
                type="text"
                value={responsable}
                onChange={(e) => setResponsable(e.target.value)}
                placeholder="Ex: M. Jean Ilboudo"
                className="form-control-lte text-sm"
              />
            </div>
          </div>
          <div>
            <label className="form-label-lte">Adresse géographique</label>
            <input
              type="text"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="Zone industrielle de Kossodo..."
              className="form-control-lte text-sm"
            />
          </div>
          <div>
            <label className="form-label-lte">Ville</label>
            <input
              type="text"
              value={ville}
              onChange={(e) => setVille(e.target.value)}
              placeholder="Ouagadougou"
              className="form-control-lte text-sm"
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
              className="btn-lte btn-lte-sm btn-lte-primary disabled:opacity-50"
            >
              {saving ? 'Enregistrement...' : editing ? 'Modifier le site' : 'Enregistrer le site'}
            </button>
          </div>
        </form>
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
