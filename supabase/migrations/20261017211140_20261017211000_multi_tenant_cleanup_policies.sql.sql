/*
# Multi-entreprises — partie 4 : nettoyage des politiques publiques restantes

Les tables entrepots, transferts, inventaires, inventaire_lignes, lots,
stocks_entrepot et paiements avaient des politiques nommées "all_*" USING (true)
qui n'ont pas été remplacées par la migration précédente (mauvais noms).
Cette migration les retire : seules les politiques "tenant_*" par entreprise
restent actives. Politique publique résiduelle sur categories également retirée,
ainsi que les écritures ouvertes sur l'ancienne table legacy "entreprise".
*/

-- entrepots
DROP POLICY IF EXISTS "all_entrepots_select" ON entrepots;
DROP POLICY IF EXISTS "all_entrepots_insert" ON entrepots;
DROP POLICY IF EXISTS "all_entrepots_update" ON entrepots;
DROP POLICY IF EXISTS "all_entrepots_delete" ON entrepots;

-- transferts
DROP POLICY IF EXISTS "all_transferts_select" ON transferts;
DROP POLICY IF EXISTS "all_transferts_insert" ON transferts;
DROP POLICY IF EXISTS "all_transferts_update" ON transferts;
DROP POLICY IF EXISTS "all_transferts_delete" ON transferts;

-- inventaires
DROP POLICY IF EXISTS "all_inventaires_select" ON inventaires;
DROP POLICY IF EXISTS "all_inventaires_insert" ON inventaires;
DROP POLICY IF EXISTS "all_inventaires_update" ON inventaires;
DROP POLICY IF EXISTS "all_inventaires_delete" ON inventaires;

-- inventaire_lignes
DROP POLICY IF EXISTS "all_inv_lignes_select" ON inventaire_lignes;
DROP POLICY IF EXISTS "all_inv_lignes_insert" ON inventaire_lignes;
DROP POLICY IF EXISTS "all_inv_lignes_update" ON inventaire_lignes;
DROP POLICY IF EXISTS "all_inv_lignes_delete" ON inventaire_lignes;

-- lots
DROP POLICY IF EXISTS "all_lots_select" ON lots;
DROP POLICY IF EXISTS "all_lots_insert" ON lots;
DROP POLICY IF EXISTS "all_lots_update" ON lots;
DROP POLICY IF EXISTS "all_lots_delete" ON lots;

-- stocks_entrepot
DROP POLICY IF EXISTS "all_stocks_entrepot_select" ON stocks_entrepot;
DROP POLICY IF EXISTS "all_stocks_entrepot_insert" ON stocks_entrepot;
DROP POLICY IF EXISTS "all_stocks_entrepot_update" ON stocks_entrepot;
DROP POLICY IF EXISTS "all_stocks_entrepot_delete" ON stocks_entrepot;

-- paiements
DROP POLICY IF EXISTS "all_paiements_select" ON paiements;
DROP POLICY IF EXISTS "all_paiements_insert" ON paiements;
DROP POLICY IF EXISTS "all_paiements_update" ON paiements;
DROP POLICY IF EXISTS "all_paiements_delete" ON paiements;

-- categories: politique publique résiduelle
DROP POLICY IF EXISTS "anon_select_categories" ON categories;
DROP POLICY IF EXISTS "tenant_select_categories_anon" ON categories;

-- ancienne table legacy: fermer aussi la lecture publique
DROP POLICY IF EXISTS "all_entreprise_select" ON entreprise;
DROP POLICY IF EXISTS "all_entreprise_insert" ON entreprise;
DROP POLICY IF EXISTS "all_entreprise_update" ON entreprise;
DROP POLICY IF EXISTS "anon_select_entreprise" ON entreprise;
