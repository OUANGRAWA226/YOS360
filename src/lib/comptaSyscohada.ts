// ==============================================================================
// LOGIQUE MÉTIER PRÉ-COMPTABILITÉ SYSCOHADA RÉVISÉ (OHADA), TRÉSORERIE & COMMISSIONS
// YOS360 ERP — Zone UEMOA (Burkina Faso / OHADA)
// ==============================================================================

import type {
  ComptaCompte,
  ComptaJournal,
  ComptaPiece,
  ComptaEcriture,
  TresorerieMouvement,
  EquipeCollaborateur,
  PalierFidelite,
} from './supabase';

export interface PlanCompteStandard {
  numero: string;
  libelle: string;
  classe: number;
  type: 'actif' | 'passif' | 'charge' | 'produit' | 'tresorerie' | 'tiers' | 'ordinaire';
  lettrable: boolean;
}

// ------------------------------------------------------------------------------
// 1. PLAN DE COMPTES FONDAMENTAL SYSCOHADA RÉVISÉ (Classes 1 à 7)
// ------------------------------------------------------------------------------
export const PLAN_SYSCOHADA_STANDARD: PlanCompteStandard[] = [
  // CLASSE 1 : COMPTES DE RESSOURCES DURABLES
  { numero: '101000', libelle: 'Capital social', classe: 1, type: 'passif', lettrable: false },
  { numero: '110000', libelle: 'Report à nouveau (solde créditeur)', classe: 1, type: 'passif', lettrable: false },
  { numero: '131000', libelle: 'Résultat net de l\'exercice (Bénéfice)', classe: 1, type: 'passif', lettrable: false },
  { numero: '162000', libelle: 'Emprunts et dettes auprès des banques', classe: 1, type: 'passif', lettrable: false },

  // CLASSE 2 : COMPTES DE L'ACTIF IMMOBILISÉ
  { numero: '215000', libelle: 'Installations techniques et agencements', classe: 2, type: 'actif', lettrable: false },
  { numero: '218100', libelle: 'Matériel et mobilier de bureau', classe: 2, type: 'actif', lettrable: false },
  { numero: '218200', libelle: 'Matériel de transport', classe: 2, type: 'actif', lettrable: false },
  { numero: '218300', libelle: 'Matériel informatique et caisses tactiles', classe: 2, type: 'actif', lettrable: false },

  // CLASSE 3 : COMPTES DE STOCKS
  { numero: '311000', libelle: 'Marchandises en magasin principal', classe: 3, type: 'actif', lettrable: false },
  { numero: '312000', libelle: 'Marchandises en boutiques et dépôts secondaires', classe: 3, type: 'actif', lettrable: false },
  { numero: '321000', libelle: 'Matières premières et fournitures consommables', classe: 3, type: 'actif', lettrable: false },
  { numero: '335000', libelle: 'Emballages commerciaux et conditionnements', classe: 3, type: 'actif', lettrable: false },

  // CLASSE 4 : COMPTES DE TIERS
  { numero: '401100', libelle: 'Fournisseurs - Dettes ordinaires en compte', classe: 4, type: 'tiers', lettrable: true },
  { numero: '401200', libelle: 'Fournisseurs - Factures non parvenues', classe: 4, type: 'tiers', lettrable: true },
  { numero: '411100', libelle: 'Clients - Créances sur ventes', classe: 4, type: 'tiers', lettrable: true },
  { numero: '411200', libelle: 'Clients douteux ou litigieux', classe: 4, type: 'tiers', lettrable: true },
  { numero: '422000', libelle: 'Personnel - Rémunérations directes dues', classe: 4, type: 'tiers', lettrable: true },
  { numero: '443100', libelle: 'État - TVA facturée sur ventes (18%)', classe: 4, type: 'passif', lettrable: false },
  { numero: '445100', libelle: 'État - TVA déductible sur achats (18%)', classe: 4, type: 'actif', lettrable: false },
  { numero: '445200', libelle: 'État - TVA déductible sur services et charges (18%)', classe: 4, type: 'actif', lettrable: false },
  { numero: '444100', libelle: 'État - Impôt sur les bénéfices / Acomptes', classe: 4, type: 'passif', lettrable: false },

  // CLASSE 5 : COMPTES DE TRÉSORERIE
  { numero: '521000', libelle: 'Banques locales (Comptes courants)', classe: 5, type: 'tresorerie', lettrable: true },
  { numero: '521100', libelle: 'Orange Money Marchand', classe: 5, type: 'tresorerie', lettrable: true },
  { numero: '521200', libelle: 'Moov Money Marchand (Flooz)', classe: 5, type: 'tresorerie', lettrable: true },
  { numero: '521300', libelle: 'Wave Money Marchand', classe: 5, type: 'tresorerie', lettrable: true },
  { numero: '571000', libelle: 'Caisse principale (Espèces)', classe: 5, type: 'tresorerie', lettrable: true },
  { numero: '571100', libelle: 'Caisse secondaire Boutique 1', classe: 5, type: 'tresorerie', lettrable: true },
  { numero: '585000', libelle: 'Virements internes de trésorerie', classe: 5, type: 'tresorerie', lettrable: false },

  // CLASSE 6 : COMPTES DE CHARGES DES ACTIVITÉS ORDINAIRES
  { numero: '601000', libelle: 'Achats de marchandises HT', classe: 6, type: 'charge', lettrable: false },
  { numero: '605000', libelle: 'Achats de petits matériels et fournitures', classe: 6, type: 'charge', lettrable: false },
  { numero: '610000', libelle: 'Frais de transport de marchandises', classe: 6, type: 'charge', lettrable: false },
  { numero: '622000', libelle: 'Locations et charges locatives (Loyers)', classe: 6, type: 'charge', lettrable: false },
  { numero: '624000', libelle: 'Entretien, réparations et maintenance', classe: 6, type: 'charge', lettrable: false },
  { numero: '632000', libelle: 'Frais télécoms, internet et abonnements', classe: 6, type: 'charge', lettrable: false },
  { numero: '638000', libelle: 'Autres charges externes (Publicité, honoraires)', classe: 6, type: 'charge', lettrable: false },
  { numero: '640000', libelle: 'Impôts, taxes et droits d\'enregistrement', classe: 6, type: 'charge', lettrable: false },
  { numero: '661000', libelle: 'Salaires du personnel', classe: 6, type: 'charge', lettrable: false },
  { numero: '664000', libelle: 'Commissions et primes versées aux vendeurs', classe: 6, type: 'charge', lettrable: false },
  { numero: '671000', libelle: 'Frais bancaires et commissions de transfert', classe: 6, type: 'charge', lettrable: false },

  // CLASSE 7 : COMPTES DE PRODUITS DES ACTIVITÉS ORDINAIRES
  { numero: '701000', libelle: 'Ventes de marchandises en magasin HT', classe: 7, type: 'produit', lettrable: false },
  { numero: '706000', libelle: 'Prestations de services et livraisons facturées', classe: 7, type: 'produit', lettrable: false },
  { numero: '707000', libelle: 'Produits accessoires et prestations annexes', classe: 7, type: 'produit', lettrable: false },
];

