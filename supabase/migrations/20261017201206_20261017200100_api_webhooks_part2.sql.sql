/*
# API/Webhooks partie 2 : politique UPDATE api_keys + table webhook_endpoints

## 1. Modifications
- Ajout de la politique UPDATE manquante sur api_keys (gouvernee par manage_token).
- Creation de la table webhook_endpoints avec RLS et 4 politiques.

## 2. Securite
- webhook_endpoints : SELECT/UPDATE/DELETE via entete x-manage-token, INSERT ouvert.
*/

DROP POLICY IF EXISTS "api_keys_update_with_token" ON api_keys;
CREATE POLICY "api_keys_update_with_token" ON api_keys
FOR UPDATE TO anon, authenticated
USING (manage_token = current_setting('request.headers', true)::json->>'x-manage-token')
WITH CHECK (manage_token = current_setting('request.headers', true)::json->>'x-manage-token');

CREATE TABLE IF NOT EXISTS webhook_endpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nom text NOT NULL,
  url text NOT NULL,
  evenements text[] NOT NULL DEFAULT '{commande.creee,commande.recue,stock.bas,stock.peremption,produit.cree,produit.modifie,produit.supprime,mouvement.cree}',
  secret text NOT NULL DEFAULT encode(gen_random_uuid()::text::bytea, 'hex'),
  actif boolean NOT NULL DEFAULT true,
  manage_token text NOT NULL DEFAULT encode(gen_random_uuid()::text::bytea, 'hex'),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "webhook_endpoints_select_with_token" ON webhook_endpoints;
CREATE POLICY "webhook_endpoints_select_with_token" ON webhook_endpoints
FOR SELECT TO anon, authenticated
USING (manage_token = current_setting('request.headers', true)::json->>'x-manage-token');

DROP POLICY IF EXISTS "webhook_endpoints_insert_open" ON webhook_endpoints;
CREATE POLICY "webhook_endpoints_insert_open" ON webhook_endpoints
FOR INSERT TO anon, authenticated
WITH CHECK (true);

DROP POLICY IF EXISTS "webhook_endpoints_update_with_token" ON webhook_endpoints;
CREATE POLICY "webhook_endpoints_update_with_token" ON webhook_endpoints
FOR UPDATE TO anon, authenticated
USING (manage_token = current_setting('request.headers', true)::json->>'x-manage-token')
WITH CHECK (manage_token = current_setting('request.headers', true)::json->>'x-manage-token');

DROP POLICY IF EXISTS "webhook_endpoints_delete_with_token" ON webhook_endpoints;
CREATE POLICY "webhook_endpoints_delete_with_token" ON webhook_endpoints
FOR DELETE TO anon, authenticated
USING (manage_token = current_setting('request.headers', true)::json->>'x-manage-token');
