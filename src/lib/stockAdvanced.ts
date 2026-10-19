/**
 * YOS360 — Moteur Métier Stock Avancé, FEFO, Tarification & Nomenclatures
 * Module Phase 2 : Différenciateurs ERP Afrique de l'Ouest
 */

import type {
  Lot,
  Produit,
  ProduitUnite,
  ProduitComposant,
  GrilleTarifaire,
  Promotion,
  CategorieClient,
} from '@/lib/supabase';

export type DluoStatut = 'perime' | 'critique_j7' | 'alerte_j30' | 'conforme' | 'sans_dluo';

export type FEFOAllocation = {
  lot: Lot;
  quantiteAllouee: number;
  joursRestants: number;
  statutDluo: DluoStatut;
};

/**
 * Détermine le statut DLUO d'un lot en fonction de sa date de péremption
 */
export function getDluoStatut(datePeremption: string | null | undefined): {
  statut: DluoStatut;
  joursRestants: number;
  badgeLabel: string;
  badgeClass: string;
} {
  if (!datePeremption) {
    return {
      statut: 'sans_dluo',
      joursRestants: 9999,
      badgeLabel: 'Sans DLUO',
      badgeClass: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300',
    };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(datePeremption);
  target.setHours(0, 0, 0, 0);

  const diffMs = target.getTime() - today.getTime();
  const jours = Math.ceil(diffMs / (1000 * 60 * 60 * 24));

  if (jours < 0) {
    return {
      statut: 'perime',
      joursRestants: jours,
      badgeLabel: `Périmé (${Math.abs(jours)}j)`,
      badgeClass: 'bg-red-500/15 text-red-500 border border-red-500/30 font-bold animate-pulse',
    };
  }
  if (jours <= 7) {
    return {
      statut: 'critique_j7',
      joursRestants: jours,
      badgeLabel: `Urgent : J-${jours}`,
      badgeClass: 'bg-amber-500/15 text-amber-500 border border-amber-500/30 font-bold',
    };
  }
  if (jours <= 30) {
    return {
      statut: 'alerte_j30',
      joursRestants: jours,
      badgeLabel: `Alerte : ${jours}j`,
      badgeClass: 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border border-yellow-500/30',
    };
  }
  return {
    statut: 'conforme',
    joursRestants: jours,
    badgeLabel: `Valide (${jours}j)`,
    badgeClass: 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/30',
  };
}

/**
 * Algorithme FEFO (First Expired, First Out)
 * Sélectionne automatiquement les lots disponibles qui expirent le plus tôt
 */
export function calculerSortieFEFO(
  lots: Lot[],
  produitId: string,
  quantiteDemandee: number,
  siteId?: string | null
): {
  allocations: FEFOAllocation[];
  quantiteRestanteNonAllouee: number;
  estTotalementSatisfait: boolean;
} {
  // Filtrer les lots actifs et disponibles
  const lotsDisponibles = lots
    .filter(
      (l) =>
        l.produit_id === produitId &&
        (l.statut === undefined || l.statut === 'actif') &&
        l.quantite > 0 &&
        (!siteId || siteId === 'all' || l.entrepot_id === siteId)
    )
    .sort((a, b) => {
      // Les lots périmés ou les plus proches d'expirer en premier
      const d1 = a.date_peremption || '9999-12-31';
      const d2 = b.date_peremption || '9999-12-31';
      return d1.localeCompare(d2);
    });

  let reste = quantiteDemandee;
  const allocations: FEFOAllocation[] = [];

  for (const lot of lotsDisponibles) {
    if (reste <= 0) break;
    const allouer = Math.min(lot.quantite, reste);
    const dluo = getDluoStatut(lot.date_peremption);

    allocations.push({
      lot,
      quantiteAllouee: allouer,
      joursRestants: dluo.joursRestants,
      statutDluo: dluo.statut,
    });

    reste -= allouer;
  }

  return {
    allocations,
    quantiteRestanteNonAllouee: Math.max(reste, 0),
    estTotalementSatisfait: reste <= 0,
  };
}

/**
 * Calculateur de valorisation globale du stock
 * Supporte le Coût Moyen Unitaire Pondéré (CMUP) et le First-In, First-Out (FIFO)
 */
export function calculerValorisationStock(
  produits: Produit[],
  lots: Lot[],
  methode: 'cmup' | 'fifo' = 'cmup',
  siteId?: string | null
): {
  valeurTotale: number;
  totalArticles: number;
  nombreReferences: number;
  details: { id: string; nom: string; quantite: number; coutUnitaire: number; sousTotal: number }[];
} {
  if (methode === 'fifo') {
    // Valorisation FIFO basée sur les lots actifs en stock
    const lotsActifs = lots.filter(
      (l) =>
        (l.statut === undefined || l.statut === 'actif') &&
        l.quantite > 0 &&
        (!siteId || siteId === 'all' || l.entrepot_id === siteId)
    );

    const mapProduits: Record<string, { nom: string; quantite: number; valeur: number }> = {};

    for (const l of lotsActifs) {
      const prod = produits.find((p) => p.id === l.produit_id);
      const nom = prod?.nom || 'Produit inconnu';
      if (!mapProduits[l.produit_id]) {
        mapProduits[l.produit_id] = { nom, quantite: 0, valeur: 0 };
      }
      mapProduits[l.produit_id].quantite += l.quantite;
      mapProduits[l.produit_id].valeur += l.quantite * (l.prix_unitaire || prod?.prix_unitaire || 0);
    }

    const details = Object.entries(mapProduits).map(([id, item]) => ({
      id,
      nom: item.nom,
      quantite: item.quantite,
      coutUnitaire: item.quantite > 0 ? Math.round(item.valeur / item.quantite) : 0,
      sousTotal: Math.round(item.valeur),
    }));

    const valeurTotale = details.reduce((sum, d) => sum + d.sousTotal, 0);
    const totalArticles = details.reduce((sum, d) => sum + d.quantite, 0);

    return {
      valeurTotale,
      totalArticles,
      nombreReferences: details.length,
      details,
    };
  }

  // Méthode par défaut : CMUP
  const details = produits.map((p) => {
    const cout = p.cmup > 0 ? p.cmup : p.prix_unitaire || 0;
    const sousTotal = Math.round(p.quantite * cout);
    return {
      id: p.id,
      nom: p.nom,
      quantite: p.quantite,
      coutUnitaire: cout,
      sousTotal,
    };
  });

  const valeurTotale = details.reduce((sum, d) => sum + d.sousTotal, 0);
  const totalArticles = details.reduce((sum, d) => sum + d.quantite, 0);

  return {
    valeurTotale,
    totalArticles,
    nombreReferences: produits.length,
    details,
  };
}

/**
 * Calculateur de prix par grille tarifaire et code promo
 */
export function calculerPrixClient(params: {
  produit: Produit;
  categorieClient?: CategorieClient | string;
  quantite?: number;
  grilles?: GrilleTarifaire[];
  promo?: Promotion | null;
}): {
  prixBase: number;
  prixFinal: number;
  remiseUnitaire: number;
  remisePourcentage: number;
  motifTarif: string;
} {
  const { produit, categorieClient = 'detail', quantite = 1, grilles = [], promo } = params;
  const prixBase = produit.prix_vente;
  let prixTravail = prixBase;
  let motifTarif = 'Prix public catalogue';

  // 1. Recherche d'une grille tarifaire active pour la catégorie du client
  const grille = grilles.find(
    (g) => g.actif && g.categorie_client.toLowerCase() === categorieClient.toLowerCase()
  );

  if (grille) {
    // Vérifier si une ligne spécifique existe pour ce produit
    const ligneSpecifique = grille.lignes?.find(
      (l) => l.produit_id === produit.id && quantite >= l.quantite_min
    );

    if (ligneSpecifique?.prix_specifique !== null && ligneSpecifique?.prix_specifique !== undefined && ligneSpecifique.prix_specifique > 0) {
      prixTravail = ligneSpecifique.prix_specifique;
      motifTarif = `Grille ${grille.nom} (Prix négocié)`;
    } else if (ligneSpecifique?.remise_pourcentage && ligneSpecifique.remise_pourcentage > 0) {
      prixTravail = prixBase * (1 - ligneSpecifique.remise_pourcentage / 100);
      motifTarif = `Grille ${grille.nom} (-${ligneSpecifique.remise_pourcentage}%)`;
    } else if (grille.remise_globale_pourcentage > 0) {
      prixTravail = prixBase * (1 - grille.remise_globale_pourcentage / 100);
      motifTarif = `Remise ${grille.nom} (-${grille.remise_globale_pourcentage}%)`;
    }
  }

  // 2. Application de la promotion / coupon si actif
  if (promo && promo.actif) {
    const now = new Date();
    const debut = new Date(promo.date_debut);
    const fin = new Date(promo.date_fin);

    if (now >= debut && now <= fin) {
      if (promo.type_remise === 'pourcentage') {
        prixTravail = prixTravail * (1 - promo.valeur_remise / 100);
        motifTarif += ` + Code ${promo.code || promo.nom} (-${promo.valeur_remise}%)`;
      } else if (promo.type_remise === 'montant_fixe') {
        const remiseU = Math.min(promo.valeur_remise, prixTravail);
        prixTravail = Math.max(prixTravail - remiseU, 0);
        motifTarif += ` + Coupon ${promo.code || promo.nom} (-${remiseU} FCFA)`;
      }
    }
  }

  const prixFinal = Math.max(Math.round(prixTravail), 0);
  const remiseUnitaire = Math.max(prixBase - prixFinal, 0);
  const remisePourcentage = prixBase > 0 ? Math.round((remiseUnitaire / prixBase) * 100) : 0;

  return {
    prixBase,
    prixFinal,
    remiseUnitaire,
    remisePourcentage,
    motifTarif,
  };
}

/**
 * Calculateur de décrémentation des composants d'un kit composé (BOM)
 */
export function resoudreComposantsKit(
  kitProduitId: string,
  quantiteKit: number,
  composants: ProduitComposant[],
  produitsCatalogue: Produit[]
): {
  composant: Produit;
  quantiteRequise: number;
  stockDisponible: number;
  estSuffisant: boolean;
}[] {
  const BOM = composants.filter((c) => c.produit_parent_id === kitProduitId);

  return BOM.map((b) => {
    const compProduit = produitsCatalogue.find((p) => p.id === b.composant_produit_id);
    const qteParKit = b.quantite_composant * (1 + (b.perte_pourcentage || 0) / 100);
    const quantiteRequise = Math.ceil(quantiteKit * qteParKit);
    const stockDisponible = compProduit?.quantite || 0;

    return {
      composant: compProduit || ({ id: b.composant_produit_id, nom: 'Composant introuvable' } as Produit),
      quantiteRequise,
      stockDisponible,
      estSuffisant: stockDisponible >= quantiteRequise,
    };
  });
}