export const JOURNAUX_SYSCOHADA_STANDARD = [
  { code: 'VE', libelle: 'Journal des Ventes', type: 'ventes', contrepartie: '411100' },
  { code: 'AC', libelle: 'Journal des Achats', type: 'achats', contrepartie: '401100' },
  { code: 'BQ', libelle: 'Journal de Banque', type: 'banque', contrepartie: '521000' },
  { code: 'CA', libelle: 'Journal de Caisse', type: 'caisse', contrepartie: '571000' },
  { code: 'MM', libelle: 'Journal Mobile Money', type: 'mobile_money', contrepartie: '521100' },
  { code: 'OD', libelle: 'Journal des Opérations Diverses', type: 'operations_diverses', contrepartie: '' },
];

// ------------------------------------------------------------------------------
// 2. CALCUL DE LA BALANCE GÉNÉRALE DES COMPTES
// ------------------------------------------------------------------------------
export interface LigneBalance {
  numero: string;
  libelle: string;
  classe: number;
  totalDebit: number;
  totalCredit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
}

export interface ResultatBalance {
  lignes: LigneBalance[];
  totalDebit: number;
  totalCredit: number;
  totalSoldeDebiteur: number;
  totalSoldeCrediteur: number;
  estEquilibree: boolean;
  ecart: number;
}

