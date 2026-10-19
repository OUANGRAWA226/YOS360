# AUDIT TECHNIQUE & ARCHITECTURAL — YOS360 ERP

**Projet** : YOS360 — Système de Gestion d'Entreprise Multi-Tenant & Multi-Sites  
**Cible** : PME de la zone UEMOA (Burkina Faso en priorité) — Devise principale : FCFA (XOF)  
**Date de l'audit** : 19 Octobre 2026  
**Auteur** : Ingénieur Full-Stack Senior ERP / SaaS Multi-Tenant  
**Statut** : ÉTAPE 0 (Préalable obligatoire avant refonte & extension)

---

## 1. Synthèse Exécutive

L'application **YOS360** dispose d'une base fonctionnelle solide initiée pour la gestion de stocks, le point de vente (POS) et la facturation simplifiée. Elle est construite sur une stack moderne (Vite, React 18, TypeScript, TailwindCSS, AdminLTE v4, Supabase PostgreSQL avec RLS, IndexedDB pour le mode hors-ligne).

Cependant, dans sa version actuelle, le système présente un décalage substantiel entre un outil de gestion d'atelier/commerce mono-flux et les exigences strictes d'un **véritable ERP SaaS Multi-Tenant & Multi-Sites de classe entreprise** :
1. **Cloisonnement multi-tenant incomplet** : la politique RLS `is_admin()` accorde des droits globaux à n'importe quel administrateur d'entreprise, créant un risque de fuite de données entre tenants.
2. **Cloisonnement multi-sites non généralisé** : la notion d'`entrepot_id` existe sur le stock, mais n'est pas portée sur les ventes, la caisse, les achats et les permissions utilisateurs.
3. **RBAC statique non granulaire** : 4 rôles codés en dur (`admin`, `gestionnaire`, `magasinier`, `vendeur`) sans tables de permissions dynamiques (`roles`, `permissions`, `role_permissions`, `user_sites`).
4. **Confusion des flux d'achats et de ventes** : une seule table `commandes` héberge à la fois devis, commandes, réceptions et factures, sans machine à états formelle et sans séparation des cycles Achats et Ventes.
5. **Absence de sessions de caisse réglementaires** : encaissement direct sans ouverture de caisse (fond de caisse), sans clôture avec comptage physique, ni ticket Z.
6. **Suppression physique possible** : absence de soft delete généralisé (`deleted_at`) sur les documents métier.

---

## 2. Stack Technique & Structure du Codebase

