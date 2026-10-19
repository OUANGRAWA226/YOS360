// Dispatch des webhooks sortants, signés HMAC-SHA256.
// Auth: entête "x-dispatch-token" égal au secret de l'endpoint concerné OU
// appel interne via la clé de service (Authorization: Bearer <service_role_key>).
// Corps: { evenement: string, payload: object }
// Pour chaque endpoint actif abonné à l'événement, enregistre une livraison puis envoie
// POST signé, avec journalisation du résultat dans webhook_deliveries.
import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Dispatch-Token",
};

function supabaseService() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false } }
  );
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
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
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization") || "";
    const isServiceCall = authHeader === `Bearer ${serviceKey}`;
    const dispatchToken = req.headers.get("X-Dispatch-Token") || "";

    const body = await req.json().catch(() => null);
    if (!body || typeof body.evenement !== "string" || typeof body.payload !== "object") {
      return json({ error: "Body must be { evenement: string, payload: object }" }, 400);
    }
    const { evenement, payload } = body as { evenement: string; payload: Record<string, unknown> };

    const db = supabaseService();
    const entrepriseId = (body as { entreprise_id?: string }).entreprise_id || (payload.entreprise_id as string | undefined);

    // Cibles : endpoints actifs abonnés à cet événement pour l'entreprise concernée
    let q = db
      .from("webhook_endpoints")
      .select("id, nom, url, secret, evenements, entreprise_id")
      .eq("actif", true)
      .contains("evenements", [evenement]);

    if (entrepriseId) {
      q = q.eq("entreprise_id", entrepriseId);
    }

    const { data: endpoints, error: epErr } = await q;

    if (epErr) return json({ error: epErr.message }, 500);
    if (!endpoints || endpoints.length === 0) {
      return json({ message: "No active endpoints subscribed", delivered: 0 });
    }

    const results: { endpoint: string; statut: string; code_http?: number }[] = [];
    const payloadStr = JSON.stringify({ evenement, payload, timestamp: new Date().toISOString() });

    await Promise.all(
      endpoints.map(async (ep) => {
        // Endpoint ciblé par token, ou appel service interne autorisé
        if (!isServiceCall && dispatchToken !== ep.secret) {
          results.push({ endpoint: ep.nom, statut: "skipped_unauthorized" });
          return;
        }

        // Enregistrement de la livraison
        const { data: delivery, error: dErr } = await db
          .from("webhook_deliveries")
          .insert({
            endpoint_id: ep.id,
            evenement,
            payload: { evenement, payload },
            statut: "pending",
            tentatives: 1,
          })
          .select("id")
          .maybeSingle();
        if (dErr || !delivery) {
          results.push({ endpoint: ep.nom, statut: "log_failed" });
          return;
        }

        // Signature HMAC-SHA256
        const signature = await hmacSha256Hex(ep.secret, payloadStr);

        try {
          const resp = await fetch(ep.url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-SM360-Event": evenement,
              "X-SM360-Signature": `sha256=${signature}`,
            },
            body: payloadStr,
          });
          const respText = await resp.text().catch(() => "");
          await db
            .from("webhook_deliveries")
            .update({
              statut: resp.ok ? "delivered" : "failed",
              code_http: resp.status,
              reponse: respText.slice(0, 500),
            })
            .eq("id", delivery.id);
          results.push({ endpoint: ep.nom, statut: resp.ok ? "delivered" : "failed", code_http: resp.status });
        } catch (e) {
          await db
            .from("webhook_deliveries")
            .update({ statut: "failed", reponse: (e instanceof Error ? e.message : "network error").slice(0, 500) })
            .eq("id", delivery.id);
          results.push({ endpoint: ep.nom, statut: "failed" });
        }
      })
    );

    return json({ evenement, results });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Internal error" }, 500);
  }
});