export function calculerBalanceGenerale(
  comptes: ComptaCompte[],
  ecritures: ComptaEcriture[]
): ResultatBalance {
  const mapCompte = new Map<string, { libelle: string; classe: number; debit: number; credit: number }>();

  // Pré-remplir avec tous les comptes du plan
  comptes.forEach((c) => {
    mapCompte.set(c.numero, {
      libelle: c.libelle,
      classe: c.classe,
      debit: 0,
      credit: 0,
    });
  });

  // Sommer les écritures
  ecritures.forEach((e) => {
    const entry = mapCompte.get(e.compte_numero);
    if (entry) {
      entry.debit += Number(e.debit) || 0;
      entry.credit += Number(e.credit) || 0;
    } else {
      mapCompte.set(e.compte_numero, {
        libelle: e.compte_libelle || 'Compte ' + e.compte_numero,
        classe: parseInt(e.compte_numero.charAt(0)) || 4,
        debit: Number(e.debit) || 0,
        credit: Number(e.credit) || 0,
      });
    }
  });

  const lignes: LigneBalance[] = [];
  let totalDebit = 0;
  let totalCredit = 0;
  let totalSoldeDebiteur = 0;
  let totalSoldeCrediteur = 0;

  // Trier les comptes par numéro croissant
  const numerosTries = Array.from(mapCompte.keys()).sort();

  numerosTries.forEach((num) => {
    const data = mapCompte.get(num)!;
    // On conserve les comptes qui ont un mouvement ou sont dans le plan
    if (data.debit > 0 || data.credit > 0) {
      const diff = data.debit - data.credit;
      const soldeDebiteur = diff > 0 ? diff : 0;
      const soldeCrediteur = diff < 0 ? Math.abs(diff) : 0;

      totalDebit += data.debit;
      totalCredit += data.credit;
      totalSoldeDebiteur += soldeDebiteur;
      totalSoldeCrediteur += soldeCrediteur;

      lignes.push({
        numero: num,
        libelle: data.libelle,
        classe: data.classe,
        totalDebit: Math.round(data.debit),
        totalCredit: Math.round(data.credit),
        soldeDebiteur: Math.round(soldeDebiteur),
        soldeCrediteur: Math.round(soldeCrediteur),
      });
    }
  });

  const ecart = Math.abs(totalDebit - totalCredit);
  const estEquilibree = ecart === 0;

  return {
    lignes,
    totalDebit: Math.round(totalDebit),
    totalCredit: Math.round(totalCredit),
    totalSoldeDebiteur: Math.round(totalSoldeDebiteur),
    totalSoldeCrediteur: Math.round(totalSoldeCrediteur),
    estEquilibree,
    ecart: Math.round(ecart),
  };
}

// ------------------------------------------------------------------------------
// 3. GRAND LIVRE COMPTABLE
// ------------------------------------------------------------------------------
export interface LigneGrandLivre {
  id: string;
  date_ecriture: string;
  piece_ref: string;
  libelle: string;
  tiers_nom?: string | null;
  debit: number;
  credit: number;
  soldeProgressif: number;
}

export interface CompteGrandLivre {
  compte_numero: string;
  compte_libelle: string;
  classe: number;
  ecritures: LigneGrandLivre[];
  totalDebit: number;
  totalCredit: number;
  soldeFinal: number;
}

export function calculerGrandLivre(ecritures: ComptaEcriture[]): CompteGrandLivre[] {
  const comptesMap = new Map<string, { libelle: string; ecritures: ComptaEcriture[] }>();

  // Grouper par compte
  ecritures.forEach((e) => {
    if (!comptesMap.has(e.compte_numero)) {
      comptesMap.set(e.compte_numero, {
        libelle: e.compte_libelle || 'Compte ' + e.compte_numero,
        ecritures: [],
      });
    }
    comptesMap.get(e.compte_numero)!.ecritures.push(e);
  });

  const resultat: CompteGrandLivre[] = [];

  const comptesSorted = Array.from(comptesMap.keys()).sort();

  comptesSorted.forEach((num) => {
    const item = comptesMap.get(num)!;
    // Trier les écritures par date puis id
    const sortedEcritures = item.ecritures.sort(
      (a, b) => new Date(a.date_ecriture).getTime() - new Date(b.date_ecriture).getTime()
    );

    let solde = 0;
    let totD = 0;
    let totC = 0;

    const lignes: LigneGrandLivre[] = sortedEcritures.map((e) => {
      const d = Number(e.debit) || 0;
      const c = Number(e.credit) || 0;
      totD += d;
      totC += c;
      solde += (d - c);

      return {
        id: e.id,
        date_ecriture: e.date_ecriture,
        piece_ref: e.piece?.reference_document || e.piece?.numero_piece || '—',
        libelle: e.libelle_ligne || e.piece?.libelle || 'Écriture comptable',
        tiers_nom: e.tiers_nom,
        debit: Math.round(d),
        credit: Math.round(c),
        soldeProgressif: Math.round(solde),
      };
    });

    resultat.push({
      compte_numero: num,
      compte_libelle: item.libelle,
      classe: parseInt(num.charAt(0)) || 4,
      ecritures: lignes,
      totalDebit: Math.round(totD),
      totalCredit: Math.round(totC),
      soldeFinal: Math.round(solde),
    });
  });

  return resultat;
}

