# Journal des Modifications (CHANGELOG) — YOS360 ERP

Tous les changements notables apportés au projet YOS360 sont consignés dans ce document.

---

## [Phase 1] — 19 Octobre 2026 : Socle Sécurisé & Opérations Vitales

### 1. Sécurité & Contrôle d'Accès (RBAC Granulaire BDD)
- **Correction critique de l'étanchéité multi-tenant (RLS)** :
  - Remplacement du contrôle vulnérable `is_admin()` par `public.is_super_admin()` (vérifiant strictement `super_admin = true`).
  - Aucun administrateur de tenant ne peut désormais accéder ou visualiser les données d'autres entreprises.
- **Modèle de Permissions Dynamique en Base de Données** :
  - Création des tables `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sites`, `user_sessions`.
  - Intégration des 6 rôles fondamentaux d'entreprise :
    1. `Propriétaire` (Accès intégral)
    2. `Gérant` (Direction opérationnelle)
    3. `Comptable` (Gestion financière & trésorerie)
    4. `Magasinier` (Mouvements, réceptions, comptages)
    5. `Caissier` (Encaissements POS & clôtures)
    6. `Vendeur` (Devis, commandes clients, catalogue)
  - Matrice visuelle de permissions (Modules × Actions) dans `Paramètres > Utilisateurs & Rôles`.
  - Écran d'assignation des sites/boutiques par utilisateur.
  - Gestion des sessions actives avec révocation instantanée en un clic et politique 2FA (TOTP).

### 2. Module Achats & Approvisionnements Complet
- **Chaîne documentaire intégrale** :
  - **Demandes d'Achat (DA)** : Expression interne des besoins sans engagement financier immédiat avec degré d'urgence (`normale`, `haute`, `critique`).
  - **Conversion 1-Clic** : Transformation automatique d'une DA approuvée en Bon de Commande Fournisseur pré-rempli.
  - **Bons de Commande Fournisseur (BC)** : Émission formelle, sélection du site de livraison, suivi des dates de livraison prévues.
  - **Réceptions & Recalcul du CMUP** : Validation des réceptions physiques de marchandises en magasin avec calcul automatique du Coût Moyen Unitaire Pondéré (CMUP).
  - **Rapprochement 3-Voies (BC / Réception / Facture)** : Comparaison systématique des quantités commandées, réceptionnées et facturées avec détection d'écarts et signalement des reliquats.
  - **Retours Fournisseurs** : Déclaration des litiges (avaries, non-conformités) avec sortie immédiate du stock et traçabilité pour avoirs fournisseurs.

### 3. Ventes & Facturation Conforme UEMOA
- **Chaîne documentaire Ventes** :
  - Devis (`DEV-`) → Commandes clients (`CMD-`) → Bons de livraison (`BL-`) → Factures de vente (`FAC-`) → Avoirs (`AVO-`).
- **Règle d'inviolabilité des factures** :
  - Trigger PostgreSQL `check_facture_inviolability` interdisant toute modification ou suppression d'une facture validée ou payée. Les corrections doivent obligatoirement passer par un avoir officiel.
- **Conformité fiscale UEMOA / Burkina Faso** :
  - Paramétrage et affichage officiel sur tous les documents commerciaux des mentions légales : Numéro IFU, RCCM, Division fiscale, TVA légale à 18%.

### 4. Caisse Tactile (POS) Professionnelle & Sessions
- **Cycle complet d'une session de caisse** :
  - Ouverture obligatoire avec fond de caisse initial (espèces).
  - Suivi en temps réel des ventes, encaissements espèces et Mobile Money.
  - Clôture avec comptage physique détaillé (espèces et coupons Mobile Money) et calcul automatique de l'écart de caisse.
  - Génération et impression du **Ticket Z** (rapport fiscal et récapitulatif journalier).
- **Paiements Fractionnés / Multiples** :
  - Possibilité de régler un panier par plusieurs moyens combinés (ex: 5 000 FCFA Espèces + 15 000 FCFA Orange Money + solde à crédit).
- **Plafond de Crédit Bloquant** :
  - Vérification automatique de l'encours maximum (`encours_max`) du client lors des ventes à crédit.
