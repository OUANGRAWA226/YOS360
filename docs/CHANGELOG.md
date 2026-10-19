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
