export function formatCurrency(value: number, devise: string = 'EUR'): string {
  return new Intl.NumberFormat('fr-FR', {
    style: 'currency',
    currency: devise === 'XOF' ? 'XOF' : devise,
    maximumFractionDigits: devise === 'XOF' ? 0 : 2,
  }).format(value);
}

// Alias métier: formate dans la devise de l'entreprise (FCFA par défaut)
export function montant(value: number, devise?: string): string {
  return formatCurrency(value, devise || 'XOF');
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('fr-FR').format(value);
}

export function formatDate(dateString: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(dateString));
}

export function formatShortDate(dateString: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateString));
}

export function formatMonth(dateString: string): string {
  return new Intl.DateTimeFormat('fr-FR', {
    month: 'short',
    year: '2-digit',
  }).format(new Date(dateString));
}

export function generateReference(prefix: string = 'CMD'): string {
  const date = new Date();
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  const rand = Math.floor(Math.random() * 9000 + 1000);
  return `${prefix}-${y}${m}${d}-${rand}`;
}

export function getInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();
}

// Jours restants avant péremption (négatif = déjà expiré)
export function daysUntil(dateString: string): number {
  const d = new Date(dateString);
  const now = new Date();
  return Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

export function peremptionLabel(days: number): { label: string; cls: string } {
  if (days < 0) return { label: 'Expiré', cls: 'bg-red-100 text-red-800' };
  if (days <= 7) return { label: `${days} j`, cls: 'bg-red-50 text-red-700' };
  if (days <= 30) return { label: `${days} j`, cls: 'bg-amber-50 text-amber-700' };
  return { label: `${days} j`, cls: 'bg-emerald-50 text-emerald-700' };
}

export const MODES_PAIEMENT: { value: string; label: string; mobile?: boolean }[] = [
  { value: 'especes', label: 'Espèces' },
  { value: 'orange_money', label: 'Orange Money', mobile: true },
  { value: 'moov_money', label: 'Moov Money', mobile: true },
  { value: 'wave', label: 'Wave', mobile: true },
  { value: 'virement', label: 'Virement bancaire' },
  { value: 'cheque', label: 'Chèque' },
  { value: 'carte', label: 'Carte bancaire' },
];

export function modePaiementLabel(mode: string): string {
  return MODES_PAIEMENT.find((m) => m.value === mode)?.label || mode;
}

export const TYPE_DOCUMENT_LABELS: Record<string, string> = {
  devis: 'Devis',
  facture: 'Facture',
  bon_livraison: 'Bon de livraison',
  avoir: 'Avoir',
};

// Génère le prochain numéro légal de document, ex: FAC-2026-0042
export function nextNumeroDocument(type: string, existants: string[]): string {
  const prefixes: Record<string, string> = { devis: 'DEV', facture: 'FAC', bon_livraison: 'BL', avoir: 'AVO' };
  const prefix = prefixes[type] || 'DOC';
  const year = new Date().getFullYear();
  const max = existants
    .filter((n) => n.startsWith(`${prefix}-${year}-`))
    .map((n) => parseInt(n.split('-')[2] || '0', 10))
    .reduce((a, b) => Math.max(a, b), 0);
  return `${prefix}-${year}-${String(max + 1).padStart(4, '0')}`;
}

// État de paiement d'une commande
export function etatPaiement(paye: number, total: number): 'impaye' | 'partiel' | 'paye' {
  if (paye >= total && total > 0) return 'paye';
  if (paye > 0) return 'partiel';
  return 'impaye';
}

export function statutLabel(statut: string): string {
  const labels: Record<string, string> = {
    en_attente: 'En attente',
    confirmee: 'Confirmée',
    expediee: 'Expédiée',
    recue: 'Reçue',
    annulee: 'Annulée',
    en_preparation: 'En préparation',
    envoye: 'Envoyé',
    recu: 'Reçu',
    annule: 'Annulé',
    en_cours: 'En cours',
    valide: 'Validé',
  };
  return labels[statut] || statut;
}

export function statutColor(statut: string): { bg: string; text: string; dot: string } {
  const colors: Record<string, { bg: string; text: string; dot: string }> = {
    en_attente: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    confirmee: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
    expediee: { bg: 'bg-violet-50', text: 'text-violet-700', dot: 'bg-violet-500' },
    recue: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    annulee: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    en_preparation: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    envoye: { bg: 'bg-sky-50', text: 'text-sky-700', dot: 'bg-sky-500' },
    recu: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
    annule: { bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
    en_cours: { bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
    valide: { bg: 'bg-emerald-50', text: 'text-emerald-700', dot: 'bg-emerald-500' },
  };
  return colors[statut] || colors.en_attente;
}
