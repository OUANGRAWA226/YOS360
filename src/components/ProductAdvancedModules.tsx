import { useState, useEffect, useCallback } from 'react';
import {
  Boxes,
  Plus,
  Trash2,
  Edit2,
  Layers,
  Sparkles,
  Barcode,
  Tag,
  DollarSign,
  Scale,
  Package,
} from 'lucide-react';
import type {
  ProduitWithCategorie,
  ProduitUnite,
  ProduitVariante,
  ProduitComposant,
} from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { showToast } from '@/components/Toast';
import { formatNumber, formatCurrency } from '@/lib/format';
import { fetchTable, writeRow } from '@/lib/dataLayer';

// ============================================================================
// 1. MODAL UNITÉS DE MESURE & CONVERSIONS DE CONDITIONNEMENT
// ============================================================================
type UnitsModalProps = {
  produit: ProduitWithCategorie;
  onClose: () => void;
};

export function PackagingUnitsModal({ produit, onClose }: UnitsModalProps) {
  const [unites, setUnites] = useState<ProduitUnite[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [nomUnite, setNomUnite] = useState('');
  const [codeCourt, setCodeCourt] = useState('');
  const [coefficient, setCoefficient] = useState('12');
  const [codeBarres, setCodeBarres] = useState('');
  const [prixVente, setPrixVente] = useState('');
  const [saving, setSaving] = useState(false);

  const loadUnites = useCallback(async () => {
    setLoading(true);
    const data = await fetchTable<ProduitUnite>('produit_unites', '*', { column: 'coefficient', ascending: true });
    setUnites((data || []).filter((u) => u.produit_id === produit.id));
    setLoading(false);
  }, [produit.id]);

  useEffect(() => {
    loadUnites();
  }, [loadUnites]);

  const handleAdd = async () => {
    if (!nomUnite.trim()) {
      showToast('Le nom de l\'unité est obligatoire (ex: Carton de 12)', 'error');
      return;
    }
    const coeff = parseFloat(coefficient);
    if (!coeff || coeff <= 0) {
      showToast('Le coefficient de conversion doit être supérieur à 0', 'error');
      return;
    }

    setSaving(true);
    const payload = {
      produit_id: produit.id,
      nom_unite: nomUnite.trim(),
      code_court: codeCourt.trim() || null,
      coefficient: coeff,
      est_unite_base: false,
      code_barres: codeBarres.trim() || null,
      prix_vente_suggere: prixVente ? parseFloat(prixVente) : null,
    };

    const res = await writeRow('produit_unites', 'insert', payload);
    setSaving(false);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast('Unité de conditionnement ajoutée');
    setNomUnite('');
    setCodeCourt('');
    setCoefficient('12');
    setCodeBarres('');
    setPrixVente('');
    loadUnites();
  };

  const handleDelete = async (id: string) => {
    const res = await writeRow('produit_unites', 'delete', {}, id);
    if (res.error) showToast('Erreur: ' + res.error, 'error');
    else {
      showToast('Unité supprimée');
      loadUnites();
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Unités de conditionnement — ${produit.nom}`}
      size="lg"
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-sky-50 dark:bg-sky-950/30 rounded-xl border border-sky-200 dark:border-sky-900/50 flex items-center justify-between">
          <div>
            <span className="text-slate-500 dark:text-slate-400 block">Unité de base en stock :</span>
            <span className="font-bold text-sky-700 dark:text-sky-300 text-sm">
              1 {produit.unite} = 1 unité de compte
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 dark:text-slate-400 block">Prix de vente unitaire :</span>
            <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
              {formatCurrency(produit.prix_vente)} / {produit.unite}
            </span>
          </div>
        </div>

        {/* Formulaire ajout conditionnement */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
            Ajouter un conditionnement multiple (ex: Pack, Carton, Casier, Palette) :
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="form-label-lte">Nom du conditionnement *</label>
              <input
                type="text"
                value={nomUnite}
                onChange={(e) => setNomUnite(e.target.value)}
                placeholder="Ex: Carton (24 pcs)"
                className="form-control-lte text-xs"
              />
            </div>

            <div>
              <label className="form-label-lte">Code court</label>
              <input
                type="text"
                value={codeCourt}
                onChange={(e) => setCodeCourt(e.target.value)}
                placeholder="Ex: CTN24"
                className="form-control-lte text-xs font-mono uppercase"
              />
            </div>

            <div>
              <label className="form-label-lte">
                Contient combien de {produit.unite}s ? *
              </label>
              <input
                type="number"
                min="1"
                value={coefficient}
                onChange={(e) => setCoefficient(e.target.value)}
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="form-label-lte">Prix de vente suggéré (FCFA)</label>
              <input
                type="number"
                placeholder={`Ex: ${produit.prix_vente * (parseFloat(coefficient) || 1)}`}
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
                className="form-control-lte text-xs font-mono"
              />
            </div>

            <div>
              <label className="form-label-lte">Code-barres du carton</label>
              <input
                type="text"
                placeholder="Scan du code-barres sur le carton"
                value={codeBarres}
                onChange={(e) => setCodeBarres(e.target.value)}
                className="form-control-lte text-xs font-mono"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="btn-lte btn-lte-sm btn-lte-primary flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter le conditionnement
            </button>
          </div>
        </div>

        {/* Liste des unités */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="table-adminlte text-xs">
            <thead>
              <tr>
                <th>Conditionnement</th>
                <th>Code</th>
                <th className="text-right">Équivalence</th>
                <th className="text-right">Prix Suggéré</th>
                <th>Code-barres</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {unites.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Aucun conditionnement multiple configuré. Vente uniquement à l'unité de base ({produit.unite}).
                  </td>
                </tr>
              ) : (
                unites.map((u) => (
                  <tr key={u.id}>
                    <td className="font-semibold text-slate-900 dark:text-slate-100">
                      {u.nom_unite}
                    </td>
                    <td className="font-mono text-slate-500">{u.code_court || '—'}</td>
                    <td className="text-right font-mono font-bold text-sky-600 dark:text-sky-400">
                      = {formatNumber(u.coefficient)} {produit.unite}(s)
                    </td>
                    <td className="text-right font-mono font-semibold">
                      {u.prix_vente_suggere ? formatCurrency(u.prix_vente_suggere) : '—'}
                    </td>
                    <td className="font-mono text-slate-400">{u.code_barres || '—'}</td>
                    <td className="text-right">
                      <button
                        onClick={() => handleDelete(u.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-500"
                        title="Supprimer cette unité"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-footer-lte">
          <button
            type="button"
            onClick={onClose}
            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// 2. MODAL VARIANTES MATRICIELLES DE PRODUITS
// ============================================================================
type VariantsModalProps = {
  produit: ProduitWithCategorie;
  onClose: () => void;
};

export function VariantsModal({ produit, onClose }: VariantsModalProps) {
  const [variantes, setVariantes] = useState<ProduitVariante[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [nomVariante, setNomVariante] = useState('');
  const [sku, setSku] = useState('');
  const [taille, setTaille] = useState('M');
  const [couleur, setCouleur] = useState('');
  const [prixVente, setPrixVente] = useState(String(produit.prix_vente));
  const [codeBarres, setCodeBarres] = useState('');
  const [quantite, setQuantite] = useState('0');
  const [saving, setSaving] = useState(false);

  const loadVariantes = useCallback(async () => {
    setLoading(true);
    const data = await fetchTable<ProduitVariante>('produit_variantes', '*', { column: 'created_at', ascending: false });
    setVariantes((data || []).filter((v) => v.produit_id === produit.id));
    setLoading(false);
  }, [produit.id]);

  useEffect(() => {
    loadVariantes();
  }, [loadVariantes]);

  const handleAdd = async () => {
    const finalNom = nomVariante.trim() || `${produit.nom} - ${taille}${couleur ? ` / ${couleur}` : ''}`;
    const autoSku = sku.trim() || `${produit.sku || 'VAR'}-${taille}${couleur ? `-${couleur.slice(0, 3)}` : ''}`.toUpperCase();

    setSaving(true);
    const payload = {
      produit_id: produit.id,
      sku: autoSku,
      nom_variante: finalNom,
      attributs: { taille, couleur: couleur.trim() || 'Standard' },
      prix_vente: parseFloat(prixVente) || produit.prix_vente,
      prix_achat: produit.prix_unitaire || 0,
      quantite: parseInt(quantite) || 0,
      code_barres: codeBarres.trim() || null,
      actif: true,
    };

    const res = await writeRow('produit_variantes', 'insert', payload);
    setSaving(false);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast('Variante créée avec succès');
    setNomVariante('');
    setSku('');
    setCouleur('');
    setCodeBarres('');
    loadVariantes();
  };

  const handleDelete = async (id: string) => {
    const res = await writeRow('produit_variantes', 'delete', {}, id);
    if (res.error) showToast('Erreur: ' + res.error, 'error');
    else {
      showToast('Variante supprimée');
      loadVariantes();
    }
  };

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Variantes de produit — ${produit.nom}`}
      size="lg"
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
            Ajouter une déclinaison (Taille, Couleur, Format) :
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div>
              <label className="form-label-lte">Taille / Format</label>
              <input
                type="text"
                placeholder="Ex: S, M, L, XL, 500ml"
                value={taille}
                onChange={(e) => setTaille(e.target.value)}
                className="form-control-lte text-xs"
              />
            </div>

            <div>
              <label className="form-label-lte">Couleur / Teinte</label>
              <input
                type="text"
                placeholder="Ex: Bleu, Noir, Rouge"
                value={couleur}
                onChange={(e) => setCouleur(e.target.value)}
                className="form-control-lte text-xs"
              />
            </div>

            <div>
              <label className="form-label-lte">SKU Variante (Optionnel)</label>
              <input
                type="text"
                placeholder="Généré auto si vide"
                value={sku}
                onChange={(e) => setSku(e.target.value)}
                className="form-control-lte text-xs font-mono uppercase"
              />
            </div>

            <div>
              <label className="form-label-lte">Prix Vente (FCFA)</label>
              <input
                type="number"
                value={prixVente}
                onChange={(e) => setPrixVente(e.target.value)}
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="btn-lte btn-lte-sm btn-lte-primary flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Générer la variante
            </button>
          </div>
        </div>

        {/* Tableau des variantes */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="table-adminlte text-xs">
            <thead>
              <tr>
                <th>Variante</th>
                <th>SKU</th>
                <th>Attributs</th>
                <th className="text-right">Stock</th>
                <th className="text-right">Prix Vente</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {variantes.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Aucune variante pour ce produit.
                  </td>
                </tr>
              ) : (
                variantes.map((v) => (
                  <tr key={v.id}>
                    <td className="font-semibold text-slate-900 dark:text-slate-100">
                      {v.nom_variante}
                    </td>
                    <td className="font-mono text-sky-600 dark:text-sky-400">{v.sku}</td>
                    <td>
                      <div className="flex gap-1.5">
                        {Object.entries(v.attributs || {}).map(([key, val]) => (
                          <span
                            key={key}
                            className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] text-slate-600 dark:text-slate-300 font-mono"
                          >
                            {key}: {val}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="text-right font-mono font-bold">{v.quantite}</td>
                    <td className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(v.prix_vente)}
                    </td>
                    <td className="text-right">
                      <button
                        onClick={() => handleDelete(v.id)}
                        className="p-1 rounded text-slate-400 hover:text-red-500"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-footer-lte">
          <button
            type="button"
            onClick={onClose}
            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}

// ============================================================================
// 3. MODAL COMPOSANTS DE KITS / NOMENCLATURES (BOM)
// ============================================================================
type BOMModalProps = {
  produit: ProduitWithCategorie;
  catalogueProduits: ProduitWithCategorie[];
  onClose: () => void;
};

export function BOMKitModal({ produit, catalogueProduits, onClose }: BOMModalProps) {
  const [composants, setComposants] = useState<ProduitComposant[]>([]);
  const [loading, setLoading] = useState(true);

  // Form
  const [selectedCompId, setSelectedCompId] = useState('');
  const [quantiteNecessaire, setQuantiteNecessaire] = useState('1');
  const [pertePct, setPertePct] = useState('0');
  const [instructions, setInstructions] = useState('');
  const [saving, setSaving] = useState(false);

  const loadComposants = useCallback(async () => {
    setLoading(true);
    const data = await fetchTable<ProduitComposant>('produit_composants', '*', { column: 'created_at', ascending: true });
    const forThisKit = (data || []).filter((c) => c.produit_parent_id === produit.id);
    setComposants(forThisKit);
    setLoading(false);
  }, [produit.id]);

  useEffect(() => {
    loadComposants();
  }, [loadComposants]);

  const handleAdd = async () => {
    if (!selectedCompId) {
      showToast('Sélectionnez un composant du catalogue', 'error');
      return;
    }
    const qte = parseFloat(quantiteNecessaire);
    if (!qte || qte <= 0) {
      showToast('La quantité requise doit être positive', 'error');
      return;
    }

    setSaving(true);
    const payload = {
      produit_parent_id: produit.id,
      composant_produit_id: selectedCompId,
      quantite_composant: qte,
      perte_pourcentage: parseFloat(pertePct) || 0,
      instructions: instructions.trim() || null,
    };

    const res = await writeRow('produit_composants', 'insert', payload);
    setSaving(false);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast('Composant ajouté à la nomenclature');
    setSelectedCompId('');
    setQuantiteNecessaire('1');
    setPertePct('0');
    setInstructions('');
    loadComposants();
  };

  const handleDelete = async (id: string) => {
    const res = await writeRow('produit_composants', 'delete', {}, id);
    if (res.error) showToast('Erreur: ' + res.error, 'error');
    else {
      showToast('Composant retiré de la nomenclature');
      loadComposants();
    }
  };

  // Coût total de revient calculé à partir des composants
  const coutRevientEstime = composants.reduce((sum, c) => {
    const p = catalogueProduits.find((x) => x.id === c.composant_produit_id);
    const cout = p?.cmup || p?.prix_unitaire || 0;
    return sum + cout * c.quantite_composant * (1 + (c.perte_pourcentage || 0) / 100);
  }, 0);

  return (
    <Modal
      open={true}
      onClose={onClose}
      title={`Nomenclature & Composants (BOM) — ${produit.nom}`}
      size="lg"
    >
      <div className="space-y-4 text-xs">
        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 rounded-xl border border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
          <div>
            <span className="text-amber-800 dark:text-amber-400 block font-semibold">
              Principe de décrémentation automatique du Kit :
            </span>
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">
              Chaque vente de « {produit.nom} » déduira automatiquement les composants ci-dessous du stock.
            </span>
          </div>
          <div className="text-right">
            <span className="text-slate-500 block">Coût estimé des matières :</span>
            <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400 text-sm">
              {formatCurrency(coutRevientEstime)}
            </span>
          </div>
        </div>

        {/* Ajout composant */}
        <div className="p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
          <span className="font-semibold text-slate-800 dark:text-slate-200 block">
            Ajouter un composant à cette formule :
          </span>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="form-label-lte">Composant / Ingrédient *</label>
              <select
                value={selectedCompId}
                onChange={(e) => setSelectedCompId(e.target.value)}
                className="form-select-lte text-xs"
              >
                <option value="">Sélectionner un article du stock</option>
                {catalogueProduits
                  .filter((p) => p.id !== produit.id)
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom} (Stock : {p.quantite} {p.unite})
                    </option>
                  ))}
              </select>
            </div>

            <div>
              <label className="form-label-lte">Quantité requise par kit *</label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={quantiteNecessaire}
                onChange={(e) => setQuantiteNecessaire(e.target.value)}
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div className="flex justify-end pt-1">
            <button
              onClick={handleAdd}
              disabled={saving}
              className="btn-lte btn-lte-sm btn-lte-primary flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              Ajouter le composant
            </button>
          </div>
        </div>

        {/* Table composants */}
        <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
          <table className="table-adminlte text-xs">
            <thead>
              <tr>
                <th>Composant</th>
                <th className="text-right">Qté Requise</th>
                <th className="text-right">Stock Disponible</th>
                <th className="text-right">Coût Unitaire</th>
                <th className="text-right">Sous-Total</th>
                <th className="text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {composants.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-slate-400">
                    Aucun composant rattaché à ce kit.
                  </td>
                </tr>
              ) : (
                composants.map((c) => {
                  const compProd = catalogueProduits.find((x) => x.id === c.composant_produit_id);
                  const cout = compProd?.cmup || compProd?.prix_unitaire || 0;
                  const st = cout * c.quantite_composant;

                  return (
                    <tr key={c.id}>
                      <td className="font-semibold text-slate-900 dark:text-slate-100">
                        {compProd?.nom || 'Composant introuvable'}
                      </td>
                      <td className="text-right font-mono font-bold text-sky-600 dark:text-sky-400">
                        {c.quantite_composant} {compProd?.unite || 'pcs'}
                      </td>
                      <td className="text-right font-mono">
                        {compProd?.quantite || 0}
                      </td>
                      <td className="text-right font-mono text-slate-500">
                        {formatCurrency(cout)}
                      </td>
                      <td className="text-right font-mono font-bold">
                        {formatCurrency(st)}
                      </td>
                      <td className="text-right">
                        <button
                          onClick={() => handleDelete(c.id)}
                          className="p-1 rounded text-slate-400 hover:text-red-500"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <div className="modal-footer-lte">
          <button
            type="button"
            onClick={onClose}
            className="btn-lte btn-lte-sm btn-lte-outline-secondary"
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}
