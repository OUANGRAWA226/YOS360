import { useState, useMemo } from 'react';
import { Search, ShieldCheck, Pencil, PlusCircle, Trash2, Database } from 'lucide-react';
import type { JournalAudit } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { fetchTable } from '@/lib/dataLayer';

const TABLE_LABELS: Record<string, string> = {
  produits: 'Produits',
  mouvements: 'Mouvements',
  categories: 'Catégories',
  fournisseurs: 'Fournisseurs',
  clients: 'Clients',
  commandes: 'Commandes',
  commande_items: 'Lignes de commande',
  profiles: 'Utilisateurs',
};

const FIELD_LABELS: Record<string, string> = {
  nom: 'Nom', sku: 'SKU', quantite: 'Quantité', seuil_alerte: 'Seuil d\'alerte',
  prix_unitaire: 'Prix d\'achat', prix_vente: 'Prix de vente', statut: 'Statut',
  role: 'Rôle', categorie_id: 'Catégorie', fournisseur_id: 'Fournisseur',
  client_id: 'Client', montant_total: 'Montant total', emplacement: 'Emplacement',
  type: 'Type', motif: 'Motif', email: 'Email', nom_complet: 'Nom complet',
};

export function Audit() {
  const [entries, setEntries] = useState<JournalAudit[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterTable, setFilterTable] = useState('all');
  const [filterAction, setFilterAction] = useState('all');

  useMemo(() => {
    setLoading(true);
    fetchTable<JournalAudit>('journal_audit', '*', { column: 'created_at', ascending: false }, 500)
      .then((rows) => { setEntries(rows); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    return entries.filter((e) => {
      const q = search.toLowerCase();
      const matchSearch = (e.user_email || '').toLowerCase().includes(q) ||
        (e.champ || '').toLowerCase().includes(q) ||
        (e.ancienne_valeur || '').toLowerCase().includes(q) ||
        (e.nouvelle_valeur || '').toLowerCase().includes(q);
      const matchTable = filterTable === 'all' || e.table_name === filterTable;
      const matchAction = filterAction === 'all' || e.action === filterAction;
      return matchSearch && matchTable && matchAction;
    });
  }, [entries, search, filterTable, filterAction]);

  const actionIcon = (action: string) => {
    const cls = 'w-4 h-4';
    if (action === 'INSERT') return <PlusCircle className={`${cls} text-emerald-600`} />;
    if (action === 'DELETE') return <Trash2 className={`${cls} text-red-600`} />;
    return <Pencil className={`${cls} text-sky-600`} />;
  };

  const actionLabel = (action: string) => ({
    INSERT: 'Création',
    UPDATE: 'Modification',
    DELETE: 'Suppression',
  }[action] ?? action);

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Journal d'audit</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Qui a modifié quoi, quand, avec les valeurs avant/après</p>
        </div>
        <div className="inline-flex items-center gap-2 text-sm text-slate-600 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Traçabilité active
        </div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input type="text" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher par utilisateur, champ, valeur..." className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
        </div>
        <select value={filterTable} onChange={(e) => setFilterTable(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
          <option value="all">Toutes les tables</option>
          {Object.entries(TABLE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={filterAction} onChange={(e) => setFilterAction(e.target.value)} className="px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
          <option value="all">Toutes actions</option>
          <option value="INSERT">Créations</option>
          <option value="UPDATE">Modifications</option>
          <option value="DELETE">Suppressions</option>
        </select>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(6)].map((_, i) => <div key={i} className="h-12 bg-slate-100 rounded-lg animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Database className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500">Aucune entrée dans le journal</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="text-left px-6 py-3 font-semibold text-slate-600">Action</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Utilisateur</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Élément</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Détail</th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((e) => (
                  <tr key={e.id} className="hover:bg-slate-50 transition-colors align-top">
                    <td className="px-6 py-3">
                      <div className="flex items-center gap-2">
                        {actionIcon(e.action)}
                        <span className="font-medium text-slate-900 whitespace-nowrap">{actionLabel(e.action)}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-7 h-7 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-semibold text-slate-600">
                          {(e.user_email || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-slate-700 text-xs">{e.user_email || 'Système'}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium text-slate-900">{TABLE_LABELS[e.table_name] ?? e.table_name}</span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {e.action === 'UPDATE' ? (
                        <span>
                          <span className="font-medium text-slate-800">{FIELD_LABELS[e.champ ?? ''] ?? e.champ}</span>
                          {' : '}
                          <span className="text-red-600 line-through decoration-red-300">{e.ancienne_valeur || '(vide)'}</span>
                          {' → '}
                          <span className="text-emerald-700 font-medium">{e.nouvelle_valeur || '(vide)'}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500">
                          {e.action === 'INSERT' ? 'Élément créé' : 'Élément supprimé'}
                          {e.donnees && typeof e.donnees === 'object' && 'nom' in (e.donnees as Record<string, unknown>)
                            ? ` — « ${(e.donnees as Record<string, unknown>).nom} »`
                            : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500 whitespace-nowrap">{formatDate(e.created_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