- **Mode Hors-Ligne Robuste** :
  - Encaissement local et stockage complet dans IndexedDB en l'absence de réseau (`!navigator.onLine`).
  - Impression du ticket thermique avec mention `[MODE HORS-LIGNE]`.
  - File de synchronisation locale rejouant les écritures dès le retour de la connectivité.

### 5. Paiements, Mobile Money & Balance Âgée
- **Table unifiée `payments`** :
  - Prise en charge des paiements clients et règlements fournisseurs.
  - Adaptateurs Mobile Money ouest-africains : Orange Money, Moov Money (Flooz), Wave, Espèces, Virement, Chèque, Carte bancaire.
- **Balance Âgée Interactive (Aged Trial Balance)** :
  - Ventilation en 4 tranches d'ancienneté :
    1. 0 à 30 jours (Non échu / Courant)
    2. 31 à 60 jours (Retard modéré)
    3. 61 à 90 jours (Alerte recouvrement)
    4. +90 jours (Créances critiques / Risque contentieux)
  - Relance WhatsApp personnalisée en un clic avec message pré-rempli.

### 6. Restructuration de la Navigation & Espaces
- **Menu Entreprise 9 Sections Conforme** :
  - Vue d'ensemble, Ventes, Achats, Stock, Multi-sites, Tiers, Finance, Équipe, Administration.
  - Renommage de "Inventaires" en "Comptages de stock".
  - Fusion de "Préférences" et "Entreprise" dans "Paramètres".
  - Remplacement des exports/imports isolés par le **Centre Import/Export** unifié (Produits, Clients, Fournisseurs, Stock initial, Tarifs).
  - Suppression de tous les faux badges statiques (`SCAN`, `AUTO`, `VENTE`, `POS`) au profit de compteurs dynamiques réels connectés aux alertes et statuts.
  - Sélecteur de site global dans l'en-tête (`Tous les sites` / sélection spécifique).
  - Bandeau d'avertissement d'impersonation pour le Super Admin avec audit log.

---

## [Phase 2] — 20 Octobre 2026 : Stock Avancé, Tarifs & Automatisations

