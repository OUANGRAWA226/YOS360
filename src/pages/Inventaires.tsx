import { useState, useMemo } from 'react';
import { Plus, Search, Trash2, ClipboardCheck, CheckCircle2, XCircle, Eye, TrendingUp, TrendingDown, Minus, Clock, CheckCircle } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { InventaireWithRelations, ProduitWithCategorie, Entrepot, InventaireStatut } from '@/lib/supabase';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatShortDate, generateReference, statutLabel, statutColor } from '@/lib/format';
import { SmallBox, InfoBox, Card } from '@/components/adminlte';

type Props = {
  inventaires: InventaireWithRelations[];
  produits: ProduitWithCategorie[];
  entrepots: Entrepot[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

export function Inventaires({ inventaires, produits, entrepots, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'inventaires', 'create');
  const canEdit = can(role, 'inventaires', 'edit');
  const canDelete = can(role, 'inventaires', 'delete');
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [countTarget, setCountTarget] = useState<InventaireWithRelations | null>(null);
  const [viewTarget, setViewTarget] = useState<InventaireWithRelations | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InventaireWithRelations | null>(null);
  const [saving, setSaving] = useState(false);

  // create form
  const [entrepotId, setEntrepotId] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<string>>(new Set());
  const [productSearch, setProductSearch] = useState('');

  // count form
  const [counts, setCounts] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    return inventaires.filter((inv) =>
      (inv.reference || '').toLowerCase().includes(search.toLowerCase())
    );
  }, [inventaires, search]);

  const productsToCount = useMemo(() => {
    const q = productSearch.toLowerCase();
    return produits
      .filter((p) => (entrepotId ? true : true))
      .filter((p) => p.nom.toLowerCase().includes(q) || (p.sku || '').toLowerCase().includes(q));
  }, [produits, productSearch, entrepotId]);

  const openCreate = () => {
    setEntrepotId(entrepots[0]?.id || '');
    setSelectedProducts(new Set());
    setProductSearch('');
    setCreateOpen(true);
  };

  const toggleProduct = (id: string) => {
    setSelectedProducts((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelectedProducts(new Set(productsToCount.map((p) => p.id)));

  const save = async () => {
    if (selectedProducts.size === 0) { showToast('Sélectionnez au moins un produit à compter', 'error'); return; }
    if (!navigator.onLine) { showToast('La création d\u2019inventaire nécessite une connexion internet', 'error'); return; }
    setSaving(true);
    const { data: inv, error: invError } = await supabase
      .from('inventaires')
      .insert({
        reference: generateReference('INV'),
        entrepot_id: entrepotId || null,
        statut: 'en_cours',
      })
      .select()
      .single();
    if (invError) { setSaving(false); showToast('Erreur: ' + invError.message, 'error'); return; }

    const lignes = [...selectedProducts].map((pid) => {
      const p = produits.find((pr) => pr.id === pid);
      return {
        inventaire_id: inv.id,
        produit_id: pid,
        stock_theorique: p ? p.quantite : 0,
        stock_compte: null,
      };
    });
    const { error: linesError } = await supabase.from('inventaire_lignes').insert(lignes);
    setSaving(false);
    if (linesError) { showToast('Erreur lignes: ' + linesError.message, 'error'); return; }
    showToast('Session d\u2019inventaire créée');
    setCreateOpen(false);
    onRefresh();
  };

  const openCount = (inv: InventaireWithRelations) => {
    const c: Record<string, string> = {};
    inv.inventaire_lignes?.forEach((l) => { c[l.produit_id] = l.stock_compte === null ? '' : String(l.stock_compte); });
    setCounts(c);
    setCountTarget(inv);
  };

  const saveCounts = async () => {
    if (!countTarget) return;
    if (!navigator.onLine) { showToast('L\u2019enregistrement du comptage nécessite une connexion internet', 'error'); return; }
    setSaving(true);
    try {
      for (const ligne of countTarget.inventaire_lignes || []) {
        const raw = counts[ligne.produit_id];
        if (raw === undefined || raw === '') continue;
        const val = parseInt(raw);
        if (isNaN(val) || val < 0) continue;
        const { error } = await supabase
          .from('inventaire_lignes')
          .update({ stock_compte: val })
          .eq('id', ligne.id);
        if (error) throw error;
      }
      showToast('Comptage enregistré');
      setCountTarget(null);
      onRefresh();
    } catch (e) {
      showToast('Erreur: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSaving(false);
    }
  };

  const validate = async (inv: InventaireWithRelations) => {
    if (!navigator.onLine) { showToast('La validation nécessite une connexion internet', 'error'); return; }
    const lignesNonComptees = (inv.inventaire_lignes || []).filter((l) => l.stock_compte === null);
    if (lignesNonComptees.length > 0) {
      showToast(`${lignesNonComptees.length} produit(s) non compté(s). Complétez le comptage d'abord.`, 'error');
      return;
    }
    setSaving(true);
    try {
      for (const ligne of inv.inventaire_lignes || []) {
        const ecart = (ligne.stock_compte ?? 0) - ligne.stock_theorique;
        if (ecart === 0) continue;
        // Ajustement: mouvement d'entrée (surplus) ou sortie (manquant) avec motif inventaire
        const { error: mvtError } = await supabase.from('mouvements').insert({
          produit_id: ligne.produit_id,
          type: ecart > 0 ? 'entree' : 'sortie',
          quantite: Math.abs(ecart),
          motif: 'Ajustement inventaire ' + inv.reference,
          reference: inv.reference,
        });
        if (mvtError) throw mvtError;
      }
      const { error: statutError } = await supabase
        .from('inventaires')
        .update({ statut: 'valide' as InventaireStatut, date_cloture: new Date().toISOString() })
        .eq('id', inv.id);
      if (statutError) throw statutError;
      showToast('Inventaire validé — stock ajusté selon les écarts');
      setViewTarget(null);
      onRefresh();
    } catch (e) {
      showToast('Erreur: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSaving(false);
    }
  };

  const cancelInventory = async (inv: InventaireWithRelations) => {
    const result = await writeRow('inventaires', 'update', { statut: 'annule' as InventaireStatut }, inv.id);
    if (result.offline) { showToast('Annulation enregistrée localement (hors-ligne)', 'info'); return; }
    if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    showToast('Inventaire annulé');
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('inventaires', 'delete', {}, deleteTarget.id);
    if (result.offline) showToast('Suppression enregistrée localement (hors-ligne)', 'info');
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else showToast('Inventaire supprimé');
    onRefresh();
  };

  const ecartTotal = (inv: InventaireWithRelations) => {
    return (inv.inventaire_lignes || []).reduce((sum, l) => {
      if (l.stock_compte === null) return sum;
      return sum + (l.stock_compte - l.stock_theorique);
    }, 0);
  };

  const totalSessions = inventaires.length;
  const sessionsEnCours = inventaires.filter((i) => i.statut === 'en_cours').length;
  const sessionsValidees = inventaires.filter((i) => i.statut === 'valide').length;
  const sessionsAnnulees = inventaires.filter((i) => i.statut === 'annule').length;

  return (
    <div className="space-y-6">
      {/* Content Header (Page header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <ClipboardCheck className="w-7 h-7 text-primary" />
            Inventaires physiques
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Comptage contradictoire, calcul d'écarts et validation des ajustements de stock
          </p>
        </div>
        {canCreate && (
          <button onClick={openCreate} className="btn-lte btn-lte-primary">
            <Plus className="w-4 h-4" /> Nouvelle session
          </button>
        )}
      </div>

      {/* Info Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          title="Total Sessions"
          value={totalSessions}
          icon={ClipboardCheck}
          variant="info"
          description="Toutes campagnes confondues"
        />
        <InfoBox
          title="En cours"
          value={sessionsEnCours}
          icon={Clock}
          variant="warning"
          description="Comptages à valider"
        />
        <InfoBox
          title="Clôturées"
          value={sessionsValidees}
          icon={CheckCircle}
          variant="success"
          description="Ajustements appliqués"
        />
        <InfoBox
          title="Annulées"
          value={sessionsAnnulees}
          icon={XCircle}
          variant="danger"
          description="Sessions abandonnées"
        />
      </div>

      {/* Sessions Table Card */}
      <Card
        title={`Registre des sessions d'inventaire (${filtered.length})`}
        icon={ClipboardCheck}
        variant="primary"
        outline
        tools={
          <div className="flex items-center gap-2">
            <div className="relative w-64 sm:w-80">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filtrer par référence..."
                className="form-control-lte pl-9 py-1 text-xs"
              />
            </div>
          </div>
        }
        noPadding
      >
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ClipboardCheck className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">Aucune session d'inventaire trouvée</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-adminlte">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3">Référence</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Site</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Lignes</th>
                  <th className="text-right px-4 py-3">Écart net</th>
                  <th className="text-center px-4 py-3">Statut</th>
                  <th className="text-left px-4 py-3 hidden md:table-cell">Date début</th>
                  <th className="text-right px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((inv) => {
                  const sc = statutColor(inv.statut);
                  const ecart = ecartTotal(inv);
                  const comptes = (inv.inventaire_lignes || []).filter((l) => l.stock_compte !== null).length;
                  return (
                    <tr key={inv.id}>
                      <td className="px-4 py-3 font-mono font-semibold text-xs text-primary">
                        {inv.reference}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell font-medium text-slate-700 dark:text-slate-300">
                        {inv.entrepots?.nom || 'Tous sites (global)'}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell text-right font-mono text-xs">
                        {comptes} / {inv.inventaire_lignes?.length || 0}
                      </td>
                      <td className="px-4 py-3 text-right font-bold text-xs">
                        {ecart > 0 ? (
                          <span className="text-emerald-600 dark:text-emerald-400">+{formatNumber(ecart)}</span>
                        ) : ecart < 0 ? (
                          <span className="text-red-600 dark:text-red-400">−{formatNumber(-ecart)}</span>
                        ) : (
                          <span className="text-slate-400">0</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />
                          {statutLabel(inv.statut)}
                        </span>
                      </td>
                      <td className="px-4 py-3 hidden md:table-cell text-xs text-slate-500">
                        {formatShortDate(inv.date_debut)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => setViewTarget(inv)}
                            className="btn-lte btn-lte-secondary btn-lte-sm"
                            title="Voir les détails"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          {canEdit && inv.statut === 'en_cours' && (
                            <button
                              onClick={() => openCount(inv)}
                              className="btn-lte btn-lte-success btn-lte-sm"
                              title="Saisir les comptages"
                            >
                              <ClipboardCheck className="w-3.5 h-3.5" /> Compter
                            </button>
                          )}
                          {canEdit && inv.statut === 'en_cours' && (
                            <button
                              onClick={() => cancelInventory(inv)}
                              className="btn-lte btn-lte-warning btn-lte-sm"
                              title="Annuler la session"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              onClick={() => setDeleteTarget(inv)}
                              className="btn-lte btn-lte-danger btn-lte-sm"
                              title="Supprimer définitivement"
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

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle session d'inventaire" size="lg">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Site concerné</label>
            <select value={entrepotId} onChange={(e) => setEntrepotId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
              <option value="">Tous les sites (stock global)</option>
              {entrepots.map((e) => <option key={e.id} value={e.id}>{e.nom}</option>)}
            </select>
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Produits à compter ({selectedProducts.size} sélectionné{selectedProducts.size > 1 ? 's' : ''})</label>
              <button onClick={selectAll} className="text-sm text-sky-600 font-medium hover:text-sky-700">Tout sélectionner</button>
            </div>
            <input type="text" value={productSearch} onChange={(e) => setProductSearch(e.target.value)} placeholder="Filtrer les produits..."
              className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 mb-2" />
            <div className="border border-slate-200 rounded-xl max-h-64 overflow-y-auto divide-y divide-slate-100">
              {productsToCount.map((p) => (
                <label key={p.id} className="flex items-center gap-3 px-3 py-2 hover:bg-slate-50 cursor-pointer">
                  <input type="checkbox" checked={selectedProducts.has(p.id)} onChange={() => toggleProduct(p.id)} className="w-4 h-4 accent-sky-600" />
                  <span className="flex-1 text-sm text-slate-900">{p.nom}</span>
                  <span className="text-xs text-slate-400 font-mono">{p.sku || '—'}</span>
                  <span className="text-xs text-slate-500">théorique: {p.quantite}</span>
                </label>
              ))}
              {productsToCount.length === 0 && <p className="px-3 py-4 text-sm text-slate-400 text-center">Aucun produit</p>}
            </div>
          </div>
          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
            <button onClick={save} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors shadow-sm disabled:opacity-50">
              {saving ? 'Création...' : 'Démarrer l\u2019inventaire'}
            </button>
          </div>
        </div>
      </Modal>

      {/* Count modal */}
      {countTarget && (
        <Modal open={true} onClose={() => setCountTarget(null)} title={`Comptage — ${countTarget.reference}`} size="lg">
          <div className="space-y-4">
            <p className="text-sm text-slate-500">Saisissez la quantité réellement comptée pour chaque produit. L'écart avec le stock théorique sera calculé automatiquement.</p>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Produit</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Théorique</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Compté</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(countTarget.inventaire_lignes || []).map((l) => {
                    const raw = counts[l.produit_id];
                    const compte = raw === '' || raw === undefined ? null : parseInt(raw);
                    const ecart = compte === null || isNaN(compte) ? null : compte - l.stock_theorique;
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2 text-slate-900">{l.produits?.nom || '—'}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{l.stock_theorique}</td>
                        <td className="px-4 py-2 text-right">
                          <input type="number" min="0" value={counts[l.produit_id] ?? ''} onChange={(e) => setCounts((prev) => ({ ...prev, [l.produit_id]: e.target.value }))}
                            className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500" placeholder="—" />
                        </td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {ecart === null ? <span className="text-slate-300">—</span>
                            : ecart > 0 ? <span className="text-emerald-600 inline-flex items-center gap-1"><TrendingUp className="w-3.5 h-3.5" />+{ecart}</span>
                            : ecart < 0 ? <span className="text-red-600 inline-flex items-center gap-1"><TrendingDown className="w-3.5 h-3.5" />{ecart}</span>
                            : <span className="text-slate-400 inline-flex items-center gap-1"><Minus className="w-3.5 h-3.5" />0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex items-center justify-end gap-3">
              <button onClick={() => setCountTarget(null)} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Fermer</button>
              <button onClick={saveCounts} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
                {saving ? 'Enregistrement...' : 'Enregistrer le comptage'}
              </button>
            </div>
          </div>
        </Modal>
      )}

      {/* View modal */}
      {viewTarget && (
        <Modal open={true} onClose={() => setViewTarget(null)} title={`Inventaire ${viewTarget.reference}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Site:</span> <span className="font-medium text-slate-900">{viewTarget.entrepots?.nom || 'Tous sites'}</span></div>
              <div><span className="text-slate-500">Début:</span> <span className="font-medium text-slate-900">{formatShortDate(viewTarget.date_debut)}</span></div>
              {viewTarget.date_cloture && <div><span className="text-slate-500">Clôture:</span> <span className="font-medium text-slate-900">{formatShortDate(viewTarget.date_cloture)}</span></div>}
            </div>
            <div className="border border-slate-200 rounded-xl overflow-hidden max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Produit</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Théorique</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Compté</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Écart</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(viewTarget.inventaire_lignes || []).map((l) => {
                    const ecart = l.stock_compte === null ? null : l.stock_compte - l.stock_theorique;
                    return (
                      <tr key={l.id}>
                        <td className="px-4 py-2 text-slate-900">{l.produits?.nom || '—'}</td>
                        <td className="px-4 py-2 text-right text-slate-600">{l.stock_theorique}</td>
                        <td className="px-4 py-2 text-right text-slate-900 font-medium">{l.stock_compte ?? '—'}</td>
                        <td className="px-4 py-2 text-right font-semibold">
                          {ecart === null ? <span className="text-slate-300">—</span>
                            : ecart > 0 ? <span className="text-emerald-600">+{ecart}</span>
                            : ecart < 0 ? <span className="text-red-600">{ecart}</span>
                            : <span className="text-slate-400">0</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {canEdit && viewTarget.statut === 'en_cours' && (
              <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                <p className="text-xs text-slate-500">La validation crée les mouvements d'ajustement pour chaque écart.</p>
                <button onClick={() => validate(viewTarget)} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
                  <CheckCircle2 className="w-4 h-4" /> {saving ? 'Validation...' : 'Valider et ajuster le stock'}
                </button>
              </div>
            )}
          </div>
        </Modal>
      )}

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Supprimer l'inventaire"
        message={`Supprimer la session ${deleteTarget?.reference} ? Les inventaires validés conservent leurs mouvements d'ajustement.`}
        confirmLabel="Supprimer"
      />
    </div>
  );
}
