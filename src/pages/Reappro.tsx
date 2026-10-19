import { useState, useMemo } from 'react';
import { ShoppingCart, TrendingDown, AlertTriangle, PackagePlus, Wand2, Package, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import type { ProduitWithCategorie, Fournisseur, Commande } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { formatCurrency, formatNumber, generateReference } from '@/lib/format';
import { can, type Role } from '@/lib/permissions';
import { InfoBox, Card, Callout } from '@/components/adminlte';

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
      {/* Content Header (Page header) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <PackagePlus className="w-7 h-7 text-primary" />
            Réapprovisionnement intelligent
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Calcul automatique des manquant par seuil d'alerte et génération directe de bons de commande
          </p>
        </div>
      </div>

      {/* AdminLTE Info-Boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <InfoBox
          title="Ruptures Sèches"
          value={ruptures}
          icon={AlertTriangle}
          variant="danger"
          description="Stock à 0 unité (priorité absolue)"
        />
        <InfoBox
          title="Stocks Faibles"
          value={alertes}
          icon={TrendingDown}
          variant="warning"
          description="En dessous du seuil de sécurité"
        />
        <InfoBox
          title="Sélection Actuelle"
          value={`${selected.size} réf.`}
          icon={ShoppingCart}
          variant="info"
          description={`Coût estimé : ${formatCurrency(totalEstime)}`}
        />
      </div>

      {/* Generator Card */}
      <Card
        title="Générateur de Bon de Commande Fournisseur"
        icon={Wand2}
        variant="primary"
        outline
      >
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={fournisseurId}
              onChange={(e) => setFournisseurId(e.target.value)}
              className="form-control-lte flex-1"
            >
              <option value="">Sélectionner un fournisseur partenaire...</option>
              {fournisseurs.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nom}
                </option>
              ))}
            </select>
            <button
              onClick={selectAllCritical}
              className="btn-lte btn-lte-secondary"
            >
              Cocher les ruptures
            </button>
            <button
              onClick={genererBon}
              disabled={creating || !canCreate}
              className="btn-lte btn-lte-primary disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <PackagePlus className="w-4 h-4" />{' '}
              {creating ? 'Émission en cours...' : `Émettre bon (${selected.size} lignes)`}
            </button>
          </div>
          {!canCreate && (
            <p className="text-xs text-slate-400">
              Votre profil utilisateur ne possède pas l'autorisation de création de commande.
            </p>
          )}
        </div>
      </Card>

      {/* Suggestions Table Card */}
      <Card
        title={`Lignes suggérées pour réassort (${suggestions.length})`}
        icon={Package}
        variant="warning"
        outline
        noPadding
      >
        {suggestions.length === 0 ? (
          <div className="p-12 text-center">
            <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              Aucun produit sous le seuil d'alerte
            </p>
            <p className="text-xs text-slate-400 mt-1">Vos stocks sont au-dessus des niveaux critiques.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-adminlte">
              <thead>
                <tr>
                  <th className="w-10 px-3 py-3 text-center">
                    <input
                      type="checkbox"
                      checked={selected.size === suggestions.length && suggestions.length > 0}
                      onChange={() => {
                        if (selected.size === suggestions.length) setSelected(new Set());
                        else setSelected(new Set(suggestions.map((s) => s.produit.id)));
                      }}
                      className="rounded accent-primary"
                    />
                  </th>
                  <th className="text-left px-4 py-3">Produit</th>
                  <th className="text-right px-4 py-3">Stock Actuel</th>
                  <th className="text-right px-4 py-3">Seuil Sécurité</th>
                  <th className="text-right px-4 py-3">Manquant</th>
                  <th className="text-right px-4 py-3">Qté Suggérée</th>
                  <th className="text-right px-4 py-3 hidden sm:table-cell">Coût Estimé</th>
                  <th className="text-center px-4 py-3">Déjà en Commande</th>
                </tr>
              </thead>
              <tbody>
                {suggestions.map((s) => {
                  const isRupture = s.produit.quantite === 0;
                  return (
                    <tr
                      key={s.produit.id}
                      className={isRupture ? 'bg-red-50/40 dark:bg-red-950/20' : ''}
                    >
                      <td className="px-3 py-3 text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(s.produit.id)}
                          onChange={() => toggle(s.produit.id)}
                          className="rounded accent-primary"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-semibold text-slate-900 dark:text-slate-100">{s.produit.nom}</p>
                        {s.produit.sku && (
                          <p className="text-[11px] font-mono text-slate-400">{s.produit.sku}</p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <span
                          className={`font-bold text-xs ${
                            isRupture
                              ? 'text-red-600 dark:text-red-400'
                              : 'text-amber-600 dark:text-amber-400'
                          }`}
                        >
                          {formatNumber(s.produit.quantite)}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right text-xs text-slate-500 font-mono">
                        {s.produit.seuil_alerte}
                      </td>
                      <td className="px-4 py-3 text-right text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {formatNumber(s.manquant)}
                      </td>
                      <td className="px-4 py-3 text-right font-extrabold text-xs text-primary">
                        {formatNumber(s.quantiteSuggeree)}
                      </td>
                      <td className="px-4 py-3 text-right hidden sm:table-cell text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {formatCurrency(
                          s.quantiteSuggeree * Number(s.produit.prix_unitaire || s.produit.cmup)
                        )}
                      </td>
                      <td className="px-4 py-3 text-center">
                        {enCommande.has(s.produit.id) ? (
                          <span className="badge-adminlte bg-primary-subtle text-primary border border-primary/20">
                            Oui
                          </span>
                        ) : (
                          <span className="text-slate-300 text-xs">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
