import type { CommandeWithRelations, Entreprise } from '@/lib/supabase';
import { formatShortDate } from '@/lib/format';
import { formaterPayloadFiscal, genererFiscalQRCodeSVG } from '@/lib/fiscalQrCode';

export type TypeDocument = 'devis' | 'facture' | 'bon_livraison' | 'avoir';

const TITRES: Record<TypeDocument, string> = {
  devis: 'DEVIS',
  facture: 'FACTURE',
  bon_livraison: 'BON DE LIVRAISON',
  avoir: 'AVOIR',
};

const NUMERO_PREFIX: Record<TypeDocument, string> = {
  devis: 'DEV',
  facture: 'FAC',
  bon_livraison: 'BL',
  avoir: 'AVO',
};

function esc(s: string | null | undefined): string {
  return (s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function fmt(n: number): string {
  return new Intl.NumberFormat('fr-FR', { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

// Ouvre une fenêtre d'impression contenant le document commercial complet
// (logo, coordonnées, client, lignes, HT/TVA/TTC, mentions). L'utilisateur
// enregistre en PDF via la boîte d'impression du navigateur.
export function printDocumentCommercial(
  type: TypeDocument,
  commande: CommandeWithRelations,
  entreprise: Entreprise | null
): void {
  const devise = entreprise?.devise || 'XOF';
  const symbole = devise === 'XOF' ? 'FCFA' : devise === 'EUR' ? '€' : devise;
  const tvaTaux = commande.tva_taux ?? entreprise?.tva_taux ?? 0;
  const tvaActive = entreprise?.tva_active !== false && (commande.montant_tva === null || commande.montant_tva > 0 || commande.type_document !== null);
  const ht = commande.montant_ht ?? commande.montant_total;
  const tva = tvaActive ? (commande.montant_tva ?? (ht * tvaTaux) / 100) : 0;
  const ttc = commande.montant_total;

  const clientNom = commande.type === 'achat'
    ? commande.fournisseurs?.nom || '—'
    : commande.clients?.nom || commande.client_walkin || 'Client comptoir';
  const clientDetail = commande.type === 'achat'
    ? 'Fournisseur'
    : 'Client';

  const isAvoir = type === 'avoir';
  const lignes = commande.commande_items || [];
  const numero = commande.numero_document || commande.reference || '—';
  const dateDoc = formatShortDate(commande.date_commande);
  const echeance = commande.date_echeance ? formatShortDate(commande.date_echeance) : null;

  const logoHtml = entreprise?.logo_url
    ? `<img src="${esc(entreprise.logo_url)}" style="max-height:70px;max-width:180px;object-fit:contain" />`
    : `<div style="font-size:26px;font-weight:800;color:#0ea5e9;letter-spacing:-1px">${esc(entreprise?.nom || 'Entreprise')}</div>`;

  const lignesHtml = lignes.map((it) => `
    <tr>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0">${esc(it.produits?.nom || 'Article')}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${it.libelle_unite ? `${Number(it.quantite_unite)} ${esc(it.libelle_unite)}<br><span style="font-size:10px;color:#64748b">${it.quantite} unités</span>` : it.quantite}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right">${fmt(it.libelle_unite ? Number(it.prix_unite) : it.prix_unitaire)}</td>
      <td style="padding:7px 10px;border-bottom:1px solid #e2e8f0;text-align:right;font-weight:600">${fmt(it.sous_total)}</td>
    </tr>`).join('');

  // Génération du QR Code Fiscal Normalisé UEMOA / DGI (Facture certifiée)
  const isFactureOrAvoir = type === 'facture' || type === 'avoir';
  const fiscalPayload = formaterPayloadFiscal({
    emetteurIfu: entreprise?.ifu || '00000000',
    numeroFacture: numero,
    dateEmission: commande.date_commande ? new Date(commande.date_commande).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
    montantHt: ht,
    montantTva: tva,
    montantTtc: ttc,
    clientIfu: commande.clients?.ifu || null,
    signatureSecurite: commande.signature_dgi || ('SIG-' + Math.abs(ttc * 31).toString(16).toUpperCase()),
  });

  const qrCodeSvg = isFactureOrAvoir ? genererFiscalQRCodeSVG(fiscalPayload, { size: 105 }) : '';

  const blocFiscalHtml = isFactureOrAvoir ? `
    <div style="margin-top:20px;padding:12px 16px;border:1.5px dashed #0284c7;border-radius:10px;background:#f0f9ff;display:flex;align-items:center;justify-content:space-between;gap:16px;">
      <div style="flex:1;">
        <div style="font-size:11px;font-weight:800;color:#0369a1;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;">
          ✓ Facture Normalisée — Norme Fiscale UEMOA / DGI
        </div>
        <div style="font-size:10px;color:#334155;line-height:1.5;">
          <strong>IFU Émetteur :</strong> ${esc(entreprise?.ifu || 'Non renseigné')} | <strong>RCCM :</strong> ${esc(entreprise?.rccm || 'Non renseigné')}<br/>
          <strong>Division Fiscale :</strong> ${esc(entreprise?.division_fiscale || 'DGI Centre')}<br/>
          <strong>Signature d'Inviolabilité :</strong> <code style="font-family:monospace;background:#e0f2fe;padding:2px 4px;border-radius:4px;font-weight:700">${esc(commande.signature_dgi || 'SIG-OHADA-VALID')}</code><br/>
          <em>Ce document électronique certifié tient lieu de facture légale déductible conformément aux directives UEMOA.</em>
        </div>
      </div>
      <div style="flex-shrink:0;text-align:center;">
        <div style="background:#fff;padding:4px;border-radius:6px;border:1px solid #bae6fd;display:inline-block;">
          ${qrCodeSvg}
        </div>
        <div style="font-size:8px;color:#0284c7;font-weight:700;margin-top:2px;">SCAN FISCAL DGI</div>
      </div>
    </div>
  ` : '';

  const w = window.open('', '_blank', 'width=820,height=1000');
  if (!w) return;

  w.document.write(`<!doctype html>
<html lang="fr"><head><meta charset="utf-8" />
<title>${TITRES[type]} ${esc(numero)}</title>
<style>
  * { box-sizing: border-box; margin: 0; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; padding: 36px 44px; font-size: 13px; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px; }
  .meta { text-align: right; font-size: 12px; color: #475569; line-height: 1.6; }
  h1.doc-title { font-size: 24px; letter-spacing: 3px; margin: 26px 0 4px; color: #0ea5e9; }
  .ref-band { background: #f1f5f9; border-radius: 8px; padding: 10px 14px; display: flex; justify-content: space-between; margin-bottom: 22px; font-size: 12px; }
  .parties { display: flex; justify-content: space-between; margin-bottom: 24px; gap: 24px; }
  .party { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; min-width: 240px; }
  .party h4 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #64748b; margin-bottom: 5px; }
  .party .nom { font-weight: 700; font-size: 14px; }
  .party .det { color: #64748b; font-size: 11.5px; margin-top: 3px; line-height: 1.5; }
  table { width: 100%; border-collapse: collapse; }
  thead th { background: #0f172a; color: #fff; text-align: right; padding: 9px 10px; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; }
  thead th:first-child { text-align: left; border-radius: 8px 0 0 8px; }
  thead th:last-child { border-radius: 0 8px 8px 0; }
  .totals { margin-top: 18px; display: flex; justify-content: flex-end; }
  .totals table { width: 320px; }
  .totals td { padding: 6px 12px; font-size: 13px; }
  .totals .label { color: #64748b; text-align: right; }
  .totals .val { text-align: right; font-weight: 600; width: 120px; }
  .totals .ttc td { background: #0ea5e9; color: #fff; font-weight: 800; font-size: 15px; border-radius: 8px; }
  .foot { margin-top: 36px; padding-top: 14px; border-top: 1px solid #e2e8f0; color: #64748b; font-size: 10.5px; text-align: center; line-height: 1.6; }
  .mention { margin-top: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 8px 12px; color: #92400e; font-size: 11.5px; }
  ${isAvoir ? '.doc-title { color: #dc2626 !important; }' : ''}
  @media print { body { padding: 12px; } }
</style></head>
<body>
  <div class="head">
    <div>${logoHtml}
      <div style="font-size:11px;color:#64748b;margin-top:6px;line-height:1.6">
        ${esc(entreprise?.adresse || '')}${entreprise?.ville ? ' — ' + esc(entreprise.ville) : ''}<br/>
        ${esc(entreprise?.telephone || '')}${entreprise?.email ? ' · ' + esc(entreprise.email) : ''}
      </div>
    </div>
    <div class="meta">
      <strong>${esc(entreprise?.nom || '')}</strong><br/>
      ${entreprise?.ifu ? `<strong>N° IFU :</strong> ${esc(entreprise.ifu)}<br/>` : ''}
      ${entreprise?.rccm ? `<strong>RCCM :</strong> ${esc(entreprise.rccm)}<br/>` : ''}
      ${entreprise?.division_fiscale ? `<strong>Division Fiscale :</strong> ${esc(entreprise.division_fiscale)}<br/>` : ''}
      ${entreprise?.tva_active ? 'Assujetti à la TVA (18%)<br/>' : 'Non assujetti à la TVA<br/>'}
      Date : ${esc(new Date().toLocaleDateString('fr-FR'))}
    </div>
  </div>

  <h1 class="doc-title">${TITRES[type]}</h1>

  <div class="ref-band">
    <span>N° <strong>${esc(numero)}</strong></span>
    <span>Date : <strong>${dateDoc}</strong></span>
    ${echeance ? `<span>Échéance : <strong>${echeance}</strong></span>` : ''}
    <span>Devise : <strong>${esc(symbole)}</strong></span>
  </div>

  <div class="parties">
    <div class="party">
      <h4>Émetteur</h4>
      <div class="nom">${esc(entreprise?.nom || '')}</div>
      <div class="det">${esc(entreprise?.slogan || '')}</div>
    </div>
    <div class="party">
      <h4>${clientDetail}</h4>
      <div class="nom">${esc(clientNom)}</div>
      ${commande.clients?.telephone ? `<div class="det">${esc(commande.clients.telephone)}</div>` : ''}
      ${commande.clients?.adresse ? `<div class="det">${esc(commande.clients.adresse)} ${esc(commande.clients.ville || '')}</div>` : ''}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Désignation</th><th>Qté</th><th>Prix unitaire</th><th>Total</th></tr>
    </thead>
    <tbody>${lignesHtml || '<tr><td colspan="4" style="padding:16px;text-align:center;color:#94a3b8">Aucune ligne</td></tr>'}</tbody>
  </table>

  <div class="totals">
    <table>
      ${tvaActive ? `
      <tr><td class="label">Total HT</td><td class="val">${fmt(ht)} ${esc(symbole)}</td></tr>
      <tr><td class="label">TVA (${tvaTaux}%)</td><td class="val">${fmt(tva)} ${esc(symbole)}</td></tr>` : ''}
      <tr class="ttc"><td class="label">${isAvoir ? 'Montant de l\u2019avoir' : 'Total TTC'}</td><td class="val">${fmt(ttc)} ${esc(symbole)}</td></tr>
    </table>
  </div>

  ${commande.note ? `<div class="mention"><strong>Note :</strong> ${esc(commande.note)}</div>` : ''}

  ${blocFiscalHtml}

  <div class="foot">
    ${esc(entreprise?.mention_bas || '')}
    ${entreprise?.tva_active ? `<br/>TVA applicable au taux de ${tvaTaux}% — Arrêtée la présente ${TITRES[type].toLowerCase()} à la somme de ${fmt(ttc)} ${esc(symbole)}.` : ''}
  </div>
</body></html>`);
  w.document.close();
  setTimeout(() => { w.focus(); w.print(); }, 350);
}
