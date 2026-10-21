import { useState, useMemo, useEffect, useCallback } from 'react';
import {
  Users,
  Award,
  Target,
  DollarSign,
  TrendingUp,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Calendar,
  Building2,
  Phone,
  Mail,
  ArrowRight,
  Percent,
  Check,
  RefreshCw,
  Sliders,
  Sparkles,
  ShieldCheck,
  Eye,
  Trash2,
} from 'lucide-react';
import type {
  EquipeCollaborateur,
  EquipeObjectif,
  EquipeCommission,
  Entrepot,
  CommandeWithRelations,
} from '@/lib/supabase';
import { Card, InfoBox, SmallBox, Callout } from '@/components/adminlte';
import { Modal } from '@/components/Modal';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { showToast } from '@/components/Toast';
import { formatNumber, formatDate, formatCurrency } from '@/lib/format';
import { fetchTable, writeRow } from '@/lib/dataLayer';
import { can, type Role } from '@/lib/permissions';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { evaluerCommissionsCollaborateur } from '@/lib/comptaSyscohada';

type Props = {
  role: Role | null;
  entrepots: Entrepot[];
  commandes: CommandeWithRelations[];
  loading: boolean;
};

type TabType = 'collaborateurs' | 'objectifs' | 'commissions';

export function Equipe({ role, entrepots, commandes, loading: parentLoading }: Props) {
  const { profile, entrepriseId } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('collaborateurs');
  const [loading, setLoading] = useState(true);

  // Données
  const [collaborateurs, setCollaborateurs] = useState<EquipeCollaborateur[]>([]);
  const [objectifs, setObjectifs] = useState<EquipeObjectif[]>([]);
  const [commissions, setCommissions] = useState<EquipeCommission[]>([]);

  // Filtres
  const [periodeMois, setPeriodeMois] = useState<string>(new Date().toISOString().slice(0, 7)); // YYYY-MM
  const [selectedSiteId, setSelectedSiteId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Modals
  const [newCollabModal, setNewCollabModal] = useState(false);
  const [newObjectifModal, setNewObjectifModal] = useState(false);
  const [saving, setSaving] = useState(false);

  // Formulaire collaborateur
  const [collabForm, setCollabForm] = useState({
    matricule: '',
    nom: '',
    prenom: '',
    poste: 'Vendeur Showroom',
    telephone: '',
    email: '',
    site_id: '',
    salaire_base: '150000',
    taux_commission_pct: '2.0',
    base_calcul_commission: 'ca_encaisse' as EquipeCollaborateur['base_calcul_commission'],
  });

  // Formulaire objectif
  const [objectifForm, setObjectifForm] = useState({
    collaborateur_id: '',
    periode: new Date().toISOString().slice(0, 7),
    site_id: '',
    objectif_ca: '5000000',
    objectif_marge: '1000000',
    prime_objectif: '50000',
  });

  const canManage = can(role, 'audit', 'edit') || role === 'admin' || role === 'gerant' || role === 'proprietaire';

  const loadAll = useCallback(async () => {
    if (!entrepriseId) return;
    setLoading(true);
    try {
      const [colls, objs, comms] = await Promise.all([
        fetchTable<EquipeCollaborateur>('equipe_collaborateurs', '*, site:site_id(nom)', { column: 'nom', ascending: true }),
        fetchTable<EquipeObjectif>('equipe_objectifs', '*, collaborateur:collaborateur_id(*)', { column: 'periode', ascending: false }),
        fetchTable<EquipeCommission>('equipe_commissions', '*, collaborateur:collaborateur_id(*)', { column: 'periode', ascending: false }),
      ]);
      setCollaborateurs(colls);
      setObjectifs(objs);
      setCommissions(comms);
    } catch (err) {
      console.error('Erreur chargement équipe:', err);
    } finally {
      setLoading(false);
    }
  }, [entrepriseId]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  // Ventes du mois en cours
  const ventesMoisCourant = useMemo(() => {
    return commandes.filter((c) => {
      if (c.type !== 'vente') return false;
      if (c.statut === 'annulee') return false;
      const d = (c.created_at || '').slice(0, 7);
      return d === periodeMois;
    });
  }, [commandes, periodeMois]);

  // Synthèse des performances par collaborateur
  const performances = useMemo(() => {
    return collaborateurs.map((collab) => {
      // Ventes attribuées à ce collaborateur (soit par created_by si user_id lié, soit par boutique)
      const ventesCollab = ventesMoisCourant.filter((c) => {
        if (collab.user_id && c.created_by === collab.user_id) return true;
        if (collab.site_id && c.entrepot_id === collab.site_id) return true;
        return false;
      });

      const totalVentes = ventesCollab.reduce((s, c) => s + (Number(c.total) || 0), 0);
      const totalMarge = Math.round(totalVentes * 0.25); // Estimation marge 25% si pas de coût de revient exact

      const obj = objectifs.find((o) => o.collaborateur_id === collab.id && o.periode === periodeMois);
      const objectifCa = obj ? Number(obj.objectif_ca) : 0;
      const prime = obj ? Number(obj.prime_objectif) : 0;

      return evaluerCommissionsCollaborateur(collab, totalVentes, totalMarge, objectifCa, prime);
    });
  }, [collaborateurs, ventesMoisCourant, objectifs, periodeMois]);

  // Totaux globaux équipe
  const totalVentesEquipe = useMemo(() => {
    return performances.reduce((s, p) => s + p.totalVentesMois, 0);
  }, [performances]);

  const totalCommissionsEquipe = useMemo(() => {
    return performances.reduce((s, p) => s + p.montantCommission + p.primeObjectif, 0);
  }, [performances]);

  // Création collaborateur
  const handleCreateCollab = async () => {
    if (!collabForm.nom || !collabForm.prenom || !collabForm.matricule) {
      showToast('Matricule, nom et prénom sont obligatoires', 'error');
      return;
    }
    setSaving(true);
    try {
      const { error } = await writeRow('equipe_collaborateurs', 'insert', {
        entreprise_id: entrepriseId,
        site_id: collabForm.site_id || null,
        matricule: collabForm.matricule,
        nom: collabForm.nom,
        prenom: collabForm.prenom,
        poste: collabForm.poste,
        telephone: collabForm.telephone || null,
        email: collabForm.email || null,
        salaire_base: parseFloat(collabForm.salaire_base) || 0,
        taux_commission_pct: parseFloat(collabForm.taux_commission_pct) || 2.0,
        base_calcul_commission: collabForm.base_calcul_commission,
        statut: 'actif',
      });
      if (error) throw new Error(error);

      showToast('Collaborateur ajouté avec succès');
      setNewCollabModal(false);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la création', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Définir un objectif
  const handleSaveObjectif = async () => {
    if (!objectifForm.collaborateur_id) {
      showToast('Sélectionnez un collaborateur', 'error');
      return;
    }
    setSaving(true);
    try {
      const { error } = await writeRow('equipe_objectifs', 'insert', {
        entreprise_id: entrepriseId,
        collaborateur_id: objectifForm.collaborateur_id,
        site_id: objectifForm.site_id || null,
        periode: objectifForm.periode,
        objectif_ca: parseFloat(objectifForm.objectif_ca) || 0,
        objectif_marge: parseFloat(objectifForm.objectif_marge) || 0,
        prime_objectif: parseFloat(objectifForm.prime_objectif) || 0,
      });
      if (error) throw new Error(error);

      showToast('Objectif mensuel configuré avec succès');
      setNewObjectifModal(false);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la configuration de l\'objectif', 'error');
    } finally {
      setSaving(false);
    }
  };

  // Liquider / Valider une commission
  const handleValiderCommission = async (perf: any) => {
    setSaving(true);
    try {
      const { error } = await writeRow('equipe_commissions', 'insert', {
        entreprise_id: entrepriseId,
        collaborateur_id: perf.collaborateurId,
        periode: periodeMois,
        total_ventes_base: perf.totalVentesMois,
        taux_applique: perf.tauxCommissionPct,
        montant_commission: perf.montantCommission,
        prime_bonus: perf.primeObjectif,
        retenues: 0,
        net_a_payer: perf.totalNetAPayer,
        statut: 'valide',
        valide_par: profile?.id || null,
      });
      if (error) throw new Error(error);

      showToast(`Commission validée pour ${perf.nomComplet} (${formatCurrency(perf.totalNetAPayer)})`);
      loadAll();
    } catch (err: any) {
      showToast(err.message || 'Erreur lors de la validation', 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* AdminLTE App Header Page Title */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2.5">
            <Users className="w-7 h-7 text-sky-600 dark:text-sky-400" />
            <span>Équipe, Objectifs & Commissions</span>
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Gestion des collaborateurs, suivi des objectifs mensuels et liquidation automatique des commissions sur ventes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Sélecteur de mois */}
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300">
            <Calendar className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="month"
              value={periodeMois}
              onChange={(e) => setPeriodeMois(e.target.value)}
              className="bg-transparent text-xs font-bold text-slate-900 dark:text-slate-100 focus:outline-none"
            />
          </div>

          {canManage && (
            <>
              <button
                onClick={() => {
                  setObjectifForm({
                    collaborateur_id: collaborateurs[0]?.id || '',
                    periode: periodeMois,
                    site_id: entrepots[0]?.id || '',
                    objectif_ca: '5000000',
                    objectif_marge: '1000000',
                    prime_objectif: '50000',
                  });
                  setNewObjectifModal(true);
                }}
                disabled={collaborateurs.length === 0}
                className="px-3.5 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 transition-colors flex items-center gap-1.5"
              >
                <Target className="w-3.5 h-3.5 text-amber-500" />
                <span>Fixer un objectif</span>
              </button>

              <button
                onClick={() => {
                  setCollabForm({
                    matricule: `COL-${Math.floor(100 + Math.random() * 900)}`,
                    nom: '',
                    prenom: '',
                    poste: 'Vendeur Showroom',
                    telephone: '',
                    email: '',
                    site_id: entrepots[0]?.id || '',
                    salaire_base: '150000',
                    taux_commission_pct: '2.0',
                    base_calcul_commission: 'ca_encaisse',
                  });
                  setNewCollabModal(true);
                }}
                className="px-4 py-2 rounded-xl bg-sky-600 hover:bg-sky-700 text-white font-semibold text-xs transition-colors flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-4 h-4" />
                <span>Nouveau collaborateur</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* AdminLTE Metric Widgets */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <InfoBox
          icon={Users}
          title="Collaborateurs actifs"
          value={formatNumber(collaborateurs.length)}
          variant="primary"
          description={`${collaborateurs.filter((c) => c.poste.toLowerCase().includes('vendeur') || c.poste.toLowerCase().includes('commercial')).length} vendeurs terrain/boutique`}
        />
        <InfoBox
          icon={TrendingUp}
          title={`Ventes du mois (${periodeMois})`}
          value={formatCurrency(totalVentesEquipe)}
          variant="info"
          description="Chiffre d'affaires réalisé"
        />
        <InfoBox
          icon={Award}
          title="Commissions & Primes"
          value={formatCurrency(totalCommissionsEquipe)}
          variant="warning"
          description="Rémunération variable totale"
        />
        <InfoBox
          icon={Target}
          title="Objectifs mensuels"
          value={`${performances.filter((p) => p.tauxAtteintePct >= 100).length} / ${performances.length}`}
          variant="success"
          description="Vendeurs à 100% ou plus"
        />
      </div>

      {/* Navigation par Onglets */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex items-center gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('collaborateurs')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'collaborateurs'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Équipe & Postes ({collaborateurs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('objectifs')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'objectifs'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Target className="w-4 h-4" />
          <span>Suivi des Objectifs Mensuels</span>
        </button>

        <button
          onClick={() => setActiveTab('commissions')}
          className={`px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors flex items-center gap-2 ${
            activeTab === 'commissions'
              ? 'border-sky-600 text-sky-600 dark:border-sky-400 dark:text-sky-400'
              : 'border-transparent text-slate-600 dark:text-slate-400 hover:text-slate-900'
          }`}
        >
          <Award className="w-4 h-4" />
          <span>Calcul & Liquidation des Commissions</span>
        </button>
      </div>

      {/* ========================================================================= */}
      {/* ONGLET 1 : COLLABORATEURS */}
      {/* ========================================================================= */}
      {activeTab === 'collaborateurs' && (
        <Card title="Fiches collaborateurs de l'entreprise" badge={`${collaborateurs.length} membres`}>
          {collaborateurs.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Aucun collaborateur enregistré pour le moment.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {collaborateurs.map((collab) => (
                <div
                  key={collab.id}
                  className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs hover:border-slate-300 transition-all flex flex-col justify-between"
                >
                  <div>
                    <div className="flex items-start justify-between mb-3">
                      <div>
                        <span className="font-mono text-[10px] font-bold text-sky-600 dark:text-sky-400 block mb-0.5">
                          {collab.matricule}
                        </span>
                        <h3 className="font-bold text-sm text-slate-900 dark:text-slate-100">
                          {collab.prenom} {collab.nom}
                        </h3>
                        <p className="text-xs text-slate-500 font-medium">{collab.poste}</p>
                      </div>

                      <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300">
                        {collab.statut}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400 mb-4">
                      {collab.site && (
                        <div className="flex items-center gap-2">
                          <Building2 className="w-3.5 h-3.5 text-slate-400" />
                          <span>{collab.site.nom}</span>
                        </div>
                      )}
                      {collab.telephone && (
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{collab.telephone}</span>
                        </div>
                      )}
                      {collab.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{collab.email}</span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <div>
                      <span className="text-[11px] text-slate-400 block">Taux commission</span>
                      <strong className="text-slate-900 dark:text-slate-100">{collab.taux_commission_pct}% sur {collab.base_calcul_commission === 'marge_brute' ? 'Marge' : 'CA'}</strong>
                    </div>
                    <div className="text-right">
                      <span className="text-[11px] text-slate-400 block">Salaire fixe</span>
                      <strong className="text-slate-900 dark:text-slate-100 font-mono">{formatCurrency(collab.salaire_base)}</strong>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 2 : OBJECTIFS MENSUELS */}
      {/* ========================================================================= */}
      {activeTab === 'objectifs' && (
        <Card title={`Suivi des objectifs commerciaux pour ${periodeMois}`}>
          {performances.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">
              Aucun collaborateur disponible.
            </div>
          ) : (
            <div className="space-y-4">
              {performances.map((p) => {
                const pct = Math.min(p.tauxAtteintePct, 150);
                const isOver = p.tauxAtteintePct >= 100;

                return (
                  <div
                    key={p.collaborateurId}
                    className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                      <div>
                        <span className="font-mono text-[10px] text-slate-400">{p.matricule}</span>
                        <h4 className="font-bold text-sm text-slate-900 dark:text-slate-100">{p.nomComplet}</h4>
                        <span className="text-xs text-slate-500">{p.poste}</span>
                      </div>

                      <div className="flex items-baseline gap-3 text-right">
                        <div>
                          <span className="text-[10px] text-slate-400 block">Réalisé / Objectif CA</span>
                          <span className="font-mono font-bold text-xs text-slate-900 dark:text-slate-100">
                            {formatCurrency(p.totalVentesMois)} / {formatCurrency(p.objectifCa)}
                          </span>
                        </div>
                        <span className={`px-2.5 py-1 rounded-xl text-xs font-black font-mono ${
                          isOver
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-500/20 dark:text-emerald-300'
                            : 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                        }`}>
                          {p.tauxAtteintePct}%
                        </span>
                      </div>
                    </div>

                    {/* Barre de progression de l'objectif */}
                    <div className="w-full bg-slate-100 dark:bg-slate-800 h-2.5 rounded-full overflow-hidden my-2">
                      <div
                        className={`h-full transition-all duration-300 ${
                          isOver ? 'bg-gradient-to-r from-emerald-500 to-teal-400' : 'bg-gradient-to-r from-sky-500 to-blue-600'
                        }`}
                        style={{ width: `${Math.min(pct, 100)}%` }}
                      />
                    </div>

                    <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                      <span>Marge brute estimée : <strong className="text-slate-800 dark:text-slate-200 font-mono">{formatCurrency(p.totalMargeMois)}</strong></span>
                      {isOver && p.primeObjectif > 0 && (
                        <span className="text-emerald-600 font-bold flex items-center gap-1">
                          <Award className="w-3.5 h-3.5" /> Prime d'objectif : +{formatCurrency(p.primeObjectif)}
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* ========================================================================= */}
      {/* ONGLET 3 : CALCUL & LIQUIDATION DES COMMISSIONS */}
      {/* ========================================================================= */}
      {activeTab === 'commissions' && (
        <Card title={`Synthèse des rémunérations variables (${periodeMois})`}>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-500 text-[11px] uppercase">
                  <th className="py-2.5 px-3">Collaborateur</th>
                  <th className="py-2.5 px-3">Poste</th>
                  <th className="py-2.5 px-3 text-right">Salaire fixe</th>
                  <th className="py-2.5 px-3 text-right">Ventes du mois</th>
                  <th className="py-2.5 px-3 text-center">Taux</th>
                  <th className="py-2.5 px-3 text-right">Commission</th>
                  <th className="py-2.5 px-3 text-right">Prime Obj.</th>
                  <th className="py-2.5 px-3 text-right">Total Net</th>
                  {canManage && <th className="py-2.5 px-3 text-center">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {performances.map((p) => (
                  <tr key={p.collaborateurId} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                    <td className="py-2.5 px-3">
                      <span className="font-bold text-slate-900 dark:text-slate-100 block">{p.nomComplet}</span>
                      <span className="font-mono text-[10px] text-slate-400">{p.matricule}</span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 dark:text-slate-400">{p.poste}</td>
                    <td className="py-2.5 px-3 text-right font-mono text-slate-600 dark:text-slate-300">
                      {formatCurrency(p.salaireBase)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-900 dark:text-slate-100">
                      {formatCurrency(p.totalVentesMois)}
                    </td>
                    <td className="py-2.5 px-3 text-center font-bold text-sky-600 dark:text-sky-400">
                      {p.tauxCommissionPct}%
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-bold text-emerald-600">
                      +{formatCurrency(p.montantCommission)}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono text-amber-600">
                      {p.primeObjectif > 0 ? `+${formatCurrency(p.primeObjectif)}` : '—'}
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono font-black text-slate-900 dark:text-slate-100 text-sm">
                      {formatCurrency(p.totalNetAPayer)}
                    </td>
                    {canManage && (
                      <td className="py-2.5 px-3 text-center">
                        <button
                          onClick={() => handleValiderCommission(p)}
                          className="px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 font-semibold text-[11px] transition-colors"
                        >
                          Valider
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 dark:border-slate-700 font-bold bg-slate-50 dark:bg-slate-800 text-xs">
                  <td colSpan={3} className="py-3 px-3 uppercase text-slate-800 dark:text-slate-200">
                    TOTAUX ÉQUIPE ({periodeMois}) :
                  </td>
                  <td className="py-3 px-3 text-right font-mono text-slate-900 dark:text-slate-100">
                    {formatCurrency(totalVentesEquipe)}
                  </td>
                  <td></td>
                  <td colSpan={2} className="py-3 px-3 text-right font-mono text-emerald-600">
                    {formatCurrency(totalCommissionsEquipe)}
                  </td>
                  <td className="py-3 px-3 text-right font-mono font-black text-slate-900 dark:text-slate-100 text-sm">
                    {formatCurrency(performances.reduce((s, p) => s + p.totalNetAPayer, 0))}
                  </td>
                  {canManage && <td></td>}
                </tr>
              </tfoot>
            </table>
          </div>
        </Card>
      )}

      {/* ========================================================================= */}
      {/* MODAL : NOUVEAU COLLABORATEUR */}
      {/* ========================================================================= */}
      {/* ========================================================================= */}
      {/* MODAL : NOUVEAU COLLABORATEUR */}
      {/* ========================================================================= */}
      {newCollabModal && (
        <Modal open={true} onClose={() => setNewCollabModal(false)} title="Nouveau Collaborateur" size="md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleCreateCollab();
            }}
            className="space-y-4"
          >
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">Matricule <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={collabForm.matricule}
                  onChange={(e) => setCollabForm({ ...collabForm, matricule: e.target.value })}
                  className="form-control-lte text-xs font-mono font-bold"
                />
              </div>

              <div>
                <label className="form-label-lte">Poste / Rôle <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  placeholder="ex: Vendeur Showroom"
                  value={collabForm.poste}
                  onChange={(e) => setCollabForm({ ...collabForm, poste: e.target.value })}
                  className="form-control-lte text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">Nom de famille <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={collabForm.nom}
                  onChange={(e) => setCollabForm({ ...collabForm, nom: e.target.value })}
                  className="form-control-lte text-xs"
                />
              </div>

              <div>
                <label className="form-label-lte">Prénom(s) <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={collabForm.prenom}
                  onChange={(e) => setCollabForm({ ...collabForm, prenom: e.target.value })}
                  className="form-control-lte text-xs"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">Téléphone</label>
                <input
                  type="text"
                  placeholder="+226 70..."
                  value={collabForm.telephone}
                  onChange={(e) => setCollabForm({ ...collabForm, telephone: e.target.value })}
                  className="form-control-lte text-xs"
                />
              </div>

              <div>
                <label className="form-label-lte">Boutique / Site d'affectation</label>
                <select
                  value={collabForm.site_id}
                  onChange={(e) => setCollabForm({ ...collabForm, site_id: e.target.value })}
                  className="form-select-lte text-xs"
                >
                  <option value="">Non assigné</option>
                  {entrepots.map((e) => (
                    <option key={e.id} value={e.id}>{e.nom}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">Salaire fixe (FCFA)</label>
                <input
                  type="number"
                  min="0"
                  value={collabForm.salaire_base}
                  onChange={(e) => setCollabForm({ ...collabForm, salaire_base: e.target.value })}
                  className="form-control-lte text-xs font-mono text-right"
                />
              </div>

              <div>
                <label className="form-label-lte">Taux de commission (%)</label>
                <input
                  type="number"
                  step="0.5"
                  min="0"
                  value={collabForm.taux_commission_pct}
                  onChange={(e) => setCollabForm({ ...collabForm, taux_commission_pct: e.target.value })}
                  className="form-control-lte text-xs font-mono text-right"
                />
              </div>
            </div>

            <div className="modal-footer-lte">
              <button
                type="button"
                onClick={() => setNewCollabModal(false)}
                className="btn-lte btn-lte-sm btn-lte-outline-secondary"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-lte btn-lte-sm btn-lte-primary disabled:opacity-50"
              >
                {saving ? 'Création...' : 'Créer le collaborateur'}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {/* ========================================================================= */}
      {/* MODAL : NOUVEL OBJECTIF MENSUEL */}
      {/* ========================================================================= */}
      {newObjectifModal && (
        <Modal open={true} onClose={() => setNewObjectifModal(false)} title="Fixer un Objectif Mensuel" size="md">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSaveObjectif();
            }}
            className="space-y-4"
          >
            <div>
              <label className="form-label-lte">Collaborateur <span className="text-red-500">*</span></label>
              <select
                value={objectifForm.collaborateur_id}
                onChange={(e) => setObjectifForm({ ...objectifForm, collaborateur_id: e.target.value })}
                className="form-select-lte text-xs font-medium"
                required
              >
                {collaborateurs.map((c) => (
                  <option key={c.id} value={c.id}>{c.prenom} {c.nom} ({c.poste})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="form-label-lte">Mois cible <span className="text-red-500">*</span></label>
                <input
                  type="month"
                  required
                  value={objectifForm.periode}
                  onChange={(e) => setObjectifForm({ ...objectifForm, periode: e.target.value })}
                  className="form-control-lte text-xs"
                />
              </div>

              <div>
                <label className="form-label-lte">Objectif Chiffre d'Affaires (FCFA) <span className="text-red-500">*</span></label>
                <input
                  type="number"
                  min="0"
                  required
                  value={objectifForm.objectif_ca}
                  onChange={(e) => setObjectifForm({ ...objectifForm, objectif_ca: e.target.value })}
                  className="form-control-lte text-xs font-mono font-bold text-right"
                />
              </div>
            </div>

            <div>
              <label className="form-label-lte">Prime en cas d'atteinte 100% (FCFA)</label>
              <input
                type="number"
                min="0"
                value={objectifForm.prime_objectif}
                onChange={(e) => setObjectifForm({ ...objectifForm, prime_objectif: e.target.value })}
                className="form-control-lte text-xs font-mono text-right"
              />
            </div>

            <div className="modal-footer-lte">
              <button
                type="button"
                onClick={() => setNewObjectifModal(false)}
                className="btn-lte btn-lte-sm btn-lte-outline-secondary"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="btn-lte btn-lte-sm btn-lte-primary disabled:opacity-50"
              >
                {saving ? 'Enregistrement...' : 'Enregistrer l\'objectif'}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