### 1. Traçabilité Fine des Lots, DLUO & Déstockage FEFO
- **Gestion Complète des Lots & Numéros de Série** :
  - Enrichissement de la table `lots` (`statut` [actif, quarantaine, rejete, epuise], `fabricant`, `date_fabrication`, `notes`, `deleted_at`).
  - Fonction utilitaire `getDluoStatut(date_peremption)` calculant le statut d'alerte :
    - `perime` (Périmé)
    - `critique_j7` (Alerte critique J-7)
    - `alerte_j30` (Alerte préventive J-30)
    - `conforme` (Conforme)
    - `sans_dluo` (Sans date d'expiration)
- **Algorithme Automatique FEFO (First Expired, First Out)** :
  - Fonction TypeScript `calculerSortieFEFO(lots, quantiteDemandee)` allouant en priorité les lots actifs, non-quarantaine, expirant le plus tôt.
  - Fonction PostgreSQL atomique `rpc_fefo_proposer_lots` exécutable côté base de données pour allocation garantie en haute concurrence.
- **Écran AdminLTE Dédié « Lots & Péremptions »** :
  - Métriques d'alertes en temps réel (Total Lots, Alertes J-30, Critiques J-7, Périmés, En quarantaine).
  - Bascule rapide en Quarantaine / Réactivation en un clic avec motif.
  - **Simulateur FEFO interactif** permettant de tester l'allocation de n'importe quel produit et quantité.

### 2. Valorisation du Stock (CMUP & FIFO)
- **Méthode paramétrable par entreprise** :
  - Colonne `methode_valorisation` ('cmup' | 'fifo') dans `entreprises`.
  - Fonction PostgreSQL `rpc_calcul_valorisation_stock` calculant la valeur totale de l'inventaire en FCFA.
  - Formule CMUP : `sum(quantite * cmup)` ou `prix_achat` par défaut.
  - Formule FIFO : valorisation lot par lot `sum(quantite * prix_unitaire)` pour les lots actifs.
  - InfoBox de valorisation totale intégrée dans le catalogue Produits.

### 3. Nomenclatures, Variantes & Conditionnements Avancés
- **Unités & Conditionnements Multiples (`produit_unites`)** :
  - Coefficients de conversion stricts (ex: 1 Carton = 10 Paquets = 100 Pièces).
  - Code-barre spécifique par unité de conditionnement.
  - Calcul automatique du prix conseillé par conditionnement.
- **Variantes Matricielles (`produit_variantes`)** :
  - Support des attributs dynamiques JSONB (Taille, Couleur, Poids, Format).
  - SKU et code-barres uniques par variante avec ajustement de prix.
- **Kits & Produits Composés / BOM (`produit_composants`)** :
  - Définition de la nomenclature (Bill of Materials) : composants requis et quantités.
  - Prise en compte du coût de main-d'œuvre et calcul automatique du coût de revient du kit.
  - Résolution des composants (`resoudreComposantsKit`) pour déstockage automatique lors des ventes.
- **Composants d'interface AdminLTE intégrés** :
  - Boutons d'action rapides sur chaque ligne du catalogue Produits pour ouvrir les modals `Unités`, `Variantes`, et `Kit / BOM`.

### 4. Ajustements de Stock Réglementés
- **Motifs Réglementaires Obligatoires** :
  - `casse`, `vol`, `echantillon`, `peremption`, `ecart_inventaire`, `revalorisation`.
- **Seuil d'Approbation Hiérarchique** :
  - Paramètre d'entreprise `seuil_validation_ajustement` (défaut : 50 000 FCFA).
  - Tout ajustement dont la valeur estimée dépasse le seuil est automatiquement soumis au workflow d'approbation et n'impacte pas le stock immédiatement.
  - RPC transactionnelle `rpc_approuver_ajustement_stock` pour application atomique des mouvements lors de la validation par le gérant ou l'administrateur.

### 5. Grilles Tarifaires & Moteur de Promotions
- **Grilles Tarifaires par Catégorie de Clientèle** :
  - Paliers clients : `detail`, `demi_gros`, `grossiste`, `vip`.
  - Tables `grilles_tarifaires` et `grille_tarifaire_lignes` avec remises en pourcentage ou prix fixes nets.
- **Campagnes de Promotion & Coupons** :
  - Table `promotions` : codes promo, remises en % ou montant fixe, dates de validité, montant d'achat minimum, limitation d'usage.
- **Simulateur Instantané de Prix Client** :
  - Calculateur interactif en temps réel testant le barème applicable selon la catégorie client, le volume d'achat et le code promo saisi.

### 6. Workflows de Validation & Queue de Notifications
- **Écran Dédié « Validations en attente »** :
  - Centralisation des demandes : ajustements de stock, remises exceptionnelles, transferts inter-sites.
  - Approbation en un clic ou rejet motivé obligatoire avec motif consigné.
  - Badge dynamique dans la barre latérale indiquant les approbations requises en attente.
- **Queue de Notifications Multi-canaux (`notifications_queue`)** :
  - Prise en charge des canaux `in_app`, `email`, `sms`, `whatsapp` avec statuts `en_attente`, `envoye`, `echec`.

### 7. Webhooks Sortants Signés HMAC-SHA256
- **Événements Métier Standardisés** :
  - `vente.creee`, `vente.annulee`, `stock.alerte`, `stock.ajustement`, `facture.payee`, `approbation.requise`.
- **Garantie d'Authenticité & Observabilité** :
  - Signature cryptographique SHA256 envoyée dans l'en-tête `X-YOS360-Signature`.
  - Table `webhook_deliveries` traçant le payload, statut HTTP, temps de réponse et tentatives d'envoi.
  - Modal interactif de test de webhook avec calcul de payload et signature dans `Paramètres > API & Intégrations`.

---

## [Phase 3] — 20 Octobre 2026 : Finance SYSCOHADA, Équipe & Fidélité

### 1. Pré-Comptabilité SYSCOHADA Révisé (Norme OHADA)
- **Plan Comptable Général Intégré (Classes 1 à 7)** :
  - Comptes capitaux (1), immobilisations (2), stocks (3), tiers (4), trésorerie (5), charges (6), et produits (7).
  - Procédure stockée `rpc_seed_syscohada_plan` initialisant le plan comptable d'une entreprise en un clic.
- **Journaux Auxiliaires Structurés** :
  - Journal des Ventes (`VE`), Achats (`AC`), Banque (`BQ`), Caisse (`CA`), Mobile Money (`MM`), Opérations Diverses (`OD`).
- **Génération Automatique des Écritures en Double Entrée** :
  - Fonction PostgreSQL `rpc_generer_ecriture_vente` déversant automatiquement les factures de vente :
    - Débit 411100 (Client TTC)
    - Crédit 701000 (Ventes HT)
    - Crédit 443100 (TVA 18% si applicable)
- **États Comptables & Fichier FEC Conforme** :
  - **Balance Générale des Comptes** : calcul en temps réel des débits, crédits, soldes débiteurs/créditeurs avec contrôle d'équilibre.
  - **Grand Livre Interactif** : consultation détaillée par compte avec solde progressif ligne par ligne.
  - **Export FEC (Fichier des Écritures Comptables)** : fichier normalisé tabulaire prêt pour les logiciels comptables et l'administration fiscale.

### 2. Gestion de Trésorerie & Dépenses d'Exploitation
- **Comptes de Trésorerie Multi-Canaux** :
  - Banques locales, Caisses physiques showroom/boutiques, Comptes marchands Mobile Money (Orange Money, Moov Money, Wave).
  - Module de **Virements Internes** de compte à compte avec traçabilité et mise à jour instantanée des soldes.
- **Rapprochement Bancaire Assisté** :
  - Comparaison entre le solde comptable théorique et le solde du relevé bancaire.
  - Pointage des écritures rapprochées vs opérations en suspens avec calcul instantané de l'écart.
- **Dépenses d'Exploitation & Budgets** :
  - Catégorisation des charges avec imputation comptable SYSCOHADA automatique (Loyer, Carburant, Télécoms, Fournitures, Maintenance).
  - Suivi des plafonds budgétaires mensuels par catégorie et archivage des pièces justificatives.

### 3. Gestion de l'Équipe, Commissions & Objectifs Commerciaux
- **Fiche Collaborateur RH** :
  - Matricule unique, poste, affectation par site/boutique, salaire de base conventionnel, statut d'activité.
- **Moteur de Commissions Vendeurs Paramétrable** :
  - Taux de commission personnalisable par collaborateur.
  - Base de calcul modulable : CA encaissé, CA facturé ou Marge brute réalisée.
  - Fonction `rpc_calculer_commissions_vendeur` agrégeant automatiquement les ventes de la période.
- **Objectifs Mensuels & Primes d'Atteinte** :
  - Cibles de Chiffre d'Affaires et de Marge par commercial.
  - Baromètre visuel du taux d'atteinte avec déblocage automatique des primes sur objectifs.
  - Workflow de validation et de liquidation des commissions (Calculé → Validé → Payé).

### 4. Programme de Fidélité & Vue Client 360°
- **Système de Récompenses UEMOA** :
  - Barème : 1 point fidélité par tranche de 1 000 FCFA d'achat TTC.
  - Valeur de rachat : 1 point = 25 FCFA de réduction.
  - Paliers d'élévation automatique selon le volume d'achats cumulé :
    - Bronze (0 à 99 999 FCFA)
    - Argent (100 000 à 499 999 FCFA — Bonus +5% de points)
    - Or (500 000 à 1 999 999 FCFA — Bonus +10% de points)
    - Platine (2 000 000 FCFA et plus — Bonus +20% de points)
  - Table `fidelite_transactions` consignant les gains, utilisations et expirations de points.
- **Modal Vue Client 360° Interactif** :
  - Synthèse financière en temps réel : Total facturé, Total réglé, Solde dû, Panier moyen.
  - Historique complet des commandes et des paiements du client.
  - Statut de l'encours de crédit avec alerte en cas de dépassement de l'encours max autorisé.
  - Bouton de relance WhatsApp 1-clic générant un message officiel pré-rempli.

