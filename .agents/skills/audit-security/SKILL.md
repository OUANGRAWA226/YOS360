---
name: audit-security
description: Protocole d'audit et de vérification de sécurité pour YOS360 (Supabase, PostgreSQL, Multi-Tenancy RLS, RBAC, Inviolabilité financière, Audit Trail et Protection contre l'élévation de privilèges).
---

# Protocole d'Audit de Sécurité — YOS360

Ce skill fournit les directives, les requêtes de contrôle et la méthodologie d'audit pour garantir la sécurité absolue de la plateforme YOS360, son étanchéité multi-entreprises, l'intégrité de ses écritures comptables et la protection des privilèges.

---

## 1. Périmètre & Piliers de Sécurité YOS360

L'audit de sécurité YOS360 s'articule autour de 6 piliers critiques :

1. **Étanchéité Multi-Tenancy (Row Level Security)** :
   * Chaque requête de données DOIT être restreinte à l'`entreprise_id` de l'utilisateur authentifié.
   * Aucune entreprise ne doit pouvoir lire, modifier ou deviner les données (stocks, clients, prix, chiffres d'affaires) d'une autre entreprise.

2. **Garde-fous Anti-Élévation de Privilèges (Anti-Privilege Escalation)** :
   * Un utilisateur classique ou gérant ne peut PAS s'attribuer le rôle `super_admin` ni modifier son propre rôle directement via l'API Supabase (`trg_prevent_profile_escalation`).

3. **Inviolabilité Comptable & Fiscale (Conformité SYSCOHADA / DGI)** :
   * Les factures validées et clôtures comptables scellées (`compta_clotures`) ne peuvent être ni modifiées ni supprimées (`trg_facture_inviolability` & SHA-256).

4. **Sécurisation de la Caisse & Ventes (Anti-Fraude POS)** :
   * Calcul et contrôle des prix côté serveur PostgreSQL (`trg_controler_prix_vente`).
   * Blocage absolu des ventes sous le seuil de rentabilité sans dérogation (`trg_bloquer_vente_sous_cout`).

5. **Secrets & Cloisonnement d'Infrastructure** :
   * Clé `service_role` strictement interdite côté client frontend (uniquement `anon_key` bridée par RLS).
   * Clés d'API et webhooks chiffrés ou isolés dans `profils_secrets`.

6. **Traçabilité & Journal d'Audit Immuable (`audit_logs`)** :
   * Triggers automatiques sur toutes les modifications de stocks, commandes, paiements et paramètres.

---

## 2. Procédure d'Audit Pas-à-Pas

### Étape 1 : Vérification de l'activation RLS sur toutes les tables
Exécuter la requête suivante pour détecter toute table publique créée sans protection RLS :

```sql
SELECT 
  tablename, 
  rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' 
  AND rowsecurity = false;
```
> **Critère de conformité** : Le résultat doit retourner **0 ligne**. Toute table sans RLS est une faille critique.

---

### Étape 2 : Vérification de l'étanchéité multi-entreprises
Pour chaque table métier (`produits`, `clients`, `commandes`, `paiements`, `lots`, `tresorerie_comptes`), vérifier la présence d'une politique de type :

```sql
CREATE POLICY "tenant_isolation_policy" ON public.<table>
  FOR ALL TO authenticated
  USING (
    entreprise_id = (SELECT entreprise_id FROM public.profiles WHERE id = auth.uid())
    OR (SELECT super_admin FROM public.profiles WHERE id = auth.uid()) = true
  );
```

---

### Étape 3 : Contrôle du trigger anti-élévation de privilèges
Tester la tentative de passage en Super Admin non autorisé :

```sql
-- Simulation d'une attaque par un utilisateur non Super Admin :
-- Cette requête DOIT échouer avec une exception levée par trg_prevent_profile_escalation
UPDATE public.profiles 
SET super_admin = true 
WHERE id = auth.uid();
```
> **Comportement attendu** : Rejet avec le message *"Tentative d'escalade de privilège non autorisée."*

---

### Étape 4 : Contrôle d'inviolabilité des écritures comptables
Vérifier l'impossibilité de modifier une pièce d'un exercice clôturé :

```sql
-- Tentative d'altération sur un exercice scellé :
UPDATE public.compta_ecritures 
SET montant_debit = 0 
WHERE piece_id IN (
  SELECT p.id FROM public.compta_pieces p 
  JOIN public.compta_exercices e ON p.exercice_id = e.id 
  WHERE e.statut = 'cloture'
);
```
> **Comportement attendu** : Blocage total par trigger PostgreSQL.

---

### Étape 5 : Audit des variables d'environnement frontend
Rechercher dans le code client toute présence de secret sensible :

```bash
# Vérifier l'absence de clé de service ou token admin dans src/
grep -rn "service_role" src/
grep -rn "SUPABASE_SERVICE" src/
```
> **Critère de conformité** : Aucune référence à `service_role` ne doit être présente dans le code source React / Vite.

---

## 3. Rapport d'Audit & Scoring de Sécurité

Lors d'un audit, générer une synthèse structurée :
* **Niveau global** : Vert (Sécurisé), Orange (Attention), Rouge (Critique).
* **Isolation Tenancy** : 100% des tables cloisonnées par `entreprise_id`.
* **RBAC & Privilèges** : Contrôles aux niveaux base de données et interface.
* **Intégrité financière** : Horodatage, calculs côté serveur, audit actif.