### 2.1 Stack actuelle
- **Frontend** : React 18.3.1, TypeScript 5.5.3, Vite 5.4.2
- **Styling** : TailwindCSS 3.4.1, Vanilla CSS, Composants inspirés AdminLTE v4.10, Lucide Icons 0.446, Bootstrap Icons 1.11.3
- **Backend / BDD** : Supabase (PostgreSQL 15+), Row Level Security (RLS), Fonctions PL/pgSQL Security Definer
- **Stockage hors-ligne** : IndexedDB (`yos360-offline`), file d'attente de mutations `enqueue()`, synchronisation `syncNow()`
- **Export & Impression** : Génération HTML imprimable (PDF via dialogue d'impression navigateur), CSV/JSON/Excel légers

### 2.2 Arborescence du dépôt
```
YOS360/
├── docs/                      # Documentation d'architecture & d'audit
├── public/                    # Fichiers statiques et manifestes
├── src/
│   ├── components/            # Composants partagés (Modal, Confirm, Toast, Notifications, Barcode39...)
│   │   ├── adminlte/          # Composants fidèles AdminLTE v4 (Card, SmallBox, InfoBox, Callout)
│   │   ├── ModulesParEntreprise.tsx # Gouvernance SaaS des modules et packs
│   │   └── Integrations.tsx   # Clés API et Webhooks
│   ├── lib/                   # Couche logique, data layer, auth, offline, permissions
│   │   ├── auth.tsx           # Contexte d'authentification Supabase & profil
│   │   ├── dataLayer.ts       # Couche d'abstraction lecture/écriture online/offline
│   │   ├── documents.ts       # Moteur d'impression des devis/factures
│   │   ├── format.ts          # Formatage devises (XOF), dates, références
│   │   ├── i18n.ts            # Dictionnaire bilingue fr/en
│   │   ├── offline.ts         # Moteur IndexedDB & file d'attente
│   │   ├── permissions.ts     # Matrice de droits codée en dur
│   │   ├── prefs.tsx          # Thème (clair/sombre) et langue active
│   │   └── supabase.ts        # Client Supabase & types TypeScript de base
│   ├── pages/                 # 18 pages applicatives
│   │   ├── Dashboard.tsx, Produits.tsx, Commandes.tsx, Caisse.tsx,
│   │   ├── Mouvements.tsx, Entrepots.tsx, Transferts.tsx, Inventaires.tsx,
│   │   ├── Scan.tsx, Reappro.tsx, Fournisseurs.tsx, Clients.tsx,
│   │   ├── Paiements.tsx, Rapports.tsx, Audit.tsx, Parametres.tsx, Login.tsx...
│   ├── App.tsx                # Shell applicatif, routage interne et fil d'Ariane
│   ├── index.css              # Design tokens et utilitaires AdminLTE v4
│   └── main.tsx               # Point d'entrée React
├── supabase/
│   ├── migrations/            # 17 fichiers de migration SQL incrémentaux
│   └── INSTALLATION_COMPLETE_YOS360.sql # Script d'installation globale
├── package.json
├── tailwind.config.js
└── vite.config.ts
```

---

## 3. Audit du Schéma de Base de Données

### 3.1 Tables existantes et statut

| Table existante | Rôle & Clés | Multi-Tenant (`entreprise_id`) | Multi-Sites (`entrepot_id`) | Soft Delete (`deleted_at`) | Audit Log | Écart vs Prompt |
| :--- | :--- | :---: | :---: | :---: | :---: | :--- |
| `entreprises` | Tenants (SaaS) | N/A (Id = Tenant) | Non | `actif` (bool) | Non | Manque quotas fins, contacts légaux IFU/RCCM |
| `profiles` | Utilisateurs système | `entreprise_id` (nullable) | Non | `actif` (bool) | Non | Rôles enum figés, pas de lien `user_sites`, pas de 2FA |
| `categories` | Familles produits | Oui (`NOT NULL`) | Non | Non | Non | Pas de soft delete |
| `produits` | Catalogue articles | Oui (`NOT NULL`) | Non | `actif` (bool) | Oui (Trigger) | Pas de variantes, pas de kits/nomenclatures, pas de gestion d'unités multiples |
| `entrepots` | Sites / Dépôts | Oui (`NOT NULL`) | N/A (Id = Site) | `actif` (bool) | Non | Pas de distinction boutique/dépôt/transit, pas de rattachement caisse |
| `stocks_entrepot` | Stock par site | Oui (`NOT NULL`) | Oui (`entrepot_id`) | Non | Non | Pas de vue matérialisée recalculable depuis les mouvements |
| `lots` | Traçabilité & DLUO | Oui (`NOT NULL`) | Oui (`entrepot_id` nullable) | Non | Non | Pas de numéro de série séparé, pas de sortie FEFO automatique |
| `mouvements` | Flux de stock | Oui (`NOT NULL`) | Oui (`entrepot_id` nullable) | Non | Oui (Trigger) | Types limités à `entree`/`sortie` (pas d'ajustement, transfert, casse, perte) |
| `fournisseurs` | Tiers Fournisseurs | Oui (`NOT NULL`) | Non | `actif` (bool) | Non | Pas d'évaluation, pas d'IFU/RCCM |
| `clients` | Tiers Clients | Oui (`NOT NULL`) | Non | `actif` (bool) | Non | Pas de balance âgée, pas de blocage plafond crédit bloquant |
| `commandes` | Achats & Ventes mélangés | Oui (`NOT NULL`) | **Non (Absence critique)** | Non | Oui (Trigger) | Fusionne Achats et Ventes, pas de chaîne Devis→BC→BL→FAC→Avoir |
| `commande_items` | Lignes de commandes | Oui (`NOT NULL`) | Non | Non | Non | Pas de suivi des reliquats livrés/facturés par ligne |
| `paiements` | Règlements financiers | Oui (`NOT NULL`) | Non | Non | Non | Lié à `commandes` (pas à des factures spécifiques), pas de gestion multi-factures |
| `transferts` | Transferts inter-dépôts | Oui (`NOT NULL`) | Oui (`source` & `dest`) | Non | Non | Manque workflow de validation formel |
| `inventaires` | Comptages physiques | Oui (`NOT NULL`) | Oui (`entrepot_id`) | Non | Non | Doit être renommé fonctionnellement en « Stock > Comptages » |
| `inventaire_lignes` | Lignes de comptage | Oui (`NOT NULL`) | Non | Non | Non | Pas d'ajustement automatique post-validation |
| `journal_audit` | Logs d'audit | **Non (`entreprise_id` manquant)** | Non | Non | N/A | Pas d'IP, pas de tenant, triggers uniquement sur 3 tables |
| `api_keys` | Clés API développeurs | Oui (`NOT NULL`) | Non | `actif` (bool) | Non | Scopes basiques |
| `webhook_endpoints` | Abonnements webhooks | Oui (`NOT NULL`) | Non | `actif` (bool) | Non | Liste d'événements restreinte |
| `document_counters` | Compteurs atomiques | Oui (`NOT NULL`) | Non | Non | Non | Parfaitement atomique, mais limité à 4 types |

---

## 4. Failles de Sécurité & Dettes Techniques Critiques

### 4.1 Faille de cloisonnement multi-tenant dans le RLS actuel
Dans [INSTALLATION_COMPLETE_YOS360.sql](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/supabase/INSTALLATION_COMPLETE_YOS360.sql#L60-L66) :
```sql
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND (role = 'admin' OR super_admin = true)
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```
Et la politique RLS macro :
```sql
CREATE POLICY "tenant_all_produits" ON public.produits
FOR ALL TO authenticated
USING (entreprise_id = public.current_entreprise_id() OR public.is_admin());
```
> [!CAUTION]
> **Risque critique** : Tout utilisateur ayant le rôle `admin` dans son entreprise B obtient `public.is_admin() = true`. Grâce à la clause `OR public.is_admin()`, cet administrateur peut lire et modifier les données de l'entreprise A !
> **Correction requise** : Seul le `super_admin = true` de la plateforme peut outrepasser le tenant, et même dans ce cas, le RLS doit exiger un contexte de tenant actif ou une session impersonated. L'administrateur d'un tenant doit être confiné strictement à `entreprise_id = public.current_entreprise_id()`.

### 4.2 Fusion des Achats et des Ventes dans une table unique `commandes`
Actuellement, [Commandes.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/pages/Commandes.tsx) filtre `type = 'achat'` ou `type = 'vente'`.  
Conséquences problématiques :
- Les devis, factures, bons de livraison et avoirs sont stockés dans la même table via une colonne nullable `type_document`.
- Impossible de suivre la conversion stricte : Devis → Bon de Commande → Bon de Livraison → Facture → Avoir avec suivi des quantités résiduelles.
- Impossible de modéliser le cycle Achats complet : Demande d'achat → Bon de commande fournisseur → Réception avec CMUP → Facture fournisseur → Paiement.

### 4.3 Absence de gestion des sessions de caisse (Caisse POS)
Actuellement, la caisse enregistre les ventes à la volée via la fonction RPC `encaisser_vente_pos` :
- Pas de table `caisse_sessions` ni de concept d'ouverture/fermeture.
- Pas de fond de caisse initial ni de comptage physique de clôture.
- Pas d'écart de caisse (théorique vs réel), pas d'impression de Ticket Z réglementaire.
- Pas de paiements fractionnés (ex: 50% Espèces + 50% Orange Money sur le même ticket).

### 4.4 Stock et calcul CMUP
- Le trigger `adjust_stock_on_movement` fait un `UPDATE public.produits SET quantite = quantite + NEW.quantite`.
- L'exigence ERP stipule : **toute variation passe par `stock_movements`, jamais d'update direct non tracé**. Le stock courant doit être une vue ou une projection transactionnelle garantie.

---

## 5. Ce qui existe et qui est Réutilisable

1. **Design System AdminLTE v4** :
   - Composants [Card.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/components/adminlte/Card.tsx), [SmallBox.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/components/adminlte/SmallBox.tsx), [InfoBox.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/components/adminlte/InfoBox.tsx), [Callout.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/components/adminlte/Callout.tsx).
   - Styles de formulaires `.form-control-lte`, tableaux `.table-adminlte`, boutons `.btn-lte`.
2. **Couche Hors-ligne (IndexedDB & Queue)** :
   - [offline.ts](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/lib/offline.ts) et [dataLayer.ts](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/lib/dataLayer.ts) : le mécanisme de mise en cache locale et de file d'attente de synchronisation `enqueue()` est fonctionnel et réutilisable pour la caisse et le stock.
3. **Moteur d'impression & documents légaux** :
   - [documents.ts](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/lib/documents.ts) : modèle HTML/CSS prêt pour formats A4 et tickets, avec mentions de TVA, devise FCFA (XOF), coordonnées entreprise.
4. **Générateur de code-barres Code 39** :
   - [Barcode39.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/components/Barcode39.tsx) : composant autonome SVG sans dépendance externe.
5. **Compteurs atomiques séquentiels** :
   - `document_counters` et fonction `next_numero_document_atomic` : base sans trou de numérotation, prête à être étendue.
6. **Gestion des intégrations SaaS** :
   - [Integrations.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/components/Integrations.tsx) et [ModulesParEntreprise.tsx](file:///c:/Users/OUANGRAWA/Desktop/P%20Digital/YOS360/src/components/ModulesParEntreprise.tsx).

---

## 6. Écarts Détaillés par Rapport au Prompt

| Domaine | Exigence du Prompt | État Actuel | Écart / Action Requise |
| :--- | :--- | :--- | :--- |
| **Séparation des Espaces** | Espace Super Admin Plateforme séparé + Espace Entreprise | Un seul shell partagé avec un simple toggle | Créer 2 espaces distincts avec navigation dédiée et fonction « Se connecter en tant que » |
| **Menu Entreprise** | 8 groupes ordonnés : Vue d'ensemble, Ventes, Achats, Stock, Multi-sites, Tiers, Finance, Équipe, Administration | Menus plats ou désorganisés | Restructurer la sidebar avec le nouveau menu cible |
| **Comptages de stock** | « Stock > Comptages » | « Multi-sites > Inventaires » | Renommer et déplacer dans le module Stock |
| **Badges de menu** | Compteurs dynamiques uniquement (alertes, en attente) | Badges statiques texte (SCAN, AUTO, VENTE, POS, LOG) | Remplacer par des compteurs dynamiques réels |
| **Centre Import/Export** | Hub générique (produits, clients, fournisseurs, stock, prix) avec modèle, prévisualisation, validation ligne par ligne | 2 cartes isolées dans Paramètres | Créer un écran dédié « Centre Import/Export » |
| **Rôles & Permissions** | Tables BDD `roles`, `permissions`, `role_permissions`, `user_roles`, `user_sites`, 6 rôles par défaut, 2FA, sessions | Rôles hardcodés dans `permissions.ts`, aucune table en BDD | Créer le schéma RBAC granulaire complet en BDD |
| **Cycle Achats** | DA → BC Fournisseur → Réception partielle/totale par site → Facture fournisseur → Retour | Inexistant (juste un filtre `achat` dans Commandes) | Créer le module Achats complet |
| **Cycle Ventes** | Devis → Commande → BL → Facture → Avoir en 1 clic | États partiels sans traçabilité des reliquats | Créer la chaîne Ventes complète |
| **Caisse POS** | Sessions de caisse, fond de caisse, comptage, Ticket Z, paiements multiples (Espèces + Mobile Money), impression 58/80mm | Vente directe sans session ni fond de caisse | Créer la gestion de session de caisse + paiements multi-modes |
| **Mobile Money** | Orange Money, Moov Money, Wave, saisie manuelle avec référence transaction + adapter pattern API | Sélecteur simple dans un champ texte | Créer l'architecture adapter et le suivi des flux Mobile Money |
| **Créances Clients** | Balance âgée (0-30, 31-60, 61-90, +90 jours), plafond bloquant | Visualisation brute des totaux | Créer la balance âgée et le garde-fou de crédit |
| **Suppression** | Soft delete `deleted_at` + corbeille | `DELETE` direct ou flag `actif` isolé | Ajouter `deleted_at` et gestion corbeille |

---

## 7. Directives Architecturales d'Implémentation

1. **Règle d'or de compatibilité** :
   - Ne pas supprimer brutalement les tables existantes (`commandes`, `paiements`, `mouvements`).
   - Appliquer des migrations d'enrichissement rétrocompatibles avec vues SQL ou colonnes de compatibilité (`tenant_id` aliasé ou synchronisé avec `entreprise_id`, `site_id` avec `entrepot_id`).
2. **Isolation RLS infaillible** :
   - Supprimer le bypass `OR public.is_admin()` non borné au tenant.
   - Restreindre l'accès super-admin à travers une table de contexte d'impersonation tracée dans `audit_logs`.
3. **Typage strict & Validation** :
   - Introduire la validation de schéma Zod sur les payloads sensibles (création documents, sessions de caisse, transactions financières).
4. **Conventions de nommage** :
   - SQL : snake_case (`tenant_id`, `site_id`, `created_at`, `montant_ttc`).
   - TypeScript : camelCase pour les fonctions/variables, PascalCase pour les types/composants.
   - Devises : XOF partout, montants entiers (0 décimale) pour la zone UEMOA.
