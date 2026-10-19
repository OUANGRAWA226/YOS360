import { useState, useMemo } from 'react';
import { Plus, Search, Trash2, ShoppingCart, Eye, X, ArrowRight, PackageCheck, FileText, Printer } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { CommandeWithRelations, ProduitWithCategorie, Fournisseur, Client, CommandeItemWithProduit, Entreprise } from '@/lib/supabase';
import { writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatCurrency, formatDate, formatShortDate, generateReference, statutLabel, statutColor, TYPE_DOCUMENT_LABELS, nextNumeroDocument } from '@/lib/format';
import { printDocumentCommercial } from '@/lib/documents';

type Props = {
  commandes: CommandeWithRelations[];
  produits: ProduitWithCategorie[];
  fournisseurs: Fournisseur[];
  clients: Client[];
  entreprise: Entreprise | null;
  numerosFactures: string[];
  loading: boolean;
  onRefresh: () => void;
  role: Role | null;
};

type ItemType = {
  produit_id: string;
  quantite: string;
  prix_unitaire: string;
};

export function Commandes({ commandes, produits, fournisseurs, clients, entreprise, numerosFactures, loading, onRefresh, role }: Props) {
  const canCreate = can(role, 'commandes', 'create');
  const canEdit = can(role, 'commandes', 'edit');
  const canDelete = can(role, 'commandes', 'delete');
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [filterStatut, setFilterStatut] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [viewTarget, setViewTarget] = useState<CommandeWithRelations | null>(null);
  const [receiveTarget, setReceiveTarget] = useState<CommandeWithRelations | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<CommandeWithRelations | null>(null);

  // create form
  const [cmdType, setCmdType] = useState<'achat' | 'vente'>('vente');
  const [partnerId, setPartnerId] = useState('');
  const [dateLivraison, setDateLivraison] = useState('');
  const [dateEcheance, setDateEcheance] = useState('');
  const [typeDocument, setTypeDocument] = useState<'facture' | 'devis' | 'bon_livraison' | 'avoir'>('facture');
  const [note, setNote] = useState('');
  const [items, setItems] = useState<ItemType[]>([{ produit_id: '', quantite: '1', prix_unitaire: '0' }]);
  const [saving, setSaving] = useState(false);

  const filtered = useMemo(() => {
    return commandes.filter((c) => {
      const q = search.toLowerCase();
      const matchSearch = (c.reference || '').toLowerCase().includes(q) || (c.fournisseurs?.nom || '').toLowerCase().includes(q) || (c.clients?.nom || '').toLowerCase().includes(q);
      const matchType = filterType === 'all' || c.type === filterType;
      const matchStatut = filterStatut === 'all' || c.statut === filterStatut;
      return matchSearch && matchType && matchStatut;
    });
  }, [commandes, search, filterType, filterStatut]);

  const openCreate = () => {
    setCmdType('vente');
    setPartnerId('');
    setDateLivraison('');
    setDateEcheance('');
    setTypeDocument('facture');
    setNote('');
    setItems([{ produit_id: '', quantite: '1', prix_unitaire: '0' }]);
    setCreateOpen(true);
  };

  const updateItem = (idx: number, field: keyof ItemType, value: string) => {
    setItems((prev) => prev.map((it, i) => {
      if (i !== idx) return it;
      const updated = { ...it, [field]: value };
      if (field === 'produit_id') {
        const p = produits.find((pr) => pr.id === value);
        if (p) {
          updated.prix_unitaire = cmdType === 'achat' ? String(p.prix_unitaire) : String(p.prix_vente);
        }
      }
      return updated;
    }));
  };

  const addItem = () => setItems((prev) => [...prev, { produit_id: '', quantite: '1', prix_unitaire: '0' }]);
  const removeItem = (idx: number) => setItems((prev) => prev.filter((_, i) => i !== idx));

  const totalCmd = items.reduce((sum, it) => sum + (parseFloat(it.quantite) || 0) * (parseFloat(it.prix_unitaire) || 0), 0);

  const save = async () => {
    if (!partnerId) { showToast('Veuillez sélectionner un partenaire', 'error'); return; }
    const validItems = items.filter((it) => it.produit_id && parseInt(it.quantite) > 0);
    if (validItems.length === 0) { showToast('Ajoutez au moins un produit', 'error'); return; }

    if (!navigator.onLine) {
      showToast('La création de commande nécessite une connexion internet. Vos autres modifications restent enregistrées localement.', 'error');
      return;
    }
    setSaving(true);

    const reference = generateReference(cmdType === 'achat' ? 'ACH' : 'VEN');
    const tvaTaux = entreprise?.tva_taux ?? 18;
    const tvaActive = entreprise?.tva_active !== false;
    const ht = totalCmd;
    const tva = tvaActive ? (ht * tvaTaux) / 100 : 0;
    const numeroDoc = nextNumeroDocument(typeDocument, numerosFactures);
    const { data: cmdData, error: cmdError } = await supabase.from('commandes').insert({
      type: cmdType,
      fournisseur_id: cmdType === 'achat' ? partnerId : null,
      client_id: cmdType === 'vente' ? partnerId : null,
      statut: 'en_attente',
      reference,
      montant_total: ht + tva,
      montant_ht: ht,
      montant_tva: tvaActive ? tva : 0,
      tva_taux: tvaActive ? tvaTaux : null,
      type_document: typeDocument,
      numero_document: numeroDoc,
      date_livraison: dateLivraison || null,
      date_echeance: dateEcheance ? new Date(dateEcheance + 'T12:00:00').toISOString() : null,
      note: note.trim() || null,
    }).select().single();

    if (cmdError) {
      setSaving(false);
      showToast('Erreur: ' + cmdError.message, 'error');
      return;
    }

    const itemPayload = validItems.map((it) => ({
      commande_id: cmdData.id,
      produit_id: it.produit_id,
      quantite: parseInt(it.quantite),
      prix_unitaire: parseFloat(it.prix_unitaire) || 0,
      sous_total: (parseFloat(it.quantite) || 0) * (parseFloat(it.prix_unitaire) || 0),
    }));

    const { error: itemError } = await supabase.from('commande_items').insert(itemPayload);
    setSaving(false);
    if (itemError) {
      showToast('Erreur: ' + itemError.message, 'error');
      return;
    }
    showToast('Commande créée avec succès');
    setCreateOpen(false);
    onRefresh();
  };

  const updateStatut = async (cmd: CommandeWithRelations, statut: string) => {
    const result = await writeRow('commandes', 'update', { statut }, cmd.id);
    if (result.offline) { showToast('Statut enregistré localement (hors-ligne)', 'info'); return; }
    if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    showToast('Statut mis à jour');
    onRefresh();
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const result = await writeRow('commandes', 'delete', {}, deleteTarget.id);
    if (result.offline) { showToast('Suppression enregistrée localement (hors-ligne)', 'info'); }
    else if (result.error) { showToast('Erreur: ' + result.error, 'error'); return; }
    else { showToast('Commande supprimée'); }
    onRefresh();
  };

  const statutFlow: Record<string, string[]> = {
    achat: ['en_attente', 'confirmee', 'recue', 'annulee'],
    vente: ['en_attente', 'confirmee', 'expediee', 'annulee'],
  };

  const quantiteDejaRecue = (cmd: CommandeWithRelations) =>
    (cmd.commande_items || []).reduce((s, it) => s + (it.quantite_recue || 0), 0);

  const quantiteCommandee = (cmd: CommandeWithRelations) =>
    (cmd.commande_items || []).reduce((s, it) => s + it.quantite, 0);

  const peutReceptionner = (cmd: CommandeWithRelations) =>
    cmd.type === 'achat' && canEdit && quantiteDejaRecue(cmd) < quantiteCommandee(cmd);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Commandes</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">{commandes.length} commande{commandes.length > 1 ? 's' : ''}</p>
        </div>
        {canCreate && <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-xl font-medium hover:bg-sky-700 transition-colors shadow-sm shadow-sky-600/20">
          <Plus className="w-5 h-5" /> Nouvelle commande
        </button>}
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par référence, partenaire..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={filterType} onChange={(e) => setFilterType(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
          <option value="all">Tous types</option>
          <option value="achat">Achats</option>
          <option value="vente">Ventes</option>
        </select>
        <select value={filterStatut} onChange={(e) => setFilterStatut(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
          <option value="all">Tous statuts</option>
          <option value="en_attente">En attente</option>
          <option value="confirmee">Confirmée</option>
          <option value="expediee">Expédiée</option>
          <option value="recue">Reçue</option>
          <option value="annulee">Annulée</option>
        </select>
      </div>

      {loading ? (
        <div className="p-8 space-y-3">
          {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-12 text-center">
          <ShoppingCart className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-500">Aucune commande trouvée</p>
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 font-semibold text-slate-600">Référence</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Type</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Partenaire</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Statut</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Montant</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Date</th>
                  <th className="text-right px-6 py-3 font-semibold text-slate-600">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((c) => {
                  const sc = statutColor(c.statut);
                  return (
                    <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-6 py-3 font-mono text-xs text-slate-700">
                        {c.numero_document || c.reference || '—'}
                        {c.type_document && (
                          <span className="block text-[10px] uppercase tracking-wide text-slate-400 font-sans">{TYPE_DOCUMENT_LABELS[c.type_document]}</span>
                        )}
                      </td>
                      <td className="px-4 py-3 hidden sm:table-cell">
                        <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${c.type === 'achat' ? 'bg-sky-50 text-sky-700' : 'bg-emerald-50 text-emerald-700'}`}>
                          {c.type === 'achat' ? 'Achat' : 'Vente'}
                        </span>
                      </td>
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {c.type === 'achat' ? c.fournisseurs?.nom || '—' : c.clients?.nom || '—'}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot}`} />{statutLabel(c.statut)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell font-semibold text-slate-900">{formatCurrency(c.montant_total)}</td>
                      <td className="px-4 py-3 hidden md:table-cell text-slate-500 text-xs">{formatShortDate(c.date_commande)}</td>
                      <td className="px-6 py-3">
                        <div className="flex items-center justify-end gap-1">
                          <button onClick={() => setViewTarget(c)} className="p-2 rounded-lg hover:bg-sky-50 text-slate-400 hover:text-sky-600 transition-colors" title="Voir détails"><Eye className="w-4 h-4" /></button>
                          <button
                            onClick={() => printDocumentCommercial(c.type_document || 'facture', c, entreprise)}
                            className="p-2 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                            title={`Imprimer ${TYPE_DOCUMENT_LABELS[c.type_document || 'facture']}`}
                          >
                            <Printer className="w-4 h-4" />
                          </button>
                          {peutReceptionner(c) && (
                            <button onClick={() => setReceiveTarget(c)} className="p-2 rounded-lg hover:bg-emerald-50 text-slate-400 hover:text-emerald-600 transition-colors" title="Réceptionner">
                              <PackageCheck className="w-4 h-4" />
                            </button>
                          )}
                          {canDelete && <button onClick={() => setDeleteTarget(c)} className="p-2 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Supprimer"><Trash2 className="w-4 h-4" /></button>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Create modal */}
      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Nouvelle commande" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <button onClick={() => { setCmdType('vente'); setPartnerId(''); }} className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${cmdType === 'vente' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Vente (Client)</button>
            <button onClick={() => { setCmdType('achat'); setPartnerId(''); }} className={`px-4 py-3 rounded-xl font-medium text-sm transition-all ${cmdType === 'achat' ? 'bg-sky-600 text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>Achat (Fournisseur)</button>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">{cmdType === 'achat' ? 'Fournisseur *' : 'Client *'}</label>
            <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
              <option value="">Sélectionner...</option>
              {(cmdType === 'achat' ? fournisseurs : clients).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Date de livraison prévue</label>
            <input type="date" value={dateLivraison} onChange={(e) => setDateLivraison(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Type de document</label>
              <select value={typeDocument} onChange={(e) => setTypeDocument(e.target.value as 'facture' | 'devis' | 'bon_livraison' | 'avoir')} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                {(['facture', 'devis', 'bon_livraison', 'avoir'] as const).map((t) => (
                  <option key={t} value={t}>{TYPE_DOCUMENT_LABELS[t]}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Numéro attribué : {nextNumeroDocument(typeDocument, numerosFactures)}</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Échéance de paiement</label>
              <input type="date" value={dateEcheance} onChange={(e) => setDateEcheance(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-slate-700">Produits</label>
              <button onClick={addItem} className="text-sm text-sky-600 font-medium hover:text-sky-700 flex items-center gap-1"><Plus className="w-4 h-4" /> Ajouter ligne</button>
            </div>
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {items.map((it, idx) => (
                <div key={idx} className="flex items-center gap-2 bg-slate-50 rounded-xl p-2">
                  <select value={it.produit_id} onChange={(e) => updateItem(idx, 'produit_id', e.target.value)} className="flex-1 px-2 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white min-w-0">
                    <option value="">Produit...</option>
                    {produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
                  </select>
                  <input type="number" value={it.quantite} onChange={(e) => updateItem(idx, 'quantite', e.target.value)} min="1" className="w-16 px-2 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" placeholder="Qté" />
                  <input type="number" step="0.01" value={it.prix_unitaire} onChange={(e) => updateItem(idx, 'prix_unitaire', e.target.value)} className="w-20 px-2 py-2 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" placeholder="Prix" />
                  <button onClick={() => removeItem(idx)} className="p-1.5 rounded-lg hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"><X className="w-4 h-4" /></button>
                </div>
              ))}
            </div>
            <div className="mt-2 text-right text-sm font-semibold text-slate-900">Total: {formatCurrency(totalCmd)}</div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Note</label>
            <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            <button onClick={() => setCreateOpen(false)} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
            <button onClick={save} disabled={saving} className="px-4 py-2.5 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors shadow-sm disabled:opacity-50">{saving ? 'Enregistrement...' : 'Créer la commande'}</button>
          </div>
        </div>
      </Modal>

      {/* View modal */}
      {viewTarget && (
        <Modal open={true} onClose={() => setViewTarget(null)} title={`Commande ${viewTarget.reference || ''}`} size="lg">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div><span className="text-slate-500">Type:</span> <span className="font-medium text-slate-900">{viewTarget.type === 'achat' ? 'Achat fournisseur' : 'Vente client'}</span></div>
              <div><span className="text-slate-500">Partenaire:</span> <span className="font-medium text-slate-900">{viewTarget.type === 'achat' ? viewTarget.fournisseurs?.nom : viewTarget.clients?.nom}</span></div>
              <div><span className="text-slate-500">Date:</span> <span className="font-medium text-slate-900">{formatDate(viewTarget.date_commande)}</span></div>
              {viewTarget.date_echeance && <div><span className="text-slate-500">Échéance:</span> <span className="font-medium text-slate-900">{formatShortDate(viewTarget.date_echeance)}</span></div>}
              {viewTarget.type_document && <div><span className="text-slate-500">Document:</span> <span className="font-medium text-slate-900">{TYPE_DOCUMENT_LABELS[viewTarget.type_document]} {viewTarget.numero_document ? `n° ${viewTarget.numero_document}` : ''}</span></div>}
              {viewTarget.date_livraison && <div><span className="text-slate-500">Livraison:</span> <span className="font-medium text-slate-900">{formatShortDate(viewTarget.date_livraison)}</span></div>}
            </div>

            <div className="flex items-center gap-2">
              {statutFlow[viewTarget.type].map((s, i) => {
                const currentIdx = statutFlow[viewTarget.type].indexOf(viewTarget.statut);
                const isActive = i <= currentIdx && viewTarget.statut !== 'annulee';
                return (
                  <div key={s} className="flex items-center flex-1">
                    <button
                      onClick={() => canEdit && updateStatut(viewTarget, s)}
                      disabled={!canEdit}
                      className={`flex-1 text-xs px-2 py-1.5 rounded-lg font-medium transition-all ${
                        isActive ? statutColor(s).bg + ' ' + statutColor(s).text : 'bg-slate-100 text-slate-400'
                      } ${s === viewTarget.statut ? 'ring-2 ring-offset-1 ring-slate-300' : ''}`}
                    >
                      {statutLabel(s)}
                    </button>
                    {i < statutFlow[viewTarget.type].length - 1 && <ArrowRight className="w-3 h-3 text-slate-300 mx-0.5" />}
                  </div>
                );
              })}
            </div>

            <div className="border border-slate-200 rounded-xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b border-slate-200">
                  <tr>
                    <th className="text-left px-4 py-2 font-semibold text-slate-600">Produit</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Qté</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Prix unit.</th>
                    <th className="text-right px-4 py-2 font-semibold text-slate-600">Sous-total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {viewTarget.commande_items?.map((it: CommandeItemWithProduit) => (
                    <tr key={it.id}>
                      <td className="px-4 py-2 text-slate-900">{it.produits?.nom || '—'}</td>
                      <td className="px-4 py-2 text-right text-slate-700">
                        {it.quantite}
                        {viewTarget.type === 'achat' && (it.quantite_recue || 0) > 0 && (
                          <span className="ml-1 text-xs text-emerald-600 font-medium">({it.quantite_recue} reçus)</span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-right text-slate-700">{formatCurrency(it.prix_unitaire)}</td>
                      <td className="px-4 py-2 text-right font-semibold text-slate-900">{formatCurrency(it.sous_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-200 bg-slate-50">
                    <td colSpan={3} className="px-4 py-3 text-right font-semibold text-slate-700">Total</td>
                    <td className="px-4 py-3 text-right font-bold text-slate-900 text-base">{formatCurrency(viewTarget.montant_total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            {viewTarget.note && <div className="text-sm text-slate-600 bg-slate-50 rounded-xl p-3"><span className="font-medium text-slate-700">Note: </span>{viewTarget.note}</div>}

            <button
              onClick={() => printDocumentCommercial(viewTarget.type_document || 'facture', viewTarget, entreprise)}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-slate-800 text-white rounded-xl text-sm font-medium hover:bg-slate-900 transition-colors"
            >
              <FileText className="w-4 h-4" /> Imprimer / PDF — {TYPE_DOCUMENT_LABELS[viewTarget.type_document || 'facture']}
            </button>
          </div>
        </Modal>
      )}

      {/* Receive modal (réception partielle) */}
      {receiveTarget && (
        <ReceiveModal
          commande={receiveTarget}
          onClose={() => setReceiveTarget(null)}
          onDone={() => { setReceiveTarget(null); onRefresh(); }}
        />
      )}

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} title="Supprimer la commande" message={`Voulez-vous vraiment supprimer la commande ${deleteTarget?.reference} ?`} confirmLabel="Supprimer" />
    </div>
  );
}

function ReceiveModal({ commande, onClose, onDone }: {
  commande: CommandeWithRelations;
  onClose: () => void;
  onDone: () => void;
}) {
  const [qty, setQty] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const restantTotal = (commande.commande_items || []).reduce((s, it) => s + Math.max(it.quantite - (it.quantite_recue || 0), 0), 0);

  const receive = async () => {
    if (!navigator.onLine) { showToast('La réception nécessite une connexion internet', 'error'); return; }
    setSaving(true);
    try {
      let entrees = 0;
      const updates: { id: string; quantite_recue: number }[] = [];
      for (const it of commande.commande_items || []) {
        const reste = Math.max(it.quantite - (it.quantite_recue || 0), 0);
        if (reste === 0) continue;
        const raw = qty[it.id];
        const val = raw === undefined || raw === '' ? 0 : parseInt(raw);
        if (isNaN(val) || val < 0) continue;
        if (val > reste) throw new Error(`Quantité supérieure au reliquat pour un produit (${reste} max)`);
        if (val > 0) {
          const { error } = await supabase.from('mouvements').insert({
            produit_id: it.produit_id,
            type: 'entree',
            quantite: val,
            motif: 'Réception commande ' + (commande.reference || ''),
            reference: commande.reference,
            prix_unitaire: it.prix_unitaire,
          });
          if (error) throw error;
          entrees++;
        }
        updates.push({ id: it.id, quantite_recue: (it.quantite_recue || 0) + val });
      }
      for (const u of updates) {
        const { error } = await supabase.from('commande_items').update({ quantite_recue: u.quantite_recue }).eq('id', u.id);
        if (error) throw error;
      }
      const nouveauTotal = updates.reduce((s, u) => s + u.quantite_recue, 0);
      const totalCmd = (commande.commande_items || []).reduce((s, it) => s + it.quantite, 0);
      if (nouveauTotal >= totalCmd) {
        const { error } = await supabase.from('commandes').update({ statut: 'recue' }).eq('id', commande.id);
        if (error) throw error;
        showToast(`Réception complète — ${entrees} entrée(s) de stock enregistrée(s)`);
      } else {
        showToast(`Réception partielle enregistrée — reliquat suivi (${totalCmd - nouveauTotal} unité(s) restante(s))`);
      }
      onDone();
    } catch (e) {
      showToast('Erreur: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={true} onClose={onClose} title={`Réception — ${commande.reference || ''}`} size="lg">
      <div className="space-y-4">
        <p className="text-sm text-slate-500">Saisissez les quantités réellement reçues. Le reliquat reste suivi sur la commande (80 reçus sur 100 = 20 en attente).</p>
        <div className="border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 border-b border-slate-200">
              <tr>
                <th className="text-left px-4 py-2 font-semibold text-slate-600">Produit</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Commandé</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Déjà reçu</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Reliquat</th>
                <th className="text-right px-4 py-2 font-semibold text-slate-600">Recevoir</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {(commande.commande_items || []).map((it) => {
                const recu = it.quantite_recue || 0;
                const reste = Math.max(it.quantite - recu, 0);
                return (
                  <tr key={it.id} className={reste === 0 ? 'opacity-50' : ''}>
                    <td className="px-4 py-2 text-slate-900">{it.produits?.nom || '—'}</td>
                    <td className="px-4 py-2 text-right text-slate-700">{it.quantite}</td>
                    <td className="px-4 py-2 text-right text-emerald-700 font-medium">{recu}</td>
                    <td className={`px-4 py-2 text-right font-semibold ${reste > 0 ? 'text-amber-700' : 'text-slate-400'}`}>{reste}</td>
                    <td className="px-4 py-2 text-right">
                      <input
                        type="number"
                        min="0"
                        max={reste}
                        value={qty[it.id] ?? ''}
                        onChange={(e) => setQty((prev) => ({ ...prev, [it.id]: e.target.value }))}
                        disabled={reste === 0}
                        placeholder="0"
                        className="w-20 px-2 py-1.5 rounded-lg border border-slate-200 text-sm text-right focus:outline-none focus:ring-2 focus:ring-sky-500 disabled:bg-slate-50"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-slate-400">Reliquat total : {restantTotal} unité(s). Chaque quantité reçue crée automatiquement une entrée de stock valorisée au prix d'achat.</p>
        <div className="flex items-center justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2.5 text-sm font-medium text-slate-700 rounded-xl hover:bg-slate-100 transition-colors">Annuler</button>
          <button onClick={receive} disabled={saving} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors shadow-sm disabled:opacity-50">
            <PackageCheck className="w-4 h-4" /> {saving ? 'Réception...' : 'Enregistrer la réception'}
          </button>
        </div>
      </div>
    </Modal>
  );
}
