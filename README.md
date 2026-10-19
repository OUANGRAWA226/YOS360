# 🚀 YOS360 — ERP SaaS & Caisse POS Multi-Tenant

**YOS360** est une solution tout-en-un de gestion commerciale, de suivi des stocks multi-sites et de point de vente tactile (POS), spécialement adaptée aux réalités économiques et fiscales de l'Afrique de l'Ouest (FCFA / XOF, TVA 18%, Mobile Money Wave / Orange Money / Moov Money, tickets thermiques 58mm/80mm, fonctionnement hors-ligne PWA).

Le projet intègre une **architecture AdminLTE v4** moderne (100% React 18 & Tailwind CSS) ainsi qu'un **Cockpit Super Administrateur 100% No-Code** permettant de piloter l'ensemble de la plateforme sans toucher au code ni à la base de données.

---

## 🌟 Fonctionnalités Principales

### 1. 👑 Cockpit Super Administrateur (Vision Globale SaaS No-Code)
- **Supervision 360° du parc client** : Nombre d'entreprises hébergées (actives vs suspendues), volume total d'utilisateurs, catalogue consolidé et flux de transactions.
- **Prise de contrôle en 1 clic (*Impersonation*)** : Bascule immédiate dans n'importe quel compte client sans mot de passe.
- **Onboarding d'entreprises sans code** : Création de nouveaux tenants avec initialisation automatique du dépôt principal et de la catégorie par défaut.
- **Provisionnement d'utilisateurs** : Création de comptes collaborateurs, attribution des rôles métier (`admin`, `gestionnaire`, `magasinier`, `vendeur`) et rattachement d'entreprise.
- **Gouvernance modulaire & packs** : Activation/désactivation à la volée des 18 modules par client, packs d'abonnement (*Basique*, *Standard*, *Premium*) et bouton de coupure d'accès immédiate en cas d'impayé.

### 2. 🛒 Caisse Tactile & Point de Vente (POS)
- Encaissement rapide au comptoir avec calcul automatique de la monnaie à rendre.
- Raccourcis de paiement : Espèces, Wave, Orange Money, Moov Money, Carte, Virement, Chèque.
- Impression instantanée de tickets de caisse thermiques (formats 58mm et 80mm).
- Fonction de mise en attente et reprise de paniers clients.
- Procédure stockée atomique PostgreSQL (`encaisser_vente_pos`) avec verrouillage de stock par ligne (`FOR UPDATE`) pour éviter tout sur-stockage.

### 3. 📦 Gestion des Stocks & Traçabilité Multi-Sites
- **Valorisation CMUP automatique** : Recalcul automatique du Coût Moyen Unitaire Pondéré à chaque entrée en stock valorisée.
- **Multi-dépôts & Boutiques** : Suivi des stocks par emplacement physique et transferts inter-sites avec suivi des réceptions.
- **Gestion des Lots & DLUO** : Traçabilité des dates de péremption avec alertes préventives (règle FEFO).
- **Inventaires physiques** : Saisie des écarts constatés avec régularisation automatique du stock en base de données.
- **Scan & Étiquettes** : Moteur de génération et lecture de codes-barres Code 39.

### 4. 📄 Facturation & Gestion Commerciale
- Devis, Bons de commande, Bons de livraison, Factures définitives et Avoirs.
- Numérotation séquentielle automatique et inviolable par type de document (`FAC-2026-0001`, `DEV-2026-0001`...).
- Gestion des créances clients, des règlements partiels et des dettes fournisseurs.

### 5. 🛡️ Sécurité & Journal d'Audit
- **Cloisonnement multi-tenant étanche** : Row-Level Security (RLS) PostgreSQL garantissant l'isolation absolue des données entre chaque entreprise cliente.
- **Journal d'audit inaltérable** : Historique exhaustif de chaque création, modification, suppression ou encaissement avec utilisateur, date et adresse IP.

### 6. 🌐 Mode Hors-Ligne (PWA & Offline-First)
- Service Worker et cache local pour un chargement instantané.
- File d'attente d'opérations hors-ligne dans IndexedDB avec resynchronisation et réconciliation automatique dès retour de la connectivité.

---

## 🛠️ Stack Technologique

- **Frontend** : React 18, TypeScript 5, Vite 5
- **Style & Design** : Tailwind CSS 3, Architecture & Design System **AdminLTE v4** (Mini-Sidebar pliable, Live Search, Breadcrumbs, Dark/Light Mode)
- **Icônes** : Lucide React
- **Backend & Base de données** : Supabase (PostgreSQL 15+, Row-Level Security, Triggers PL/pgSQL, Edge Functions Deno)
- **Exports & Données** : Export CSV, Excel (XLSX), PDF et sauvegarde complète JSON en 1 clic

---

## 🚀 Démarrage Rapide

### 1. Prérequis
- Node.js 18+ et npm
- Un projet Supabase configuré

### 2. Installation
```bash
# Cloner le dépôt
git clone https://github.com/OUANGRAWA226/YOS360.git
cd YOS360

# Installer les dépendances
npm install
```

### 3. Configuration des variables d'environnement
Copiez le fichier `.env.example` en `.env` et renseignez les identifiants de votre projet Supabase :
```env
VITE_SUPABASE_URL=https://votre-projet.supabase.co
VITE_SUPABASE_ANON_KEY=votre_cle_anon_ou_publishable
```

### 4. Déploiement de la base de données
Ouvrez l'éditeur SQL de votre tableau de bord Supabase et exécutez le script complet :
```text
supabase/INSTALLATION_COMPLETE_YOS360.sql
```
Ce script initialise l'ensemble des 21 tables, les politiques de sécurité multi-tenant RLS, les fonctions atomiques et les données de départ.

### 5. Lancement de l'application
```bash
npm run dev
```
L'application est accessible sur `http://localhost:5173/`.

---

## 👥 Rôles & Permissions (RBAC)

| Rôle | Caisse POS | Stock & Articles | Achats & Ventes | Rapports | Paramètres & Utilisateurs |
| :--- | :---: | :---: | :---: | :---: | :---: |
| **Super Admin** | ✅ | ✅ | ✅ | ✅ (Multi-entreprises) | ✅ (Tous les tenants) |
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ (Son entreprise) |
| **Gestionnaire** | ✅ | ✅ | ✅ | ✅ | ❌ |
| **Magasinier** | ❌ | ✅ | ❌ | ❌ | ❌ |
| **Vendeur / Caissier** | ✅ | Lecture seule | Ventes comptoir | ❌ | ❌ |

---

## 📄 Licence
Ce projet est développé par **P Digital / OUANGRAWA**. Tous droits réservés © 2026.
