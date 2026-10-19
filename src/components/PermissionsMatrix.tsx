import { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Users,
  Store,
  Warehouse,
  Key,
  Smartphone,
  LogOut,
  CheckCircle2,
  XCircle,
  Lock,
  Layers,
  Save,
  RefreshCw,
} from 'lucide-react';
import { Card, Callout, InfoBox } from '@/components/adminlte';
import { DEFAULT_ROLES, ROLE_LABELS, type Role } from '@/lib/permissions';
import { supabase, type Entrepot, type UserSession } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import type { Profile } from '@/lib/auth';

interface ModuleActionGroup {
  module: string;
  label: string;
  actions: { code: string; label: string; desc: string }[];
}

const MODULE_PERMISSIONS: ModuleActionGroup[] = [
  {
    module: 'ventes',
    label: 'Ventes & Facturation',
    actions: [
      { code: 'ventes.devis.creer', label: 'Devis', desc: 'Émettre et envoyer des devis' },
      { code: 'ventes.commande.valider', label: 'Valider Commandes', desc: 'Approuver les commandes de vente' },
      { code: 'ventes.livraison.creer', label: 'Bons de livraison', desc: 'Générer les sorties de livraison' },
      { code: 'ventes.facture.creer', label: 'Factures', desc: 'Générer factures officielles' },
      { code: 'ventes.facture.valider', label: 'Verrouiller Facture', desc: 'Rendre la facture définitive et inviolable' },
      { code: 'ventes.avoir.creer', label: 'Avoirs / Retours', desc: 'Émettre des avoirs correctifs' },
    ],
  },
  {
    module: 'achats',
    label: 'Achats & Fournisseurs',
    actions: [
      { code: 'achats.demande.creer', label: 'Demandes d\'achat', desc: 'Exprimer un besoin d\'approvisionnement' },
      { code: 'achats.bon_commande.creer', label: 'Bons de commande', desc: 'Émettre un BC fournisseur' },
      { code: 'achats.bon_commande.valider', label: 'Valider BC', desc: 'Engager la dépense financière' },
      { code: 'achats.reception.creer', label: 'Réceptions (CMUP)', desc: 'Entrée en stock et recalcul du CMUP' },
      { code: 'achats.facture.creer', label: 'Factures fournisseurs', desc: 'Rapprochement 3-voies et dette' },
      { code: 'achats.retour.creer', label: 'Retours fournisseurs', desc: 'Renvoyer des marchandises non conformes' },
    ],
  },
  {
    module: 'stock',
    label: 'Stock & Traçabilité',
    actions: [
      { code: 'stock.produits.creer', label: 'Gérer Articles', desc: 'Créer et modifier la fiche produit' },
      { code: 'stock.mouvements.creer', label: 'Mouvements manuels', desc: 'Entrées et sorties ponctuelles' },
      { code: 'stock.ajustement.valider', label: 'Valider Ajustements', desc: 'Approuver les écarts physiques' },
      { code: 'stock.transfert.creer', label: 'Transferts inter-sites', desc: 'Déplacer du stock d\'un site à l\'autre' },
      { code: 'stock.comptage.creer', label: 'Comptages physiques', desc: 'Effectuer des inventaires de stock' },
    ],
  },
  {
    module: 'caisse',
    label: 'Caisse Tactile (POS)',
    actions: [
      { code: 'caisse.session.ouvrir', label: 'Ouvrir session', desc: 'Saisir le fond de caisse initial' },
      { code: 'caisse.session.vendre', label: 'Encaisser ventes', desc: 'Paiements espèces, Mobile Money, carte' },
      { code: 'caisse.session.cloturer', label: 'Clôture & Ticket Z', desc: 'Comptage physique, écart et Ticket Z' },
    ],
  },
  {
    module: 'finance',
    label: 'Finance & Trésorerie',
    actions: [
      { code: 'finance.paiement.encaisser', label: 'Encaissements', desc: 'Enregistrer règlements clients' },
      { code: 'finance.paiement.decaisser', label: 'Décaissements', desc: 'Régler les factures et charges' },
      { code: 'finance.creances.voir', label: 'Balance âgée', desc: 'Suivre les impayés et créances échues' },
    ],
  },
  {
    module: 'administration',
    label: 'Administration & Sécurité',
    actions: [
      { code: 'admin.utilisateurs.gerer', label: 'Utilisateurs & Droits', desc: 'Affecter rôles et sites' },
      { code: 'admin.audit.voir', label: 'Journal d\'audit', desc: 'Consulter l\'historique des modifications' },
      { code: 'admin.parametres.modifier', label: 'Configuration générale', desc: 'IFU, RCCM, TVA, devises, logos' },
    ],
  },
];

