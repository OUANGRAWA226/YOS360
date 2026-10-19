/*
# Création du schéma de gestion de stock

1. Nouvelles Tables

## categories
- `id` (uuid, clé primaire)
- `nom` (texte, non null, unique) — nom de la catégorie
- `description` (texte) — description optionnelle
- `couleur` (texte) — code couleur pour l'affichage
- `created_at` (timestamptz)

## produits
- `id` (uuid, clé primaire)
- `nom` (texte, non null) — nom du produit
- `sku` (texte, unique) — référence unique du produit
- `description` (texte) — description optionnelle
- `categorie_id` (uuid, FK vers categories) — catégorie du produit
- `quantite` (entier, non null, défaut 0) — stock actuel
- `seuil_alerte` (entier, non null, défaut 10) — niveau de stock d'alerte
- `prix_unitaire` (numeric, non null, défaut 0) — prix d'achat unitaire
- `prix_vente` (numeric, non null, défaut 0) — prix de vente unitaire
- `unite` (texte, défaut 'pièce') — unité de mesure (pièce, kg, litre, etc.)
- `emplacement` (texte) — emplacement de stockage
- `created_at` (timestamptz)
- `updated_at` (timestamptz)

## mouvements
- `id` (uuid, clé primaire)
- `produit_id` (uuid, FK vers produits, ON DELETE CASCADE)
- `type` (texte, non null) — 'entree' ou 'sortie'
- `quantite` (entier, non null) — quantité déplacée
- `motif` (texte) — raison du mouvement (achat, vente, ajustement, perte, etc.)
- `fournisseur` (texte) — fournisseur (pour les entrées)
- `destinataire` (texte) — destinataire (pour les sorties)
- `reference` (texte) — numéro de bon de commande ou facture
- `created_at` (timestamptz)

2. Sécurité
- RLS activée sur toutes les tables.
- Application mono-utilisateur sans authentification : politiques TO anon, authenticated avec USING (true) car les données sont intentionnellement partagées.

3. Notes importantes
- Index créés sur les colonnes fréquemment interrogées (sku, categorie_id, produit_id, type).
- Un trigger met à jour automatiquement la quantité du produit lors d'un mouvement.
- `updated_at` est mis à jour automatiquement via un trigger.
*/

-- Table categories
CREATE TABLE IF NOT EXISTS categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL UNIQUE,
  description text,
  couleur text DEFAULT '#0ea5e9',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_categories" ON categories;
CREATE POLICY "anon_select_categories" ON categories FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_categories" ON categories;
CREATE POLICY "anon_insert_categories" ON categories FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_categories" ON categories;
CREATE POLICY "anon_update_categories" ON categories FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_categories" ON categories;
CREATE POLICY "anon_delete_categories" ON categories FOR DELETE
  TO anon, authenticated USING (true);

-- Table produits
CREATE TABLE IF NOT EXISTS produits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  sku text UNIQUE,
  description text,
  categorie_id uuid REFERENCES categories(id) ON DELETE SET NULL,
  quantite integer NOT NULL DEFAULT 0,
  seuil_alerte integer NOT NULL DEFAULT 10,
  prix_unitaire numeric(12,2) NOT NULL DEFAULT 0,
  prix_vente numeric(12,2) NOT NULL DEFAULT 0,
  unite text NOT NULL DEFAULT 'pièce',
  emplacement text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE produits ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_produits" ON produits;
CREATE POLICY "anon_select_produits" ON produits FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_produits" ON produits;
CREATE POLICY "anon_insert_produits" ON produits FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_produits" ON produits;
CREATE POLICY "anon_update_produits" ON produits FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_produits" ON produits;
CREATE POLICY "anon_delete_produits" ON produits FOR DELETE
  TO anon, authenticated USING (true);

-- Table mouvements
CREATE TABLE IF NOT EXISTS mouvements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  produit_id uuid NOT NULL REFERENCES produits(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('entree', 'sortie')),
  quantite integer NOT NULL CHECK (quantite > 0),
  motif text,
  fournisseur text,
  destinataire text,
  reference text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE mouvements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_mouvements" ON mouvements;
CREATE POLICY "anon_select_mouvements" ON mouvements FOR SELECT
  TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_insert_mouvements" ON mouvements;
CREATE POLICY "anon_insert_mouvements" ON mouvements FOR INSERT
  TO anon, authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "anon_update_mouvements" ON mouvements;
CREATE POLICY "anon_update_mouvements" ON mouvements FOR UPDATE
  TO anon, authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "anon_delete_mouvements" ON mouvements;
CREATE POLICY "anon_delete_mouvements" ON mouvements FOR DELETE
  TO anon, authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_produits_sku ON produits(sku);
CREATE INDEX IF NOT EXISTS idx_produits_categorie_id ON produits(categorie_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_produit_id ON mouvements(produit_id);
CREATE INDEX IF NOT EXISTS idx_mouvements_type ON mouvements(type);
CREATE INDEX IF NOT EXISTS idx_mouvements_created_at ON mouvements(created_at DESC);

-- Fonction pour mettre à jour updated_at automatiquement
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_produits_updated_at ON produits;
CREATE TRIGGER trigger_produits_updated_at
  BEFORE UPDATE ON produits
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Fonction pour ajuster le stock lors d'un mouvement
CREATE OR REPLACE FUNCTION adjust_stock_on_movement()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.type = 'entree' THEN
    UPDATE produits SET quantite = quantite + NEW.quantite WHERE id = NEW.produit_id;
  ELSIF NEW.type = 'sortie' THEN
    UPDATE produits SET quantite = quantite - NEW.quantite WHERE id = NEW.produit_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_adjust_stock ON mouvements;
CREATE TRIGGER trigger_adjust_stock
  AFTER INSERT ON mouvements
  FOR EACH ROW EXECUTE FUNCTION adjust_stock_on_movement();

-- Fonction inverse pour annuler l'ajustement si on supprime un mouvement
CREATE OR REPLACE FUNCTION reverse_stock_on_delete()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.type = 'entree' THEN
    UPDATE produits SET quantite = quantite - OLD.quantite WHERE id = OLD.produit_id;
  ELSIF OLD.type = 'sortie' THEN
    UPDATE produits SET quantite = quantite + OLD.quantite WHERE id = OLD.produit_id;
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_reverse_stock ON mouvements;
CREATE TRIGGER trigger_reverse_stock
  BEFORE DELETE ON mouvements
  FOR EACH ROW EXECUTE FUNCTION reverse_stock_on_delete();
