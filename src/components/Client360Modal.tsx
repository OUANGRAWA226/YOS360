import { useState, useMemo } from 'react';
import {
  Users,
  Award,
  Wallet,
  Phone,
  Mail,
  MapPin,
  Calendar,
  DollarSign,
  TrendingUp,
  Receipt,
  FileText,
  AlertTriangle,
  CheckCircle2,
  Share2,
  Clock,
  Sparkles,
  ArrowRight,
  ExternalLink,
  Percent,
} from 'lucide-react';
import type {
  Client,
  CommandeWithRelations,
  PaiementWithRelations,
  FideliteTransaction,
  Entreprise,
} from '@/lib/supabase';
import { Modal } from '@/components/Modal';
import { formatCurrency, formatDate, formatNumber } from '@/lib/format';
import { PALIERS_CONFIG, VALEUR_POINT_FCFA } from '@/lib/comptaSyscohada';

type Props = {
  client: Client;
  commandes: CommandeWithRelations[];
  paiements: PaiementWithRelations[];
  fideliteTransactions?: FideliteTransaction[];
  entreprise?: Entreprise | null;
  onClose: () => void;
  onNavigateAction?: (page: string, sub?: string) => void;
};

export function Client360Modal({
  client,
  commandes,
  paiements,
  fideliteTransactions = [],
  entreprise,
  onClose,
  onNavigateAction,
}: Props) {
  const [activeSubTab, setActiveSubTab] = useState<'apercu' | 'commandes' | 'paiements' | 'fidelite'>('apercu');

  // Commandes de ce client
  const clientCommandes = useMemo(() => {
    return commandes
      .filter((c) => c.client_id === client.id)
      .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime());
  }, [commandes, client.id]);

  // Paiements de ce client
  const clientPaiements = useMemo(() => {
    return paiements
      .filter((p) => p.client_id === client.id)
      .sort((a, b) => new Date(b.date_paiement || '').getTime() - new Date(a.date_paiement || '').getTime());
  }, [paiements, client.id]);

  // Calculs financiers
  const totalFacture = useMemo(() => {
    return clientCommandes
      .filter((c) => c.type === 'vente' && c.statut !== 'annulee')
      .reduce((sum, c) => sum + (Number(c.total) || 0), 0);
  }, [clientCommandes]);

  const totalRegle = useMemo(() => {
    return clientPaiements.reduce((sum, p) => sum + (Number(p.montant) || 0), 0);
  }, [clientPaiements]);

  const soldeRestantDu = Math.max(0, totalFacture - totalRegle);
  const panierMoyen = clientCommandes.length > 0 ? Math.round(totalFacture / clientCommandes.length) : 0;

  // Fidélité
  const palier = client.palier_fidelite || 'bronze';
  const configPalier = PALIERS_CONFIG[palier] || PALIERS_CONFIG.bronze;
  const points = client.points_fidelite || 0;
  const valeurPointsFCFA = points * VALEUR_POINT_FCFA;

  // Dépassement encours max
  const encoursMax = client.encours_max || 0;
  const estEnDepassementCredit = encoursMax > 0 && soldeRestantDu > encoursMax;

  // Relance WhatsApp
  const handleRelanceWhatsApp = () => {
    const tel = (client.telephone || '').replace(/[^0-9]/g, '');
    if (!tel) return;

    const message = `Bonjour ${client.nom},\nNous vous rappelons que votre compte client chez ${entreprise?.nom || 'notre établissement'} présente un solde dû de ${formatCurrency(soldeRestantDu)}.\nMerci de bien vouloir procéder à son règlement.\nCordialement,\nService Comptabilité & Relations Clients.`;
    const url = `https://wa.me/${tel}?text=${encodeURIComponent(message)}`;
    window.open(url, '_blank');
  };

  return (
    <Modal open={true} onClose={onClose} title={`Vue Client 360° — ${client.nom}`} size="xl">
      <div className="space-y-6">
        {/* Bandeau d'en-tête du profil client */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-slate-900 to-slate-800 text-white shadow-md flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-sky-400 to-blue-600 text-white flex items-center justify-center font-bold text-xl shadow-md">
              {client.nom.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-xl font-bold">{client.nom}</h2>
                <span
                  className="px-2.5 py-0.5 rounded-full text-xs font-bold capitalize text-white flex items-center gap-1 shadow-xs"
                  style={{ backgroundColor: configPalier.couleur }}
                >
                  <Award className="w-3.5 h-3.5" />
                  <span>Palier {configPalier.label}</span>
                </span>
                {client.categorie_client && (
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-bold uppercase bg-white/20 text-white">
                    {client.categorie_client}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-4 text-xs text-slate-300 mt-1 flex-wrap">
                {client.telephone && (
                  <span className="flex items-center gap-1">
                    <Phone className="w-3 h-3 text-sky-400" /> {client.telephone}
                  </span>
                )}
                {client.email && (
                  <span className="flex items-center gap-1">
                    <Mail className="w-3 h-3 text-sky-400" /> {client.email}
                  </span>
                )}
                {client.ville && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3 text-sky-400" /> {client.ville}, {client.pays}
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end md:self-auto">
            {client.telephone && (
              <button
                onClick={handleRelanceWhatsApp}
                className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
                title="Relancer par WhatsApp"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>WhatsApp</span>
              </button>
            )}
          </div>
        </div>

        {/* Widgets financiers & fidélité */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Total achats</span>
            <strong className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 block">
              {formatCurrency(totalFacture)}
            </strong>
            <span className="text-[10px] text-slate-500">{clientCommandes.length} commandes</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Panier moyen</span>
            <strong className="text-lg font-mono font-bold text-slate-900 dark:text-slate-100 mt-1 block">
              {formatCurrency(panierMoyen)}
            </strong>
            <span className="text-[10px] text-slate-500">Par commande</span>
          </div>

          <div className={`p-4 rounded-xl border ${
            estEnDepassementCredit
              ? 'border-rose-300 bg-rose-50 dark:bg-rose-500/10 dark:border-rose-500/30'
              : soldeRestantDu > 0
              ? 'border-amber-300 bg-amber-50 dark:bg-amber-500/10 dark:border-amber-500/30'
              : 'border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40'
          }`}>
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Solde restant dû</span>
            <strong className={`text-lg font-mono font-black mt-1 block ${
              soldeRestantDu > 0 ? 'text-rose-600 dark:text-rose-400' : 'text-emerald-600'
            }`}>
              {formatCurrency(soldeRestantDu)}
            </strong>
            {encoursMax > 0 && (
              <span className="text-[10px] text-slate-500 block">
                Plafond : {formatCurrency(encoursMax)}
              </span>
            )}
          </div>

          <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40">
            <span className="text-[11px] text-slate-400 uppercase font-semibold block">Points fidélité</span>
            <strong className="text-lg font-mono font-bold text-amber-600 mt-1 block">
              {formatNumber(points)} pts
            </strong>
            <span className="text-[10px] text-emerald-600 font-semibold block">
              = {formatCurrency(valeurPointsFCFA)} de remise
            </span>
          </div>
        </div>

        {/* Sous-onglets */}
        <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-2">
          <button
            onClick={() => setActiveSubTab('apercu')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeSubTab === 'apercu'
                ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Fiche Fiscale & Coordonnées
          </button>
          <button
            onClick={() => setActiveSubTab('commandes')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeSubTab === 'commandes'
                ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Commandes & Factures ({clientCommandes.length})
          </button>
          <button
            onClick={() => setActiveSubTab('paiements')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeSubTab === 'paiements'
                ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Historique Règlements ({clientPaiements.length})
          </button>
          <button
            onClick={() => setActiveSubTab('fidelite')}
            className={`px-4 py-2 text-xs font-semibold border-b-2 transition-colors ${
              activeSubTab === 'fidelite'
                ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
                : 'border-transparent text-slate-500 hover:text-slate-900'
            }`}
          >
            Programme Fidélité
          </button>
        </div>

        {/* CONTENU SOUS-ONGLET 1 : FICHE FISCALE */}
        {activeSubTab === 'apercu' && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-sky-500" />
                <span>Identité Légale & Fiscale (UEMOA)</span>
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Numéro IFU :</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{client.ifu || 'Non renseigné'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Numéro RCCM :</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{client.rccm || 'Non renseigné'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Division fiscale :</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{client.division_fiscale || 'DME / DGE'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Régime d'imposition :</span>
                  <span className="font-medium text-slate-800 dark:text-slate-200">{client.regime_imposition || 'RSI'}</span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
              <h4 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-emerald-500" />
                <span>Conditions de Crédit & Paiement</span>
              </h4>
              <div className="space-y-2">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Plafond de crédit accordé :</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-slate-100">
                    {client.encours_max ? formatCurrency(client.encours_max) : 'Illimité / Non défini'}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Délai de paiement standard :</span>
                  <span className="font-bold text-slate-900 dark:text-slate-100">{client.delai_paiement_jours || 30} jours</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-400">Catégorie tarifaire :</span>
                  <span className="font-bold text-sky-600 capitalize">{client.categorie_client || 'Détail'}</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-400">Date premier achat :</span>
                  <span className="text-slate-700 dark:text-slate-300">{formatDate(client.created_at)}</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* CONTENU SOUS-ONGLET 2 : COMMANDES */}
        {activeSubTab === 'commandes' && (
          <div className="overflow-x-auto max-h-[350px]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Réf / Doc</th>
                  <th className="py-2.5 px-3">Statut</th>
                  <th className="py-2.5 px-3 text-right">Total TTC</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {clientCommandes.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      Aucune commande pour ce client.
                    </td>
                  </tr>
                ) : (
                  clientCommandes.map((c) => (
                    <tr key={c.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-500">{formatDate(c.created_at)}</td>
                      <td className="py-2 px-3 font-mono font-bold text-sky-600">{c.numero_document || c.reference || '—'}</td>
                      <td className="py-2 px-3">
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 capitalize">
                          {c.statut.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-slate-900 dark:text-slate-100">
                        {formatCurrency(c.total)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* CONTENU SOUS-ONGLET 3 : PAIEMENTS */}
        {activeSubTab === 'paiements' && (
          <div className="overflow-x-auto max-h-[350px]">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Date</th>
                  <th className="py-2.5 px-3">Mode</th>
                  <th className="py-2.5 px-3">Réf transaction</th>
                  <th className="py-2.5 px-3 text-right">Montant réglé</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {clientPaiements.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="py-6 text-center text-slate-400">
                      Aucun paiement enregistré pour ce client.
                    </td>
                  </tr>
                ) : (
                  clientPaiements.map((p) => (
                    <tr key={p.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3 text-slate-500">{formatDate(p.date_paiement)}</td>
                      <td className="py-2 px-3 capitalize font-medium text-slate-700 dark:text-slate-300">
                        {p.mode_paiement.replace('_', ' ')}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-400">{p.reference || '—'}</td>
                      <td className="py-2 px-3 text-right font-mono font-bold text-emerald-600">
                        {formatCurrency(p.montant)}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* CONTENU SOUS-ONGLET 4 : FIDÉLITÉ */}
        {activeSubTab === 'fidelite' && (
          <div className="space-y-4 text-xs">
            <div className="p-4 rounded-xl border border-amber-200 dark:border-amber-500/30 bg-amber-50/50 dark:bg-amber-500/10 flex items-center justify-between">
              <div>
                <span className="text-[11px] text-amber-800 dark:text-amber-300 font-semibold block">Solde fidélité actuel</span>
                <span className="text-2xl font-black font-mono text-amber-700 dark:text-amber-400">
                  {formatNumber(points)} points
                </span>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Convertible en <strong>{formatCurrency(valeurPointsFCFA)}</strong> de remise sur le prochain passage en caisse.
                </p>
              </div>

              <div className="text-right">
                <span className="text-[11px] text-slate-500 block">Total dépenses cumulées</span>
                <strong className="text-base font-mono text-slate-900 dark:text-slate-100">
                  {formatCurrency(client.total_depense_cumule || totalFacture)}
                </strong>
              </div>
            </div>

            {/* Paliers du programme */}
            <div className="grid grid-cols-4 gap-2 text-center text-[11px]">
              {Object.entries(PALIERS_CONFIG).map(([key, cfg]) => {
                const isCurrent = palier === key;
                return (
                  <div
                    key={key}
                    className={`p-2.5 rounded-xl border transition-all ${
                      isCurrent
                        ? 'border-sky-500 bg-sky-50/50 dark:bg-sky-500/10 font-bold'
                        : 'border-slate-200 dark:border-slate-800 text-slate-500'
                    }`}
                  >
                    <span
                      className="w-3 h-3 rounded-full mx-auto mb-1 block"
                      style={{ backgroundColor: cfg.couleur }}
                    />
                    <strong className="capitalize text-slate-900 dark:text-slate-100 block">{cfg.label}</strong>
                    <span className="text-[10px] text-slate-400 block mt-0.5">
                      {cfg.seuilMax === Infinity ? `> ${formatNumber(cfg.seuilMin)} F` : `${formatNumber(cfg.seuilMin)} - ${formatNumber(cfg.seuilMax)} F`}
                    </span>
                    {cfg.bonusPct > 0 && (
                      <span className="text-[9px] text-emerald-600 font-semibold block mt-0.5">
                        +{cfg.bonusPct}% pts bonus
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bouton de fermeture */}
        <div className="flex items-center justify-end pt-3 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-xs font-semibold text-slate-800 dark:text-slate-200 transition-colors"
          >
            Fermer
          </button>
        </div>
      </div>
    </Modal>
  );
}