// ------------------------------------------------------------------------------
// 4. GÉNÉRATEUR EXPORT FEC (Fichier des Écritures Comptables Norme OHADA)
// ------------------------------------------------------------------------------
export function genererExportFEC(ecritures: ComptaEcriture[]): string {
  // Format tabulaire standard normalisé :
  // JournalCode|JournalLib|EcritureNum|EcritureDate|CompteNum|CompteLib|CompAuxNum|CompAuxLib|PieceRef|PieceDate|EcritureLib|Debit|Credit|EcritureLet|DateLet|ValidDate|Montantdevise|Idevise
  const headers = [
    'JournalCode',
    'JournalLib',
    'EcritureNum',
    'EcritureDate',
    'CompteNum',
    'CompteLib',
    'CompAuxNum',
    'CompAuxLib',
    'PieceRef',
    'PieceDate',
    'EcritureLib',
    'Debit',
    'Credit',
    'EcritureLet',
    'DateLet',
    'ValidDate',
    'Montantdevise',
    'Idevise',
  ];

  const rows = ecritures.map((e) => {
    const journalCode = e.piece?.journal?.code || 'OD';
    const journalLib = e.piece?.journal?.libelle || 'Opérations Diverses';
    const numPiece = e.piece?.numero_piece || 'PC-0000';
    const dateEcr = (e.date_ecriture || '').replace(/-/g, '');
    const cNum = e.compte_numero;
    const cLib = (e.compte_libelle || '').replace(/[|;]/g, ' ');
    const auxNum = e.tiers_id ? e.tiers_id.slice(0, 8) : '';
    const auxLib = (e.tiers_nom || '').replace(/[|;]/g, ' ');
    const pieceRef = e.piece?.reference_document || numPiece;
    const pieceDate = (e.piece?.date_piece || e.date_ecriture || '').replace(/-/g, '');
    const libelleLigne = (e.libelle_ligne || e.piece?.libelle || 'Ecriture').replace(/[|;]/g, ' ');
    const debit = Math.round(Number(e.debit) || 0);
    const credit = Math.round(Number(e.credit) || 0);
    const lettrage = e.lettrage || '';

    return [
      journalCode,
      journalLib,
      numPiece,
      dateEcr,
      cNum,
      cLib,
      auxNum,
      auxLib,
      pieceRef,
      pieceDate,
      libelleLigne,
      debit,
      credit,
      lettrage,
      '',
      dateEcr,
      debit > 0 ? debit : credit,
      'XOF',
    ].join('\t');
  });

  return [headers.join('\t'), ...rows].join('\r\n');
}

