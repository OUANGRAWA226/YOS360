import { useState, useMemo } from 'react';
import { Search, ShieldCheck, Pencil, PlusCircle, Trash2, Database, History, Activity } from 'lucide-react';
import type { JournalAudit } from '@/lib/supabase';
import { formatDate } from '@/lib/format';
import { fetchTable } from '@/lib/dataLayer';
import { InfoBox, Card } from '@/components/adminlte';

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

  const totalEvents = entries.length;
  const updates = entries.filter((e) => e.action === 'UPDATE').length;
  const inserts = entries.filter((e) => e.action === 'INSERT').length;
  const deletes = entries.filter((e) => e.action === 'DELETE').length;

  return (
    <div className="space-y-6">
      {/* Content Header (Page header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <History className="w-7 h-7 text-primary" />
            Journal d'audit
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Traçabilité exhaustive et horodatée des modifications : qui, quoi, quand et valeurs avant/après
          </p>
        </div>
        <div className="inline-flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 rounded-lg px-3 py-2">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Sécurité & Traçabilité Active
        </div>
      </div>

      {/* AdminLTE Info-Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          title="Événements Audités"
          value={totalEvents}
          icon={Activity}
          variant="info"
          description="Historique des opérations"
        />
        <InfoBox
          title="Modifications"
          value={updates}
          icon={Pencil}
          variant="warning"
          description="Valeurs actualisées"
        />
        <InfoBox
          title="Créations"
          value={inserts}
          icon={PlusCircle}
          variant="success"
          description="Nouveaux enregistrements"
        />
        <InfoBox
          title="Suppressions"
          value={deletes}
          icon={Trash2}
          variant="danger"
          description="Lignes supprimées"
        />
      </div>

      {/* Table Card */}
      <Card
        title={`Registre d'audit système (${filtered.length})`}
        icon={Database}
        variant="primary"
        outline
        tools={
          <div className="flex flex-col sm:flex-row items-center gap-2">
            <div className="relative w-48 sm:w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Utilisateur, champ, valeur..."
                className="form-control-lte pl-9 py-1 text-xs"
              />
            </div>
            <select
              value={filterTable}
              onChange={(e) => setFilterTable(e.target.value)}
              className="form-control-lte py-1 text-xs w-36"
            >
              <option value="all">Toutes tables</option>
              {Object.entries(TABLE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              className="form-control-lte py-1 text-xs w-32"
            >
              <option value="all">Toutes actions</option>
              <option value="INSERT">Créations</option>
              <option value="UPDATE">Modifications</option>
              <option value="DELETE">Suppressions</option>
            </select>
          </div>
        }
        noPadding
      >
        {loading ? (
          <div className="p-8 space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Database className="w-12 h-12 text-slate-300 dark:text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-500">Aucune entrée dans le journal d'audit</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-adminlte">
              <thead>
                <tr>
                  <th className="text-left px-4 py-3">Action</th>
                  <th className="text-left px-4 py-3">Utilisateur</th>
                  <th className="text-left px-4 py-3">Module / Table</th>
                  <th className="text-left px-4 py-3">Détail des Modifications</th>
                  <th className="text-left px-4 py-3 hidden sm:table-cell">Date & Heure</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((e) => (
                  <tr key={e.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1.5">
                        {actionIcon(e.action)}
                        <span
                          className={`badge-adminlte ${
                            e.action === 'INSERT'
                              ? 'bg-success-subtle text-success border border-success/20'
                              : e.action === 'DELETE'
                              ? 'bg-danger-subtle text-danger border border-danger/20'
                              : 'bg-primary-subtle text-primary border border-primary/20'
                          }`}
                        >
                          {actionLabel(e.action)}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold text-slate-700 dark:text-slate-300">
                          {(e.user_email || '?').slice(0, 2).toUpperCase()}
                        </div>
                        <span className="text-xs font-medium text-slate-700 dark:text-slate-300">
                          {e.user_email || 'Système'}
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="badge-adminlte bg-secondary-subtle text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700 font-mono text-[11px]">
                        {TABLE_LABELS[e.table_name] ?? e.table_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {e.action === 'UPDATE' ? (
                        <div>
                          <span className="font-bold text-slate-800 dark:text-slate-200">
                            {FIELD_LABELS[e.champ ?? ''] ?? e.champ}
                          </span>
                          {' : '}
                          <span className="text-red-600 dark:text-red-400 line-through decoration-red-400/60 font-mono">
                            {e.ancienne_valeur || '(vide)'}
                          </span>
                          {' → '}
                          <span className="text-emerald-700 dark:text-emerald-400 font-bold font-mono">
                            {e.nouvelle_valeur || '(vide)'}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-500">
                          {e.action === 'INSERT' ? 'Enregistrement créé' : 'Enregistrement supprimé'}
                          {e.donnees &&
                          typeof e.donnees === 'object' &&
                          'nom' in (e.donnees as Record<string, unknown>)
                            ? ` — « ${(e.donnees as Record<string, unknown>).nom} »`
                            : ''}
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 hidden sm:table-cell text-xs text-slate-500 whitespace-nowrap font-mono">
                      {formatDate(e.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
