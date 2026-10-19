// REST API sécurisée par clé d'accès : lecture des produits, stocks, commandes.
// Auth: entête "Authorization: Bearer sm360_<secret>" ou "X-Api-Key: sm360_<secret>".
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Api-Key",
};

if (!("SUPABASE_URL" in Deno.env.toObject())) {
  console.error("SUPABASE_URL missing");
}

function supabaseService() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

// Hash SHA-256 hex d'une clé
async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method !== "GET") {
      return json({ error: "Method not allowed. Read-only API." }, 405);
    }

    // Extraction de la clé
    const authHeader = req.headers.get("Authorization") || "";
    const apiKeyHeader = req.headers.get("X-Api-Key") || "";
    const rawKey = authHeader.replace(/^Bearer\s+/i, "") || apiKeyHeader;
    if (!rawKey) {
      return json({ error: "Missing API key. Provide Authorization: Bearer <key>." }, 401);
    }

    const db = supabaseService();
    const keyHash = await sha256Hex(rawKey);

    // Vérification de la clé et de son entreprise de rattachement
    const { data: keyRow, error: keyErr } = await db
      .from("api_keys")
      .select("id, scopes, actif, entreprise_id")
      .eq("key_hash", keyHash)
      .maybeSingle();

    if (keyErr) return json({ error: "Auth lookup failed" }, 500);
    if (!keyRow || !keyRow.actif || !keyRow.entreprise_id) {
      return json({ error: "Invalid, inactive, or unassigned API key" }, 401);
    }

    const entrepriseId = keyRow.entreprise_id;

    // Marque d'utilisation (best effort)
    await db.from("api_keys").update({ dernier_utilise: new Date().toISOString() }).eq("id", keyRow.id);

    // Routage : /produits | /stocks | /commandes
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/rest-api$/, "").replace(/^\//, "");
    const limit = Math.min(parseInt(url.searchParams.get("limit") || "100", 10) || 100, 500);
    const offset = Math.max(parseInt(url.searchParams.get("offset") || "0", 10) || 0, 0);

    let data: unknown;
    let count: number | null = null;

    if (path === "produits") {
      let q = db
        .from("produits")
        .select("id, nom, sku, description, quantite, seuil_alerte, prix_unitaire, prix_vente, unite, cmup, categorie_id, actif", { count: "exact" })
        .eq("entreprise_id", entrepriseId)
        .range(offset, offset + limit - 1);
      const cat = url.searchParams.get("categorie_id");
      if (cat) q = q.eq("categorie_id", cat);
      const sku = url.searchParams.get("sku");
      if (sku) q = q.eq("sku", sku);
      const res = await q;
      if (res.error) return json({ error: res.error.message }, 500);
      data = res.data;
      count = res.count;
    } else if (path === "stocks") {
      const res = await db
        .from("stocks_entrepot")
        .select("*, produits(nom, sku), entrepots(nom)", { count: "exact" })
        .eq("entreprise_id", entrepriseId)
        .range(offset, offset + limit - 1);
      if (res.error) return json({ error: res.error.message }, 500);
      data = res.data;
      count = res.count;
    } else if (path === "commandes") {
      let q = db
        .from("commandes")
        .select("*, commande_items(*, produits(nom, sku))", { count: "exact" })
        .eq("entreprise_id", entrepriseId)
        .range(offset, offset + limit - 1);
      const type = url.searchParams.get("type");
      if (type) q = q.eq("type", type);
      const statut = url.searchParams.get("statut");
      if (statut) q = q.eq("statut", statut);
      const res = await q;
      if (res.error) return json({ error: res.error.message }, 500);
      data = res.data;
      count = res.count;
    } else if (path === "" || path === "/") {
      return json({
        name: "YOS360 API",
        version: "1.0",
        resources: ["/produits", "/stocks", "/commandes"],
        params: { limit: "max 500", offset: ">=0", categorie_id: "produits", sku: "produits", type: "commandes", statut: "commandes" },
      });
    } else {
      return json({ error: `Unknown resource '${path}'. Use /produits, /stocks or /commandes.` }, 404);
    }

    return json({ data, meta: { count, limit, offset } });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
