/*
# Extension du schéma — Gestion 360 (fournisseurs, clients, commandes)

1. Nouvelles Tables

## fournisseurs
- `id` (uuid, PK)
- `nom` (texte, non null) — nom du fournisseur
- `contact` (texte) — personne de contact
- `email` (texte)
- `telephone` (texte)
- `adresse` (texte)
- `ville` (texte)
- `code_postal` (texte)
- `pays` (texte, défaut 'France')
- `note` (texte) — notes internes
- `created_at` (timestamptz)

## clients
- `id` (uuid, PK)
- `nom` (texte, non null)
- `email` (texte)
- `telephone` (texte)
- `adresse` (texte)
- `ville` (texte)
- `code_postal` (texte)
- `pays` (texte, défaut 'France')
- `note` (texte)
- `created_at` (timestamptz)

## commandes
- `id` (uuid, PK)
- `type` (texte: 'achat' ou 'vente') — achat=fournisseur, vente=client
- `fournisseur_id` (uuid, FK) — pour les achats
- `client_id` (uuid, FK) — pour les ventes
- `statut` (texte: 'en_attente', 'confirmee', 'expediee', 'recue', 'annulee')
- `reference` (texte, unique) — numéro de commande auto-généré
- `montant_total` (numeric, défaut 0)
- `date_commande` (timestamptz, défaut now())
- `date_livraison` (timestamptz) — date prévue
- `note` (texte)
- `created_at` (timestamptz)

## commande_items
- `id` (uuid, PK)
- `commande_id` (uuid, FK, CASCADE)
- `produit_id` (uuid, FK)
- `quantite` (entier, non null)
- `prix_unitaire` (numeric, non null) — prix au moment de la commande
- `sous_total` (numeric) — calculé

2. Sécurité
- RLS activée sur toutes les nouvelles tables.
- Application mono-utilisateur: politiques TO anon, authenticated avec USING(true).

3. Notes
- Index sur les colonnes de recherche fréquentes.
- Fonction pour calculer le montant total d'une commande automatiquement.
*/

-- Table fournisseurs
CREATE TABLE IF NOT EXISTS fournisseurs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  contact text,
  email text,
  telephone text,
  adresse text,
  ville text,
  code_postal text,
  pays text DEFAULT 'France',
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE fournisseurs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_fournisseurs" ON fournisseurs;
CREATE POLICY "anon_select_fournisseurs" ON fournisseurs FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_fournisseurs" ON fournisseurs;
CREATE POLICY "anon_insert_fournisseurs" ON fournisseurs FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_fournisseurs" ON fournisseurs;
CREATE POLICY "anon_update_fournisseurs" ON fournisseurs FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_fournisseurs" ON fournisseurs;
CREATE POLICY "anon_delete_fournisseurs" ON fournisseurs FOR DELETE TO anon, authenticated USING (true);

-- Table clients
CREATE TABLE IF NOT EXISTS clients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  email text,
  telephone text,
  adresse text,
  ville text,
  code_postal text,
  pays text DEFAULT 'France',
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_clients" ON clients;
CREATE POLICY "anon_select_clients" ON clients FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_clients" ON clients;
CREATE POLICY "anon_insert_clients" ON clients FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_clients" ON clients;
CREATE POLICY "anon_update_clients" ON clients FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_clients" ON clients;
CREATE POLICY "anon_delete_clients" ON clients FOR DELETE TO anon, authenticated USING (true);

-- Table commandes
CREATE TABLE IF NOT EXISTS commandes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL CHECK (type IN ('achat', 'vente')),
  fournisseur_id uuid REFERENCES fournisseurs(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  statut text NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'confirmee', 'expediee', 'recue', 'annulee')),
  reference text UNIQUE,
  montant_total numeric(14,2) NOT NULL DEFAULT 0,
  date_commande timestamptz DEFAULT now(),
  date_livraison timestamptz,
  note text,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE commandes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_commandes" ON commandes;
