import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Percent,
  Tag,
  Plus,
  Search,
  Users,
  Calendar,
  CheckCircle2,
  Trash2,
  Edit2,
  Copy,
  Sliders,
  DollarSign,
  TrendingDown,
  ShoppingBag,
  Zap,
  Sparkles,
} from 'lucide-react';
import type {
  ProduitWithCategorie,
  Client,
  GrilleTarifaire,
  GrilleTarifaireLigne,
  Promotion,
  CategorieClient,
} from '@/lib/supabase';
import { Card, InfoBox, SmallBox, Callout } from '@/components/adminlte';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, formatCurrency } from '@/lib/format';
import { fetchTable, writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { calculerPrixClient } from '@/lib/stockAdvanced';

type Props = {
  produits: ProduitWithCategorie[];
  clients: Client[];
  role: Role | null;
  loading: boolean;
};

export function TarifsPromos({ produits, clients, role, loading: parentLoading }: Props) {
  const canManage = can(role, 'produits', 'edit') || role === 'admin' || role === 'gerant';
  const [activeTab, setActiveTab] = useState<'grilles' | 'promotions' | 'simulateur'>('grilles');

  const [grilles, setGrilles] = useState<GrilleTarifaire[]>([]);
  const [promotions, setPromotions] = useState<Promotion[]>([]);
  const [loading, setLoading] = useState(true);

  // Modal Grille
  const [modalGrilleOpen, setModalGrilleOpen] = useState(false);
  const [editingGrille, setEditingGrille] = useState<GrilleTarifaire | null>(null);
  const [grilleForm, setGrilleForm] = useState({
    nom: '',
    categorie_client: 'grossiste' as CategorieClient,
    remise_globale_pourcentage: '5',
    description: '',
    actif: true,
  });

  // Modal Promotion
  const [modalPromoOpen, setModalPromoOpen] = useState(false);
  const [editingPromo, setEditingPromo] = useState<Promotion | null>(null);
  const [promoForm, setPromoForm] = useState({
    nom: '',
    code: '',
    type_remise: 'pourcentage' as 'pourcentage' | 'montant_fixe',
    valeur_remise: '10',
    montant_minimum_achat: '0',
    date_debut: new Date().toISOString().slice(0, 10),
    date_fin: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    nb_utilisations_max: '100',
    actif: true,
  });

  // Modal Ligne Spécifique Grille
  const [modalLigneOpen, setModalLigneOpen] = useState(false);
  const [selectedGrilleId, setSelectedGrilleId] = useState<string>('');
  const [ligneForm, setLigneForm] = useState({
    produit_id: '',
    prix_specifique: '',
    remise_pourcentage: '',
    quantite_min: '1',
  });

  // Simulateur en direct
  const [simProdId, setSimProdId] = useState(produits[0]?.id || '');
  const [simCatClient, setSimCatClient] = useState<string>('grossiste');
  const [simQte, setSimQte] = useState('1');
  const [simCodePromo, setSimCodePromo] = useState('');

  const loadData = useCallback(async () => {
    setLoading(true);
    const [gRes, pRes] = await Promise.all([
      fetchTable<GrilleTarifaire>('grilles_tarifaires', '*, grille_tarifaire_lignes(*)', { column: 'created_at', ascending: false }),
      fetchTable<Promotion>('promotions', '*', { column: 'created_at', ascending: false }),
    ]);
    setGrilles(gRes || []);
    setPromotions(pRes || []);
    setLoading(false);
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Sauvegarder Grille
  const handleSaveGrille = async () => {
    if (!grilleForm.nom.trim()) {
      showToast('Le nom de la grille est obligatoire', 'error');
      return;
    }

    const payload = {
      nom: grilleForm.nom.trim(),
      categorie_client: grilleForm.categorie_client,
      remise_globale_pourcentage: parseFloat(grilleForm.remise_globale_pourcentage) || 0,
      description: grilleForm.description.trim() || null,
      actif: grilleForm.actif,
    };

    const res = editingGrille
      ? await writeRow('grilles_tarifaires', 'update', payload, editingGrille.id)
      : await writeRow('grilles_tarifaires', 'insert', payload);

    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast(editingGrille ? 'Grille mise à jour' : 'Grille tarifaire créée');
    setModalGrilleOpen(false);
    loadData();
  };

  // Sauvegarder Promotion
  const handleSavePromo = async () => {
    if (!promoForm.nom.trim()) {
      showToast('Le nom de la promotion est requis', 'error');
      return;
    }

    const payload = {
      nom: promoForm.nom.trim(),
      code: promoForm.code.trim().toUpperCase() || null,
      type_remise: promoForm.type_remise,
      valeur_remise: parseFloat(promoForm.valeur_remise) || 0,
      montant_minimum_achat: parseFloat(promoForm.montant_minimum_achat) || 0,
      date_debut: new Date(promoForm.date_debut).toISOString(),
      date_fin: new Date(promoForm.date_fin + 'T23:59:59').toISOString(),
      nb_utilisations_max: promoForm.nb_utilisations_max ? parseInt(promoForm.nb_utilisations_max) : null,
      actif: promoForm.actif,
    };

    const res = editingPromo
      ? await writeRow('promotions', 'update', payload, editingPromo.id)
      : await writeRow('promotions', 'insert', payload);

    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast(editingPromo ? 'Promotion mise à jour' : 'Code promo créé avec succès');
    setModalPromoOpen(false);
    loadData();
  };

  // Sauvegarder Ligne de Prix Spécifique
  const handleSaveLigne = async () => {
    if (!ligneForm.produit_id) {
      showToast('Sélectionnez un produit', 'error');
      return;
    }

    const payload = {
      grille_id: selectedGrilleId,
      produit_id: ligneForm.produit_id,
      prix_specifique: ligneForm.prix_specifique ? parseFloat(ligneForm.prix_specifique) : null,
      remise_pourcentage: ligneForm.remise_pourcentage ? parseFloat(ligneForm.remise_pourcentage) : null,
      quantite_min: parseInt(ligneForm.quantite_min) || 1,
    };

    const res = await writeRow('grille_tarifaire_lignes', 'insert', payload);
    if (res.error) {
      showToast('Erreur: ' + res.error, 'error');
      return;
    }

    showToast('Règle tarifaire ajoutée à la grille');
    setModalLigneOpen(false);
    loadData();
  };

  const handleDeleteGrille = async (id: string) => {
    const res = await writeRow('grilles_tarifaires', 'delete', {}, id);
    if (res.error) showToast('Erreur: ' + res.error, 'error');
    else {
      showToast('Grille supprimée');
      loadData();
    }
  };

  const handleDeletePromo = async (id: string) => {
    const res = await writeRow('promotions', 'delete', {}, id);
    if (res.error) showToast('Erreur: ' + res.error, 'error');
    else {
      showToast('Promotion supprimée');
      loadData();
    }
  };

  // Résultat du simulateur
  const simResultat = useMemo(() => {
    const prod = produits.find((p) => p.id === simProdId);
    if (!prod) return null;

    const promoActive = promotions.find(
      (p) => p.code?.toUpperCase() === simCodePromo.trim().toUpperCase() && p.actif
    );

    return calculerPrixClient({
      produit: prod,
      categorieClient: simCatClient,
      quantite: parseInt(simQte) || 1,
      grilles,
      promo: promoActive,
    });
  }, [produits, simProdId, simCatClient, simQte, simCodePromo, grilles, promotions]);

  return (
    <div className="space-y-6">
      {/* 1. Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 tracking-tight flex items-center gap-2.5">
            <Percent className="w-7 h-7 text-sky-600 dark:text-sky-400" />
            Grilles Tarifaires, Remises & Promotions
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Tarifs par catégorie de clients (Grossistes, Demi-gros, VIP), remises par volume et codes promotionnels
          </p>
        </div>

        <div className="flex items-center gap-2">
          {activeTab === 'grilles' && canManage && (
            <button
              onClick={() => {
                setEditingGrille(null);
                setGrilleForm({
                  nom: '',
                  categorie_client: 'grossiste',
                  remise_globale_pourcentage: '5',
                  description: '',
                  actif: true,
                });
                setModalGrilleOpen(true);
              }}
              className="btn-lte btn-lte-primary flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nouvelle Grille Tarifaire
            </button>
          )}

          {activeTab === 'promotions' && canManage && (
            <button
              onClick={() => {
                setEditingPromo(null);
                setPromoForm({
                  nom: '',
                  code: '',
                  type_remise: 'pourcentage',
                  valeur_remise: '10',
                  montant_minimum_achat: '0',
                  date_debut: new Date().toISOString().slice(0, 10),
                  date_fin: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
                  nb_utilisations_max: '100',
                  actif: true,
                });
                setModalPromoOpen(true);
              }}
              className="btn-lte btn-lte-primary flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              Nouveau Code Promo
            </button>
          )}
        </div>
      </div>

      {/* 2. Onglets de Navigation */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-6">
        <button
          onClick={() => setActiveTab('grilles')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'grilles'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          Grilles Tarifaires Clients ({grilles.length})
        </button>

        <button
          onClick={() => setActiveTab('promotions')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'promotions'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Tag className="w-4 h-4" />
          Campagnes & Coupons ({promotions.length})
        </button>

        <button
          onClick={() => setActiveTab('simulateur')}
          className={`pb-3 text-sm font-semibold flex items-center gap-2 border-b-2 transition-colors ${
            activeTab === 'simulateur'
              ? 'border-sky-500 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Zap className="w-4 h-4 text-amber-500" />
          Simulateur de Prix Instantané
        </button>
      </div>

      {/* 3. Contenu de l'onglet actif */}
      {activeTab === 'grilles' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <InfoBox
              title="Grilles Actives"
              value={grilles.filter((g) => g.actif).length}
              icon={Users}
              color="info"
              subText="Appliquées automatiquement"
            />
            <InfoBox
              title="Catégories Couvertes"
              value={new Set(grilles.map((g) => g.categorie_client)).size}
              icon={Percent}
              color="success"
              subText="Détail, Demi-gros, Grossiste..."
            />
            <InfoBox
              title="Règles par Produit"
              value={grilles.reduce((acc, g) => acc + (g.lignes?.length || 0), 0)}
              icon={Tag}
              color="warning"
              subText="Prix spécifiques & Paliers"
            />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {grilles.length === 0 ? (
              <div className="lg:col-span-2 p-8 text-center text-slate-400 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-800">
                Aucune grille tarifaire configurée. Créez-en une pour appliquer des prix personnalisés par type de client.
              </div>
            ) : (
              grilles.map((grille) => (
                <Card key={grille.id} title={grille.nom} className="relative">
                  <div className="flex items-center justify-between mb-3">
                    <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                      Catégorie : {grille.categorie_client}
                    </span>
                    <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                      Remise globale : -{grille.remise_globale_pourcentage}%
                    </span>
                  </div>

                  <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    {grille.description || 'Aucune description saisie pour cette grille.'}
                  </p>

                  {/* Lignes spécifiques */}
                  <div className="space-y-2 border-t border-slate-200 dark:border-slate-800 pt-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300">
                      <span>Règles spécifiques & Paliers ({grille.lignes?.length || 0})</span>
                      {canManage && (
                        <button
                          onClick={() => {
                            setSelectedGrilleId(grille.id);
                            setLigneForm({
                              produit_id: produits[0]?.id || '',
                              prix_specifique: '',
                              remise_pourcentage: '10',
                              quantite_min: '5',
                            });
                            setModalLigneOpen(true);
                          }}
                          className="text-[11px] text-sky-500 hover:underline flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Ajouter une règle produit
                        </button>
                      )}
                    </div>

                    {(!grille.lignes || grille.lignes.length === 0) ? (
                      <p className="text-[11px] text-slate-400 italic">
                        La remise globale de {grille.remise_globale_pourcentage}% s'applique à tous les articles.
                      </p>
                    ) : (
                      <div className="space-y-1.5 max-h-40 overflow-y-auto">
                        {grille.lignes.map((l, idx) => {
                          const prod = produits.find((p) => p.id === l.produit_id);
                          return (
                            <div
                              key={idx}
                              className="flex items-center justify-between p-2 rounded bg-slate-50 dark:bg-slate-800/60 text-xs"
                            >
                              <div className="flex flex-col">
                                <span className="font-semibold text-slate-800 dark:text-slate-200">
                                  {prod?.nom || 'Article inconnu'}
                                </span>
                                <span className="text-[10px] text-slate-400">
                                  Palier : dès {l.quantite_min} unité(s)
                                </span>
                              </div>
                              <div className="text-right font-mono font-bold text-sky-600 dark:text-sky-400">
                                {l.prix_specifique
                                  ? formatCurrency(l.prix_specifique)
                                  : `-${l.remise_pourcentage}%`}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {canManage && (
                    <div className="flex items-center justify-end gap-2 mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                      <button
                        onClick={() => handleDeleteGrille(grille.id)}
                        className="text-xs text-red-500 hover:text-red-600 p-1 rounded"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </Card>
              ))
            )}
          </div>
        </div>
      )}

      {activeTab === 'promotions' && (
        <div className="space-y-4">
          <Card noPadding>
            <div className="overflow-x-auto">
              <table className="table-adminlte text-xs">
                <thead>
                  <tr>
                    <th>Code Promotion</th>
                    <th>Campagne</th>
                    <th>Type Remise</th>
                    <th className="text-right">Valeur</th>
                    <th className="text-right">Achat Minimum</th>
                    <th>Période de Validité</th>
                    <th className="text-center">Utilisations</th>
                    <th className="text-center">Statut</th>
                    <th className="text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {promotions.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="py-8 text-center text-slate-400">
                        Aucun code promo actif. Créez un coupon pour vos campagnes marketing.
                      </td>
                    </tr>
                  ) : (
                    promotions.map((promo) => {
                      const now = new Date();
                      const expiree = now > new Date(promo.date_fin);

                      return (
                        <tr key={promo.id}>
                          <td>
                            <span className="font-mono font-bold text-sm text-sky-600 dark:text-sky-400 bg-sky-500/10 px-2 py-0.5 rounded border border-sky-500/20">
                              {promo.code || 'REMISE AUTO'}
                            </span>
                          </td>
                          <td className="font-semibold text-slate-800 dark:text-slate-200">
                            {promo.nom}
                          </td>
                          <td className="capitalize">
                            {promo.type_remise === 'pourcentage' ? 'Pourcentage' : 'Montant Fixe'}
                          </td>
                          <td className="text-right font-mono font-bold text-emerald-600 dark:text-emerald-400">
                            {promo.type_remise === 'pourcentage'
                              ? `-${promo.valeur_remise}%`
                              : `-${formatCurrency(promo.valeur_remise)}`}
                          </td>
                          <td className="text-right font-mono">
                            {promo.montant_minimum_achat > 0
                              ? formatCurrency(promo.montant_minimum_achat)
                              : 'Sans minimum'}
                          </td>
                          <td>
                            <div className="flex flex-col text-[11px]">
                              <span>Du {formatDate(promo.date_debut)}</span>
                              <span>Au {formatDate(promo.date_fin)}</span>
                            </div>
                          </td>
                          <td className="text-center font-mono">
                            {promo.nb_utilisations_actuel} / {promo.nb_utilisations_max || '∞'}
                          </td>
                          <td className="text-center">
                            <span
                              className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                expiree
                                  ? 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-400'
                                  : promo.actif
                                  ? 'bg-emerald-500/20 text-emerald-500'
                                  : 'bg-red-500/20 text-red-500'
                              }`}
                            >
                              {expiree ? 'Expirée' : promo.actif ? 'Active' : 'Désactivée'}
                            </span>
                          </td>
                          <td className="text-right">
                            {canManage && (
                              <button
                                onClick={() => handleDeletePromo(promo.id)}
                                className="p-1 rounded text-slate-400 hover:text-red-500"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {activeTab === 'simulateur' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card title="Paramètres du Test de Prix">
            <div className="space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Article à tester
                </label>
                <select
                  value={simProdId}
                  onChange={(e) => setSimProdId(e.target.value)}
                  className="form-control-lte text-xs"
                >
                  {produits.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nom} — Prix Public: {formatCurrency(p.prix_vente)}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Profil / Catégorie Client
                  </label>
                  <select
                    value={simCatClient}
                    onChange={(e) => setSimCatClient(e.target.value)}
                    className="form-control-lte text-xs font-semibold"
                  >
                    <option value="detail">Client Standard / Détail</option>
                    <option value="demi_gros">Demi-gros</option>
                    <option value="grossiste">Grossiste agréé</option>
                    <option value="vip">Client VIP / Fidélité</option>
                    <option value="partenaire">Partenaire Institutionnel</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Quantité achetée
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={simQte}
                    onChange={(e) => setSimQte(e.target.value)}
                    className="form-control-lte text-xs font-mono font-bold"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Code Coupon / Promo (Optionnel)
                </label>
                <input
                  type="text"
                  placeholder="Ex: TABASKI2026"
                  value={simCodePromo}
                  onChange={(e) => setSimCodePromo(e.target.value)}
                  className="form-control-lte text-xs font-mono font-bold uppercase"
                />
              </div>
            </div>
          </Card>

          <Card title="Résultat Tarifaire Appliqué">
            {simResultat ? (
              <div className="space-y-4">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <span className="text-xs text-slate-400 block">Prix Public Catalogue</span>
                    <span className="text-base font-mono line-through text-slate-500">
                      {formatCurrency(simResultat.prixBase)}
                    </span>
                  </div>

                  <div className="text-right">
                    <span className="text-xs text-emerald-500 font-bold block">
                      Prix Final Appliqué
                    </span>
                    <span className="text-2xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      {formatCurrency(simResultat.prixFinal)}
                    </span>
                  </div>
                </div>

                <div className="space-y-2 text-xs">
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Règle appliquée :</span>
                    <span className="font-semibold text-slate-800 dark:text-slate-200">
                      {simResultat.motifTarif}
                    </span>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                    <span className="text-slate-500">Remise unitaire obtenue :</span>
                    <span className="font-bold font-mono text-emerald-600 dark:text-emerald-400">
                      -{formatCurrency(simResultat.remiseUnitaire)} ({simResultat.remisePourcentage}%)
                    </span>
                  </div>
                  <div className="flex justify-between py-1 font-bold text-sm">
                    <span className="text-slate-700 dark:text-slate-300">Total pour {simQte} unité(s) :</span>
                    <span className="font-mono text-sky-600 dark:text-sky-400">
                      {formatCurrency(simResultat.prixFinal * (parseInt(simQte) || 1))}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div className="py-8 text-center text-slate-400 text-xs">
                Sélectionnez un article pour tester le tarif.
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 4. Modal Création Grille */}
      <Modal
        isOpen={modalGrilleOpen}
        onClose={() => setModalGrilleOpen(false)}
        title={editingGrille ? 'Modifier la Grille Tarifaire' : 'Créer une Grille Tarifaire'}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">Nom de la grille *</label>
            <input
              type="text"
              placeholder="Ex: Tarif Revendeurs & Grossistes"
              value={grilleForm.nom}
              onChange={(e) => setGrilleForm({ ...grilleForm, nom: e.target.value })}
              className="form-control-lte text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Catégorie Client Cible</label>
              <select
                value={grilleForm.categorie_client}
                onChange={(e) => setGrilleForm({ ...grilleForm, categorie_client: e.target.value as CategorieClient })}
                className="form-control-lte text-xs"
              >
                <option value="detail">Détail</option>
                <option value="demi_gros">Demi-gros</option>
                <option value="grossiste">Grossiste</option>
                <option value="vip">VIP</option>
                <option value="partenaire">Partenaire</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold mb-1">Remise Globale (%)</label>
              <input
                type="number"
                min="0"
                max="100"
                value={grilleForm.remise_globale_pourcentage}
                onChange={(e) => setGrilleForm({ ...grilleForm, remise_globale_pourcentage: e.target.value })}
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Description / Conditions</label>
            <textarea
              rows={2}
              value={grilleForm.description}
              onChange={(e) => setGrilleForm({ ...grilleForm, description: e.target.value })}
              placeholder="Conditions d'éligibilité, zone géographique, volumes minimums..."
              className="form-control-lte text-xs"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setModalGrilleOpen(false)} className="btn-lte btn-lte-outline">
              Annuler
            </button>
            <button onClick={handleSaveGrille} className="btn-lte btn-lte-primary">
              Enregistrer
            </button>
          </div>
        </div>
      </Modal>

      {/* 5. Modal Création Code Promo */}
      <Modal
        isOpen={modalPromoOpen}
        onClose={() => setModalPromoOpen(false)}
        title={editingPromo ? 'Modifier la Promotion' : 'Créer un Code Promo / Coupon'}
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">Nom de la Campagne *</label>
            <input
              type="text"
              placeholder="Ex: Solde Tabaski 2026"
              value={promoForm.nom}
              onChange={(e) => setPromoForm({ ...promoForm, nom: e.target.value })}
              className="form-control-lte text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Code Coupon (Saisi par le client/caissier)</label>
              <input
                type="text"
                placeholder="Ex: TABASKI15"
                value={promoForm.code}
                onChange={(e) => setPromoForm({ ...promoForm, code: e.target.value })}
                className="form-control-lte text-xs font-mono font-bold uppercase"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Type de remise</label>
              <select
                value={promoForm.type_remise}
                onChange={(e) => setPromoForm({ ...promoForm, type_remise: e.target.value as any })}
                className="form-control-lte text-xs"
              >
                <option value="pourcentage">Pourcentage (%)</option>
                <option value="montant_fixe">Montant Fixe (FCFA)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">
                Valeur de la Remise ({promoForm.type_remise === 'pourcentage' ? '%' : 'FCFA'})
              </label>
              <input
                type="number"
                min="0"
                value={promoForm.valeur_remise}
                onChange={(e) => setPromoForm({ ...promoForm, valeur_remise: e.target.value })}
                className="form-control-lte text-xs font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Panier Minimum Requis (FCFA)</label>
              <input
                type="number"
                min="0"
                value={promoForm.montant_minimum_achat}
                onChange={(e) => setPromoForm({ ...promoForm, montant_minimum_achat: e.target.value })}
                className="form-control-lte text-xs font-mono"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Date de début</label>
              <input
                type="date"
                value={promoForm.date_debut}
                onChange={(e) => setPromoForm({ ...promoForm, date_debut: e.target.value })}
                className="form-control-lte text-xs"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">Date d'expiration</label>
              <input
                type="date"
                value={promoForm.date_fin}
                onChange={(e) => setPromoForm({ ...promoForm, date_fin: e.target.value })}
                className="form-control-lte text-xs"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Nombre d'utilisations maximal</label>
            <input
              type="number"
              min="1"
              value={promoForm.nb_utilisations_max}
              onChange={(e) => setPromoForm({ ...promoForm, nb_utilisations_max: e.target.value })}
              className="form-control-lte text-xs font-mono"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setModalPromoOpen(false)} className="btn-lte btn-lte-outline">
              Annuler
            </button>
            <button onClick={handleSavePromo} className="btn-lte btn-lte-primary">
              Créer la promotion
            </button>
          </div>
        </div>
      </Modal>

      {/* 6. Modal Ligne Spécifique Grille */}
      <Modal
        isOpen={modalLigneOpen}
        onClose={() => setModalLigneOpen(false)}
        title="Règle Tarifaire par Produit & Volume"
      >
        <div className="space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1">Article / Produit</label>
            <select
              value={ligneForm.produit_id}
              onChange={(e) => setLigneForm({ ...ligneForm, produit_id: e.target.value })}
              className="form-control-lte text-xs"
            >
              <option value="">Sélectionner un produit</option>
              {produits.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nom} (Prix normal : {formatCurrency(p.prix_vente)})
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block font-semibold mb-1">Prix Négocié Fixe (FCFA)</label>
              <input
                type="number"
                placeholder="Ex: 2500"
                value={ligneForm.prix_specifique}
                onChange={(e) => setLigneForm({ ...ligneForm, prix_specifique: e.target.value })}
                className="form-control-lte text-xs font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold mb-1">OU Remise Spécifique (%)</label>
              <input
                type="number"
                placeholder="Ex: 12"
                value={ligneForm.remise_pourcentage}
                onChange={(e) => setLigneForm({ ...ligneForm, remise_pourcentage: e.target.value })}
                className="form-control-lte text-xs font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block font-semibold mb-1">Palier : Quantité minimale requise</label>
            <input
              type="number"
              min="1"
              value={ligneForm.quantite_min}
              onChange={(e) => setLigneForm({ ...ligneForm, quantite_min: e.target.value })}
              className="form-control-lte text-xs font-mono font-bold"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
            <button onClick={() => setModalLigneOpen(false)} className="btn-lte btn-lte-outline">
              Annuler
            </button>
            <button onClick={handleSaveLigne} className="btn-lte btn-lte-primary">
              Ajouter à la grille
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