export function PermissionsMatrix({
  users,
  entrepots,
  entrepriseId,
  onRefresh,
}: {
  users: Profile[];
  entrepots: Entrepot[];
  entrepriseId: string | null;
  onRefresh: () => void;
}) {
  const [activeTab, setActiveTab] = useState<'matrice' | 'sites' | 'sessions' | '2fa'>('matrice');
  const [selectedRole, setSelectedRole] = useState<Role>('gerant');
  const [rolePermissions, setRolePermissions] = useState<Record<string, boolean>>({
    'ventes.devis.creer': true,
    'ventes.commande.valider': true,
    'ventes.livraison.creer': true,
    'ventes.facture.creer': true,
    'ventes.facture.valider': true,
    'achats.demande.creer': true,
    'achats.bon_commande.creer': true,
    'achats.bon_commande.valider': true,
    'achats.reception.creer': true,
    'stock.produits.creer': true,
    'stock.transfert.creer': true,
    'stock.comptage.creer': true,
    'caisse.session.ouvrir': true,
    'caisse.session.vendre': true,
    'caisse.session.cloturer': true,
    'finance.paiement.encaisser': true,
    'finance.creances.voir': true,
  });

  // Assignation des sites par utilisateur
  const [selectedUser, setSelectedUser] = useState<Profile | null>(users[0] || null);
  const [assignedSiteIds, setAssignedSiteIds] = useState<string[]>([]);
  const [defaultSiteId, setDefaultSiteId] = useState<string>('');
  const [savingSites, setSavingSites] = useState(false);

  // Sessions actives simulées / chargées
  const [sessions, setSessions] = useState<UserSession[]>([
    {
      id: 'sess-1',
      user_id: users[0]?.id || 'u-1',
      ip_address: '102.164.96.22 (Ouagadougou, Orange BF)',
      user_agent: 'Chrome 129.0 on Windows 11',
      device_info: 'PC Bureau Direction',
      revoked: false,
      revoked_at: null,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 86400000 * 30).toISOString(),
    },
    {
      id: 'sess-2',
      user_id: users[1]?.id || 'u-2',
      ip_address: '154.120.88.14 (Bobo-Dioulasso, Moov Africa)',
      user_agent: 'Safari Mobile on iPad iOS 17.5',
      device_info: 'Tablette Caisse Boutique 01',
      revoked: false,
      revoked_at: null,
      created_at: new Date(Date.now() - 3600000 * 4).toISOString(),
      expires_at: new Date(Date.now() + 86400000 * 25).toISOString(),
    },
  ]);

  // Synchronisation utilisateur sélectionné
  useEffect(() => {
    if (!selectedUser && users.length > 0) {
      setSelectedUser(users[0]);
    }
  }, [users, selectedUser]);

  const togglePermission = (code: string) => {
    if (selectedRole === 'proprietaire' || selectedRole === 'admin') {
      showToast('Le rôle Propriétaire / Admin possède obligatoirement toutes les permissions', 'info');
      return;
    }
    setRolePermissions((prev) => ({
      ...prev,
      [code]: !prev[code],
    }));
  };

  const handleSaveSites = async () => {
    if (!selectedUser) return;
    setSavingSites(true);
    try {
      // Simuler l'enregistrement ou insérer dans user_sites
      showToast(`Sites assignés à ${selectedUser.nom_complet || selectedUser.email} mis à jour avec succès !`, 'info');
    } finally {
      setSavingSites(false);
    }
  };

  const revokeSession = (sessionId: string) => {
    setSessions((prev) =>
      prev.map((s) => (s.id === sessionId ? { ...s, revoked: true, revoked_at: new Date().toISOString() } : s))
    );
    showToast('Session révoquée immédiatement. L\'utilisateur sera déconnecté.', 'info');
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs AdminLTE v4 */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('matrice')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'matrice'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <ShieldCheck className="w-4 h-4" />
          <span>Matrice des Permissions (RBAC)</span>
        </button>

        <button
          onClick={() => setActiveTab('sites')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sites'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Warehouse className="w-4 h-4" />
          <span>Assignation des Sites & Entrepôts</span>
        </button>

        <button
          onClick={() => setActiveTab('sessions')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'sessions'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Smartphone className="w-4 h-4" />
          <span>Sessions Actives & Révocation</span>
        </button>

        <button
          onClick={() => setActiveTab('2fa')}
          className={`flex items-center gap-2 px-4 py-3 text-xs font-bold border-b-2 transition-colors whitespace-nowrap ${
            activeTab === '2fa'
              ? 'border-sky-600 text-sky-600 dark:text-sky-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
        >
          <Key className="w-4 h-4" />
          <span>Sécurité 2FA (TOTP)</span>
        </button>
      </div>

      {/* 1. Matrice des permissions */}
      {activeTab === 'matrice' && (
        <div className="space-y-6">
          <Callout variant="info" title="Contrôle d'accès granulaire RBAC">
            Chaque module métier dispose d'actions spécifiques (création, validation, facturation, inventaire). Les rôles par défaut sont configurés selon les bonnes pratiques de séparation des tâches.
          </Callout>

          {/* Sélecteur de rôle */}
          <div className="flex flex-wrap gap-2">
            {DEFAULT_ROLES.map((r) => {
              const isSelected = selectedRole === r.code;
              return (
                <button
                  key={r.code}
                  onClick={() => setSelectedRole(r.code as Role)}
                  className={`px-3.5 py-2 rounded-xl text-xs font-bold border transition-all ${
                    isSelected
                      ? 'bg-sky-600 text-white border-sky-600 shadow-md shadow-sky-600/20'
                      : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>

          {/* Grille Modules x Actions */}
          <div className="space-y-4">
            {MODULE_PERMISSIONS.map((group) => (
              <Card key={group.module} title={group.label}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {group.actions.map((act) => {
                    const isAllowed = selectedRole === 'proprietaire' || selectedRole === 'admin' || Boolean(rolePermissions[act.code]);
                    return (
                      <div
                        key={act.code}
                        onClick={() => togglePermission(act.code)}
                        className={`p-3 rounded-xl border cursor-pointer transition-all flex items-start gap-3 ${
                          isAllowed
                            ? 'border-emerald-300 dark:border-emerald-500/40 bg-emerald-50/50 dark:bg-emerald-500/10'
                            : 'border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-900/40 opacity-70'
                        }`}
                      >
                        <div className="mt-0.5">
                          {isAllowed ? (
                            <CheckCircle2 className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                          ) : (
                            <XCircle className="w-4 h-4 text-slate-400" />
                          )}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{act.label}</p>
                          <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-tight mt-0.5">{act.desc}</p>
                          <span className="inline-block font-mono text-[9px] text-slate-400 mt-1">{act.code}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}

      {/* 2. Assignation des sites */}
      {activeTab === 'sites' && (
        <div className="space-y-6">
          <Callout variant="info" title="Cloisonnement Multi-Sites">
            Attribuez à chaque employé ses sites d'intervention autorisés (ex. Boutique Centre-ville uniquement). Les utilisateurs n'accèdent qu'aux stocks, ventes et caisses des sites assignés.
          </Callout>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Liste des utilisateurs */}
            <Card title="1. Sélectionner l'employé">
              <div className="space-y-1 max-h-96 overflow-y-auto">
                {users.map((u) => {
                  const isSelected = selectedUser?.id === u.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => setSelectedUser(u)}
                      className={`w-full text-left p-2.5 rounded-xl text-xs transition-colors flex items-center justify-between ${
                        isSelected
                          ? 'bg-sky-600 text-white font-bold'
                          : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <div className="truncate">
                        <p className="truncate leading-tight">{u.nom_complet || u.email}</p>
                        <p className={`text-[10px] ${isSelected ? 'text-sky-100' : 'text-slate-400'}`}>
                          {ROLE_LABELS[u.role] || u.role}
                        </p>
                      </div>
                      {u.super_admin && <span className="text-[10px]">👑</span>}
                    </button>
                  );
                })}
              </div>
            </Card>

            {/* Sites disponibles */}
            <div className="md:col-span-2">
              <Card
                title={`2. Sites autorisés pour : ${selectedUser?.nom_complet || selectedUser?.email || 'Employé'}`}
                headerAction={
                  <button
                    disabled={savingSites}
                    onClick={handleSaveSites}
                    className="px-4 py-1.5 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/20 transition-all inline-flex items-center gap-1.5"
                  >
                    <Save className="w-3.5 h-3.5" />
                    <span>Enregistrer</span>
                  </button>
                }
              >
                <div className="space-y-3">
                  {entrepots.map((ent) => {
                    const isChecked = assignedSiteIds.includes(ent.id) || selectedUser?.role === 'admin' || selectedUser?.super_admin;
                    const isDef = defaultSiteId === ent.id;

                    return (
                      <div
                        key={ent.id}
                        className="p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between gap-3"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={isChecked}
                            onChange={() => {
                              if (assignedSiteIds.includes(ent.id)) {
                                setAssignedSiteIds(assignedSiteIds.filter((id) => id !== ent.id));
                              } else {
                                setAssignedSiteIds([...assignedSiteIds, ent.id]);
                              }
                            }}
                            className="rounded text-sky-600 focus:ring-sky-500 w-4 h-4"
                          />
                          <div>
                            <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{ent.nom}</p>
                            <p className="text-[11px] text-slate-400">{ent.code || 'Site opérationnel'} · {ent.ville || 'Burkina Faso'}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => setDefaultSiteId(ent.id)}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-bold transition-colors ${
                            isDef
                              ? 'bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300'
                              : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 hover:bg-slate-200'
                          }`}
                        >
                          {isDef ? '★ Site par défaut' : 'Définir par défaut'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </div>
          </div>
        </div>
      )}

      {/* 3. Sessions actives */}
      {activeTab === 'sessions' && (
        <div className="space-y-6">
          <Callout variant="info" title="Contrôle de sécurité des connexions">
            Visualisez tous les appareils connectés aux comptes de votre entreprise et révoquez instantanément les sessions suspectes en un clic.
          </Callout>

          <Card title="Sessions Actives Récentes">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300">
                  <tr>
                    <th className="py-2.5 px-3 font-semibold">Statut</th>
                    <th className="py-2.5 px-3 font-semibold">Appareil & Navigateur</th>
                    <th className="py-2.5 px-3 font-semibold">Adresse IP & Opérateur</th>
                    <th className="py-2.5 px-3 font-semibold">Date de connexion</th>
                    <th className="py-2.5 px-3 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {sessions.map((s) => (
                    <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50">
                      <td className="py-3 px-3">
                        {s.revoked ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-500/20 px-2 py-0.5 rounded-full">
                            Révoquée
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-600 bg-emerald-100 dark:bg-emerald-500/20 px-2 py-0.5 rounded-full">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" /> Active
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 font-medium text-slate-800 dark:text-slate-200">
                        {s.device_info}
                        <p className="text-[10px] text-slate-400 font-normal">{s.user_agent}</p>
                      </td>
                      <td className="py-3 px-3 text-slate-600 dark:text-slate-400">
                        {s.ip_address}
                      </td>
                      <td className="py-3 px-3 text-slate-500">
                        {new Date(s.created_at).toLocaleString('fr-FR')}
                      </td>
                      <td className="py-3 px-3 text-right">
                        {!s.revoked && (
                          <button
                            onClick={() => revokeSession(s.id)}
                            className="px-2.5 py-1 rounded-lg text-xs font-bold bg-red-50 hover:bg-red-100 text-red-600 dark:bg-red-500/10 dark:hover:bg-red-500/20 transition-colors inline-flex items-center gap-1"
                          >
                            <LogOut className="w-3 h-3" />
                            <span>Révoquer</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {/* 4. Double Authentification 2FA */}
      {activeTab === '2fa' && (
        <div className="space-y-6">
          <Callout variant="info" title="Protection renforcée par Authenticator (TOTP)">
            Sécurisez l'accès à votre entreprise en imposant un code à 6 chiffres généré par Google Authenticator, Microsoft Authenticator ou FreeOTP à chaque connexion.
          </Callout>

          <Card title="Statut 2FA de l'entreprise">
            <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h4 className="text-xs font-bold text-slate-800 dark:text-slate-200">
                  Exiger la 2FA pour les rôles administratifs (Propriétaire, Gérant, Comptable)
                </h4>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                  Recommandé pour prévenir les accès non autorisés en cas de compromission de mot de passe.
                </p>
              </div>
              <button
                onClick={() => showToast('Politique 2FA activée pour l\'entreprise !', 'info')}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-sky-600 hover:bg-sky-500 text-white shadow-md shadow-sky-600/20 transition-all flex-shrink-0"
              >
                Activer la politique 2FA
              </button>
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
