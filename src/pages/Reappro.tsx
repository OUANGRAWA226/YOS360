import { useState, useMemo } from 'react';
import { ShoppingCart, TrendingDown, AlertTriangle, PackagePlus, Wand2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ProduitWithCategorie, Fournisseur, Commande } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { formatCurrency, formatNumber, generateReference } from '@/lib/format';
import { can, type Role } from '@/lib/permissions';

type Props = {
  produits: ProduitWithCategorie[];
  fournisseurs: Fournisseur[];
  commandes: Commande[];
  role: Role | null;
  onRefresh: () => void;
};

type LigneSuggeree = {
  produit: ProduitWithCategorie;
  manquant: number;
  couvertureJours: number | null;
  quantiteSuggeree: number;
};

export function Reappro({ produits, fournisseurs, commandes, role, onRefresh }: Props) {
  const canCreate = can(role, 'commandes', 'create');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [fournisseurId, setFournisseurId] = useState('');
  const [creating, setCreating] = useState(false);

  // Produits sous le seuil d'alerte, triés par criticité (rupture d'abord, puis ratio stock/seuil).
  const suggestions = useMemo<LigneSuggeree[]>(() => {
    return produits
      .filter((p) => p.quantite <= p.seuil_alerte)
      .map((p) => {
        const manquant = Math.max(p.seuil_alerte - p.quantite, 0);
        const suggeree = p.quantite_economique > 0
          ? p.quantite_economique
          : Math.max(Math.ceil((p.seuil_alerte * 2 - p.quantite) / 1), 0);
        // Couverture: à partir de l'historique des commandes vente récentes on estime grossièrement
        const cmdOuvertes = commandes.filter((c) => c.type === 'achat' && c.statut !== 'annulee' && c.statut !== 'recue');
        void cmdOuvertes;
        return {
          produit: p,
          manquant,
          couvertureJours: p.quantite === 0 ? 0 : null,
          quantiteSuggeree: Math.max(suggeree, manquant, 1),
        };
      })
      .sort((a, b) => a.produit.quantite - b.produit.quantite || b.manquant - a.manquant);
  }, [produits, commandes]);

  const enCommande = useMemo(() => {
    // Produits déjà présents sur des commandes d'achat non reçues
    const ids = new Set<string>();
    commandes
      .filter((c) => c.type === 'achat' && (c.statut === 'en_attente' || c.statut === 'confirmee'))
      .forEach((c) => {
        const items = (c as unknown as { commande_items?: { produit_id: string | null }[] }).commande_items;
        items?.forEach((it) => { if (it.produit_id) ids.add(it.produit_id); });
      });
    return ids;
  }, [commandes]);

  const totalEstime = suggestions
    .filter((s) => selected.has(s.produit.id))
    .reduce((sum, s) => sum + s.quantiteSuggeree * Number(s.produit.prix_unitaire || s.produit.cmup), 0);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllCritical = () => {
    setSelected(new Set(suggestions.filter((s) => s.produit.quantite === 0 || enCommande.size === 0 ? s.produit.quantite === 0 : false).map((s) => s.produit.id)));
  };

  const genererBon = async () => {
    if (!fournisseurId) { showToast('Sélectionnez un fournisseur', 'error'); return; }
    if (selected.size === 0) { showToast('Sélectionnez au moins un produit', 'error'); return; }
    if (!navigator.onLine) { showToast('La génération du bon nécessite une connexion internet', 'error'); return; }
    setCreating(true);
    try {
      const lignes = suggestions.filter((s) => selected.has(s.produit.id));
      let total = 0;
      const items = lignes.map((s) => {
        const prix = Number(s.produit.prix_unitaire || s.produit.cmup || 0);
        const sousTotal = prix * s.quantiteSuggeree;
        total += sousTotal;
        return { produit_id: s.produit.id, quantite: s.quantiteSuggeree, prix_unitaire: prix, sous_total: sousTotal };
      });
      const { data: cmd, error: cmdError } = await supabase
        .from('commandes')
        .insert({
          type: 'achat',
          fournisseur_id: fournisseurId,
          statut: 'en_attente',
          reference: generateReference('ACH'),
          montant_total: total,
          note: 'Généré automatiquement depuis le réapprovisionnement intelligent',
        })
        .select()
        .single();
      if (cmdError) throw cmdError;
      const { error: itemsError } = await supabase.from('commande_items').insert(
        items.map((it) => ({ ...it, commande_id: cmd.id }))
      );
      if (itemsError) throw itemsError;
      showToast(`Bon de commande créé (${lignes.length} produit${lignes.length > 1 ? 's' : ''})`);
      setSelected(new Set());
      onRefresh();
    } catch (e) {
      showToast('Erreur: ' + (e instanceof Error ? e.message : String(e)), 'error');
    } finally {
      setCreating(false);
    }
  };

  const ruptures = suggestions.filter((s) => s.produit.quantite === 0).length;
  const alertes = suggestions.length - ruptures;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Réapprovisionnement intelligent</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-1">Seuils minimum, quantités suggérées, bon de commande en un clic</p>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center"><AlertTriangle className="w-5 h-5 text-red-600" /></div>
          <div><p className="text-sm text-slate-500">Ruptures</p><p className="text-xl font-bold text-slate-900">{ruptures}</p></div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center"><TrendingDown className="w-5 h-5 text-amber-600" /></div>
          <div><p className="text-sm text-slate-500">Stocks faibles</p><p className="text-xl font-bold text-slate-900">{alertes}</p></div>
        </div>
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-sky-50 flex items-center justify-center"><ShoppingCart className="w-5 h-5 text-sky-600" /></div>
          <div><p className="text-sm text-slate-500">Sélection</p><p className="text-xl font-bold text-slate-900">{selected.size} · {formatCurrency(totalEstime)}</p></div>
        </div>
      </div>

      {/* Generator */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5">
        <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Wand2 className="w-5 h-5 text-sky-600" /> Générer un bon de commande fournisseur</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <select value={fournisseurId} onChange={(e) => setFournisseurId(e.target.value)}
            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
            <option value="">Fournisseur...</option>
            {fournisseurs.map((f) => <option key={f.id} value={f.id}>{f.nom}</option>)}
          </select>
          <button onClick={selectAllCritical} className="px-4 py-2.5 rounded-xl bg-slate-100 text-slate-700 text-sm font-medium hover:bg-slate-200 transition-colors">
            Sélectionner les ruptures
          </button>
          <button onClick={genererBon} disabled={creating || !canCreate}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-sky-600 text-white rounded-xl text-sm font-medium hover:bg-sky-700 transition-colors shadow-sm shadow-sky-600/20 disabled:opacity-50 disabled:cursor-not-allowed">
            <PackagePlus className="w-4 h-4" /> {creating ? 'Génération...' : `Générer (${selected.size})`}
          </button>
        </div>
        {!canCreate && <p className="text-xs text-slate-400 mt-2">Votre rôle ne permet pas de créer des commandes.</p>}
      </div>

      {/* Suggestions table */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
        {suggestions.length === 0 ? (
          <div className="p-12 text-center">
            <PackagePlus className="w-12 h-12 text-emerald-300 mx-auto mb-3" />
            <p className="text-slate-500">Aucun produit sous le seuil d'alerte. Tout va bien !</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50">
                  <th className="w-10 px-4 py-3"></th>
                  <th className="text-left px-4 py-3 font-semibold text-slate-600">Produit</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Stock</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Seuil</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Manquant</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600">Qté suggérée</th>
                  <th className="text-right px-4 py-3 font-semibold text-slate-600 hidden sm:table-cell">Coût estimé</th>
                  <th className="text-center px-4 py-3 font-semibold text-slate-600">Déjà en commande</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {suggestions.map((s) => {
                  const isRupture = s.produit.quantite === 0;
                  return (
                    <tr key={s.produit.id} className={`hover:bg-slate-50 transition-colors ${isRupture ? 'bg-red-50/40' : ''}`}>
                      <td className="px-4 py-3">
                        <input type="checkbox" checked={selected.has(s.produit.id)} onChange={() => toggle(s.produit.id)} className="w-4 h-4 accent-sky-600" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{s.produit.nom}</p>
                        {s.produit.sku && <p className="text-xs font-mono text-slate-400">{s.produit.sku}</p>}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span className={`font-semibold ${isRupture ? 'text-red-600' : 'text-amber-600'}`}>{formatNumber(s.produit.quantite)}</span>
                      </td>
                      <td className="px-4 py-3 text-right text-slate-500">{s.produit.seuil_alerte}</td>
                      <td className="px-4 py-3 text-right text-slate-700">{formatNumber(s.manquant)}</td>
                      <td className="px-4 py-3 text-right font-bold text-sky-700">{formatNumber(s.quantiteSuggeree)}</td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell text-slate-700">
                        {formatCurrency(s.quantiteSuggeree * Number(s.produit.prix_unitaire || s.produit.cmup))}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {enCommande.has(s.produit.id)
                          ? <span className="inline-flex px-2 py-1 rounded-full text-xs font-medium bg-sky-50 text-sky-700">Oui</span>
                          : <span className="text-slate-300 text-xs">—</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