export function telechargerFichier(contenu: string, nomFichier: string, mimeType: string = 'text/plain') {
  const blob = new Blob([contenu], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nomFichier;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ------------------------------------------------------------------------------
// 5. MOTEUR DE RAPPROCHEMENT BANCAIRE
// ------------------------------------------------------------------------------
export interface ResultatRapprochement {
  soldeComptableTheorique: number;
  soldeReleveBancaire: number;
  totalMouvementsRapproches: number;
  totalMouvementsEnSuspens: number;
  ecartRapprochement: number;
  estConforme: boolean;
}

export function calculerRapprochementBancaire(
  mouvements: TresorerieMouvement[],
  soldeInitial: number,
  soldeReleve: number
): ResultatRapprochement {
  let soldeComptable = soldeInitial;
  let totalRapproches = 0;
  let totalEnSuspens = 0;

  mouvements.forEach((m) => {
    const montantSigne = m.type === 'encaissement' ? Number(m.montant) : -Number(m.montant);
    soldeComptable += montantSigne;

    if (m.statut_rapprochement === 'rapproche') {
      totalRapproches += montantSigne;
    } else {
      totalEnSuspens += montantSigne;
    }
  });

  const soldeRapprocheTheorique = soldeInitial + totalRapproches;
  const ecart = Math.round(soldeReleve - soldeRapprocheTheorique);

  return {
    soldeComptableTheorique: Math.round(soldeComptable),
    soldeReleveBancaire: Math.round(soldeReleve),
    totalMouvementsRapproches: Math.round(totalRapproches),
    totalMouvementsEnSuspens: Math.round(totalEnSuspens),
    ecartRapprochement: ecart,
    estConforme: ecart === 0,
  };
}

// ------------------------------------------------------------------------------
// 6. MOTEUR DE COMMISSIONS VENDEURS & ATTEINTE D'OBJECTIFS
// ------------------------------------------------------------------------------
export interface SyntheseCommissionVendeur {
  collaborateurId: string;
  nomComplet: string;
  matricule: string;
  poste: string;
  salaireBase: number;
  totalVentesMois: number;
  totalMargeMois: number;
  tauxCommissionPct: number;
  montantCommission: number;
  objectifCa: number;
  tauxAtteintePct: number;
  primeObjectif: number;
  totalNetAPayer: number;
}

export function evaluerCommissionsCollaborateur(
  collaborateur: EquipeCollaborateur,
  totalVentes: number,
  totalMarge: number,
  objectifCa: number = 0,
  primeObjectif: number = 0
): SyntheseCommissionVendeur {
  const base = collaborateur.base_calcul_commission === 'marge_brute' ? totalMarge : totalVentes;
  const montantCommission = Math.round(base * (collaborateur.taux_commission_pct / 100));

  let tauxAtteinte = 0;
  if (objectifCa > 0) {
    tauxAtteinte = Math.round((totalVentes / objectifCa) * 100);
  }

  const primeGagnee = tauxAtteinte >= 100 ? primeObjectif : 0;
  const totalNet = Math.round(collaborateur.salaire_base + montantCommission + primeGagnee);

  return {
    collaborateurId: collaborateur.id,
    nomComplet: `${collaborateur.prenom} ${collaborateur.nom}`,
    matricule: collaborateur.matricule,
    poste: collaborateur.poste,
    salaireBase: collaborateur.salaire_base,
    totalVentesMois: Math.round(totalVentes),
    totalMargeMois: Math.round(totalMarge),
    tauxCommissionPct: collaborateur.taux_commission_pct,
    montantCommission,
    objectifCa: Math.round(objectifCa),
    tauxAtteintePct: tauxAtteinte,
    primeObjectif: primeGagnee,
    totalNetAPayer: totalNet,
  };
}

// ------------------------------------------------------------------------------
// 7. MOTEUR DE FIDÉLITÉ CLIENT & PALIERS (UEMOA)
// ------------------------------------------------------------------------------
export const PALIERS_CONFIG = {
  bronze: { label: 'Bronze', seuilMin: 0, seuilMax: 99999, couleur: '#cd7f32', bonusPct: 0 },
  argent: { label: 'Argent', seuilMin: 100000, seuilMax: 499999, couleur: '#94a3b8', bonusPct: 5 },
  or: { label: 'Or', seuilMin: 500000, seuilMax: 1999999, couleur: '#f59e0b', bonusPct: 10 },
  platine: { label: 'Platine', seuilMin: 2000000, seuilMax: Infinity, couleur: '#8b5cf6', bonusPct: 20 },
};

export const VALEUR_POINT_FCFA = 25; // 1 point = 25 FCFA de réduction

export function calculerPointsGagnesFidelite(montant: number, palier: PalierFidelite = 'bronze'): number {
  if (montant < 1000) return 0;
  const basePoints = Math.floor(montant / 1000);
  const bonus = PALIERS_CONFIG[palier]?.bonusPct || 0;
  return Math.round(basePoints * (1 + bonus / 100));
}

export function determinerPalierFidelite(cumulDepenses: number): PalierFidelite {
  if (cumulDepenses >= 2000000) return 'platine';
  if (cumulDepenses >= 500000) return 'or';
  if (cumulDepenses >= 100000) return 'argent';
  return 'bronze';
}

// ------------------------------------------------------------------------------
// 8. ÉTATS FINANCIERS SYSCOHADA RÉVISÉ (OHADA) : COMPTE DE RÉSULTAT & SIG
// ------------------------------------------------------------------------------

export interface SoldesIntermediairesGestion {
  // 1. Marge commerciale
  ventesMarchandises: number; // 701
  achatsMarchandises: number; // 601
  variationStocksMarchandises: number; // 6031
  margeCommerciale: number;

  // 2. Production de l'exercice
  productionVendue: number; // 702 - 706
  productionStockee: number; // 73
  productionImmobilisee: number; // 72
  productionExercice: number;

  // 3. Consommation de l'exercice
  achatsMatieres: number; // 602
  variationStocksMatieres: number; // 6032
  autresAchatsConsommables: number; // 604 - 608
  transports: number; // 61
  servicesExterieurs: number; // 62 - 63
  consommationExercice: number;

  // 4. Valeur Ajoutée (VA)
  valeurAjoutee: number;

  // 5. Excédent Brut d'Exploitation (EBE)
  subventionsExploitation: number; // 71
  chargesPersonnel: number; // 66
  impotsTaxes: number; // 64
  excedentBrutExploitation: number;

  // 6. Résultat d'Exploitation (RE)
  autresProduitsExploitation: number; // 75
  reprisesProvisionsExploitation: number; // 79
  dotationsAmortissements: number; // 68
  autresChargesExploitation: number; // 65
  resultatExploitation: number;

  // 7. Résultat Financier (RF)
  produitsFinanciers: number; // 77
  chargesFinancieres: number; // 67
  resultatFinancier: number;

  // 8. Résultat des Activités Ordinaires (RAO)
  resultatActivitesOrdinaires: number;

  // 9. Résultat Hors Activités Ordinaires (RHAO)
  produitsHAO: number; // 82, 84, 86, 88
  chargesHAO: number; // 81, 83, 85
  resultatHAO: number;

  // 10. Résultat Net de l'Exercice (RN)
  impotsSurBenefices: number; // 89
  resultatNet: number;
  sensResultat: 'benefice' | 'perte' | 'equilibre';
}

export function calculerCompteDeResultatOHADA(ecritures: ComptaEcriture[]): SoldesIntermediairesGestion {
  const soldes = new Map<string, number>();

  // Agréger le solde net de chaque compte (Crédit - Débit pour produits 7/8, Débit - Crédit pour charges 6/8)
  ecritures.forEach((e) => {
    const num = e.compte_numero;
    const debit = Number(e.debit) || 0;
    const credit = Number(e.credit) || 0;

    const current = soldes.get(num) || 0;
    soldes.set(num, current + (debit - credit)); // Solde débiteur par défaut
  });

  const getSoldeDebit = (prefix: string): number => {
    let tot = 0;
    soldes.forEach((val, num) => {
      if (num.startsWith(prefix)) tot += val;
    });
    return Math.max(0, tot);
  };

  const getSoldeCredit = (prefix: string): number => {
    let tot = 0;
    soldes.forEach((val, num) => {
      if (num.startsWith(prefix)) tot += -val; // Crédit net
    });
    return Math.max(0, tot);
  };

  // 1. Marge commerciale
  const ventesMarchandises = getSoldeCredit('701');
  const achatsMarchandises = getSoldeDebit('601');
  const variationStocksMarchandises = getSoldeDebit('6031');
  const margeCommerciale = ventesMarchandises - (achatsMarchandises + variationStocksMarchandises);

  // 2. Production
  const productionVendue = getSoldeCredit('706') + getSoldeCredit('707');
  const productionStockee = getSoldeCredit('73');
  const productionImmobilisee = getSoldeCredit('72');
  const productionExercice = productionVendue + productionStockee + productionImmobilisee;

  // 3. Consommation
  const achatsMatieres = getSoldeDebit('602');
  const variationStocksMatieres = getSoldeDebit('6032');
  const autresAchatsConsommables = getSoldeDebit('605');
  const transports = getSoldeDebit('61');
  const servicesExterieurs = getSoldeDebit('62') + getSoldeDebit('63');
  const consommationExercice = achatsMatieres + variationStocksMatieres + autresAchatsConsommables + transports + servicesExterieurs;

  // 4. Valeur Ajoutée
  const valeurAjoutee = (margeCommerciale + productionExercice) - consommationExercice;

  // 5. EBE
  const subventionsExploitation = getSoldeCredit('71');
  const chargesPersonnel = getSoldeDebit('66');
  const impotsTaxes = getSoldeDebit('64');
  const excedentBrutExploitation = valeurAjoutee + subventionsExploitation - (chargesPersonnel + impotsTaxes);

  // 6. Résultat d'Exploitation
  const autresProduitsExploitation = getSoldeCredit('75');
  const reprisesProvisionsExploitation = getSoldeCredit('79');
  const dotationsAmortissements = getSoldeDebit('68') + getSoldeDebit('69');
  const autresChargesExploitation = getSoldeDebit('65');
  const resultatExploitation = excedentBrutExploitation + autresProduitsExploitation + reprisesProvisionsExploitation - (dotationsAmortissements + autresChargesExploitation);

  // 7. Résultat Financier
  const produitsFinanciers = getSoldeCredit('77');
  const chargesFinancieres = getSoldeDebit('67');
  const resultatFinancier = produitsFinanciers - chargesFinancieres;

  // 8. RAO
  const resultatActivitesOrdinaires = resultatExploitation + resultatFinancier;

  // 9. RHAO
  const produitsHAO = getSoldeCredit('82') + getSoldeCredit('84') + getSoldeCredit('86') + getSoldeCredit('88');
  const chargesHAO = getSoldeDebit('81') + getSoldeDebit('83') + getSoldeDebit('85');
  const resultatHAO = produitsHAO - chargesHAO;

  // 10. Résultat Net
  const impotsSurBenefices = getSoldeDebit('89');
  const resultatNet = Math.round(resultatActivitesOrdinaires + resultatHAO - impotsSurBenefices);

  return {
    ventesMarchandises: Math.round(ventesMarchandises),
    achatsMarchandises: Math.round(achatsMarchandises),
    variationStocksMarchandises: Math.round(variationStocksMarchandises),
    margeCommerciale: Math.round(margeCommerciale),

    productionVendue: Math.round(productionVendue),
    productionStockee: Math.round(productionStockee),
    productionImmobilisee: Math.round(productionImmobilisee),
    productionExercice: Math.round(productionExercice),

    achatsMatieres: Math.round(achatsMatieres),
    variationStocksMatieres: Math.round(variationStocksMatieres),
    autresAchatsConsommables: Math.round(autresAchatsConsommables),
    transports: Math.round(transports),
    servicesExterieurs: Math.round(servicesExterieurs),
    consommationExercice: Math.round(consommationExercice),

    valeurAjoutee: Math.round(valeurAjoutee),

    subventionsExploitation: Math.round(subventionsExploitation),
    chargesPersonnel: Math.round(chargesPersonnel),
    impotsTaxes: Math.round(impotsTaxes),
    excedentBrutExploitation: Math.round(excedentBrutExploitation),

    autresProduitsExploitation: Math.round(autresProduitsExploitation),
    reprisesProvisionsExploitation: Math.round(reprisesProvisionsExploitation),
    dotationsAmortissements: Math.round(dotationsAmortissements),
    autresChargesExploitation: Math.round(autresChargesExploitation),
    resultatExploitation: Math.round(resultatExploitation),

    produitsFinanciers: Math.round(produitsFinanciers),
    chargesFinancieres: Math.round(chargesFinancieres),
    resultatFinancier: Math.round(resultatFinancier),

    resultatActivitesOrdinaires: Math.round(resultatActivitesOrdinaires),

    produitsHAO: Math.round(produitsHAO),
    chargesHAO: Math.round(chargesHAO),
    resultatHAO: Math.round(resultatHAO),

    impotsSurBenefices: Math.round(impotsSurBenefices),
    resultatNet,
    sensResultat: resultatNet > 0 ? 'benefice' : resultatNet < 0 ? 'perte' : 'equilibre',
  };
}

// ------------------------------------------------------------------------------
// 9. ÉTATS FINANCIERS SYSCOHADA RÉVISÉ (OHADA) : BILAN ACTIF / PASSIF
// ------------------------------------------------------------------------------

export interface BilanOHADA {
  actif: {
    actifImmobilise: {
      immobilisationsIncorporelles: number; // 21
      immobilisationsCorporelles: number; // 22, 23, 24
      immobilisationsFinancieres: number; // 26, 27
      total: number;
    };
    actifCirculant: {
      stocksMarchandises: number; // 31, 32
      creancesClients: number; // 41
      autresCreances: number; // 42, 43, 44, 47
      total: number;
    };
    tresorerieActif: {
      banques: number; // 52
      caisses: number; // 57
      mobileMoney: number; // 5211, 5212, 5213
      total: number;
    };
    totalGeneralActif: number;
  };
  passif: {
    capitauxPropres: {
      capitalSocial: number; // 10
      reportANouveau: number; // 11, 12
      resultatNetExercice: number; // 13 (synchronisé avec le compte de résultat)
      dettesFinancieres: number; // 16
      total: number;
    };
    passifCirculant: {
      dettesFournisseurs: number; // 40
      dettesFiscalesSociales: number; // 42, 43, 44
      autresDettes: number; // 47, 48
      total: number;
    };
    tresoreriePassif: {
      decouvertsBancaires: number; // 56
      total: number;
    };
    totalGeneralPassif: number;
  };
  equilibre: {
    ecart: number;
    estEquilibre: boolean;
  };
}

export function calculerBilanOHADA(
  ecritures: ComptaEcriture[],
  resultatNet: number
): BilanOHADA {
  const soldes = new Map<string, number>();

  ecritures.forEach((e) => {
    const num = e.compte_numero;
    const debit = Number(e.debit) || 0;
    const credit = Number(e.credit) || 0;
    const diff = debit - credit; // > 0 = Solde débiteur (Actif), < 0 = Solde créditeur (Passif)

    soldes.set(num, (soldes.get(num) || 0) + diff);
  });

  const getSoldeActif = (prefixes: string[]): number => {
    let tot = 0;
    soldes.forEach((val, num) => {
      if (prefixes.some((p) => num.startsWith(p)) && val > 0) tot += val;
    });
    return Math.round(tot);
  };

  const getSoldePassif = (prefixes: string[]): number => {
    let tot = 0;
    soldes.forEach((val, num) => {
      if (prefixes.some((p) => num.startsWith(p)) && val < 0) tot += Math.abs(val);
    });
    return Math.round(tot);
  };

  // Actif Immobilisé
  const immoIncorp = getSoldeActif(['21']);
  const immoCorp = getSoldeActif(['22', '23', '24', '215', '218']);
  const immoFin = getSoldeActif(['26', '27']);
  const totImmo = immoIncorp + immoCorp + immoFin;

  // Actif Circulant
  const stocks = getSoldeActif(['31', '32', '33']);
  const clients = getSoldeActif(['41']);
  const autresCreances = getSoldeActif(['42', '43', '445', '47']);
  const totActifCirculant = stocks + clients + autresCreances;

  // Trésorerie Actif
  const banques = getSoldeActif(['5210']);
  const mobileMoney = getSoldeActif(['5211', '5212', '5213']);
  const caisses = getSoldeActif(['57']);
  const totTresorerieActif = banques + mobileMoney + caisses;

  const totalGeneralActif = totImmo + totActifCirculant + totTresorerieActif;

  // Passif : Capitaux propres
  const capital = getSoldePassif(['101', '10']);
  const report = getSoldePassif(['11', '12']);
  const dettesFin = getSoldePassif(['16']);
  const totCapitaux = capital + report + dettesFin + resultatNet;

  // Passif Circulant
  const fournisseurs = getSoldePassif(['40']);
  const dettesFiscales = getSoldePassif(['42', '43', '443', '444']);
  const autresDettes = getSoldePassif(['47', '48']);
  const totPassifCirculant = fournisseurs + dettesFiscales + autresDettes;

  // Trésorerie Passif
  const decouverts = getSoldePassif(['56']);
  const totTresoreriePassif = decouverts;

  const totalGeneralPassif = totCapitaux + totPassifCirculant + totTresoreriePassif;

  const ecart = Math.abs(totalGeneralActif - totalGeneralPassif);

  return {
    actif: {
      actifImmobilise: {
        immobilisationsIncorporelles: immoIncorp,
        immobilisationsCorporelles: immoCorp,
        immobilisationsFinancieres: immoFin,
        total: totImmo,
      },
      actifCirculant: {
        stocksMarchandises: stocks,
        creancesClients: clients,
        autresCreances: autresCreances,
        total: totActifCirculant,
      },
      tresorerieActif: {
        banques,
        caisses,
        mobileMoney,
        total: totTresorerieActif,
      },
      totalGeneralActif,
    },
    passif: {
      capitauxPropres: {
        capitalSocial: capital,
        reportANouveau: report,
        resultatNetExercice: Math.round(resultatNet),
        dettesFinancieres: dettesFin,
        total: totCapitaux,
      },
      passifCirculant: {
        dettesFournisseurs: fournisseurs,
        dettesFiscalesSociales: dettesFiscales,
        autresDettes: autresDettes,
        total: totPassifCirculant,
      },
      tresoreriePassif: {
        decouvertsBancaires: decouverts,
        total: totTresoreriePassif,
      },
      totalGeneralPassif,
    },
    equilibre: {
      ecart,
      estEquilibre: ecart === 0,
    },
  };
}