CREATE POLICY "anon_select_commandes" ON commandes FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_commandes" ON commandes;
CREATE POLICY "anon_insert_commandes" ON commandes FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_commandes" ON commandes;
CREATE POLICY "anon_update_commandes" ON commandes FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_commandes" ON commandes;
CREATE POLICY "anon_delete_commandes" ON commandes FOR DELETE TO anon, authenticated USING (true);

-- Table commande_items
CREATE TABLE IF NOT EXISTS commande_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commande_id uuid NOT NULL REFERENCES commandes(id) ON DELETE CASCADE,
  produit_id uuid REFERENCES produits(id) ON DELETE SET NULL,
  quantite integer NOT NULL CHECK (quantite > 0),
  prix_unitaire numeric(12,2) NOT NULL DEFAULT 0,
  sous_total numeric(12,2) NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now()
);
ALTER TABLE commande_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "anon_select_commande_items" ON commande_items;
CREATE POLICY "anon_select_commande_items" ON commande_items FOR SELECT TO anon, authenticated USING (true);
DROP POLICY IF EXISTS "anon_insert_commande_items" ON commande_items;
CREATE POLICY "anon_insert_commande_items" ON commande_items FOR INSERT TO anon, authenticated WITH CHECK (true);
DROP POLICY IF EXISTS "anon_update_commande_items" ON commande_items;
CREATE POLICY "anon_update_commande_items" ON commande_items FOR UPDATE TO anon, authenticated USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "anon_delete_commande_items" ON commande_items;
CREATE POLICY "anon_delete_commande_items" ON commande_items FOR DELETE TO anon, authenticated USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_fournisseurs_nom ON fournisseurs(nom);
CREATE INDEX IF NOT EXISTS idx_clients_nom ON clients(nom);
CREATE INDEX IF NOT EXISTS idx_commandes_type ON commandes(type);
CREATE INDEX IF NOT EXISTS idx_commandes_statut ON commandes(statut);
CREATE INDEX IF NOT EXISTS idx_commandes_fournisseur_id ON commandes(fournisseur_id);
CREATE INDEX IF NOT EXISTS idx_commandes_client_id ON commandes(client_id);
CREATE INDEX IF NOT EXISTS idx_commandes_date_commande ON commandes(date_commande DESC);
CREATE INDEX IF NOT EXISTS idx_commande_items_commande_id ON commande_items(commande_id);

-- Fonction pour recalculer le montant_total d'une commande
CREATE OR REPLACE FUNCTION calculate_commande_total(cmd_id uuid)
RETURNS numeric AS $$
DECLARE
  total numeric(14,2);
BEGIN
  SELECT COALESCE(SUM(sous_total), 0) INTO total FROM commande_items WHERE commande_id = cmd_id;
  UPDATE commandes SET montant_total = total WHERE id = cmd_id;
  RETURN total;
END;
$$ LANGUAGE plpgsql;

-- Trigger pour calculer le sous_total et le total après insert/update/delete sur commande_items
CREATE OR REPLACE FUNCTION update_commande_totals()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
    PERFORM calculate_commande_total(NEW.commande_id);
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM calculate_commande_total(OLD.commande_id);
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_commande_items_insert ON commande_items;
CREATE TRIGGER trigger_commande_items_insert
  AFTER INSERT ON commande_items
  FOR EACH ROW EXECUTE FUNCTION update_commande_totals();

DROP TRIGGER IF EXISTS trigger_commande_items_update ON commande_items;
CREATE TRIGGER trigger_commande_items_update
  AFTER UPDATE ON commande_items
  FOR EACH ROW EXECUTE FUNCTION update_commande_totals();

DROP TRIGGER IF EXISTS trigger_commande_items_delete ON commande_items;
CREATE TRIGGER trigger_commande_items_delete
  AFTER DELETE ON commande_items
  FOR EACH ROW EXECUTE FUNCTION update_commande_totals();
