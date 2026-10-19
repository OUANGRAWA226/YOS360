import { useState, useEffect, useRef } from 'react';
import { Upload, Download, FileSpreadsheet, FileText, Save, ShieldCheck, Users, UserCog, Trash2, Loader2, CheckCircle2, Building2, Image as ImageIcon, Sun, Moon, Monitor, Languages, Plus, X, UserPlus, ShieldAlert } from 'lucide-react';
import { useAuth, type Profile } from '@/lib/auth';
import { canManageUsers, ROLE_LABELS, type Role } from '@/lib/permissions';
import { supabase, type ProduitWithCategorie, type Categorie, type Fournisseur, type Client, type MouvementWithProduit, type CommandeWithRelations, type Entreprise } from '@/lib/supabase';
import { showToast } from '@/components/Toast';
import { exportCSV, exportExcel, exportJSON, exportPDF, parseCSV, readFileAsText } from '@/lib/io';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Integrations } from '@/components/Integrations';
import { ModulesParEntreprise } from '@/components/ModulesParEntreprise';
import { usePrefs, type ThemeMode } from '@/lib/prefs';

export function Parametres({
  entreprise,
  entreprises = [],
  onEntrepriseSaved,
  onRefreshEntreprises,
}: {
  entreprise: Entreprise | null;
  entreprises?: Entreprise[];
  onEntrepriseSaved: (e: Entreprise) => void;
  onRefreshEntreprises?: () => void;
}) {
  const { profile, refreshProfile } = useAuth();
  const { t, lang, setLang, theme, setTheme } = usePrefs();
  const isAdmin = canManageUsers(profile?.role ?? null);
  const [users, setUsers] = useState<Profile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleteUser, setDeleteUser] = useState<Profile | null>(null);
  const [showUserModal, setShowUserModal] = useState(false);
  const [creatingUser, setCreatingUser] = useState(false);
  const [newUserEmail, setNewUserEmail] = useState('');
  const [newUserPassword, setNewUserPassword] = useState('');
  const [newUserName, setNewUserName] = useState('');
  const [newUserRole, setNewUserRole] = useState<Role>('vendeur');
  const [newUserEntrepriseId, setNewUserEntrepriseId] = useState(entreprise?.id ?? '');
  const [isNewUserSuperAdmin, setIsNewUserSuperAdmin] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const logoRef = useRef<HTMLInputElement>(null);

  const [ent, setEnt] = useState<Partial<Entreprise>>({
    nom: entreprise?.nom ?? '',
    slogan: entreprise?.slogan ?? '',
    adresse: entreprise?.adresse ?? '',
    ville: entreprise?.ville ?? '',
    telephone: entreprise?.telephone ?? '',
    email: entreprise?.email ?? '',
    logo_url: entreprise?.logo_url ?? null,
    tva_taux: entreprise?.tva_taux ?? 18,
    tva_active: entreprise?.tva_active ?? true,
    devise: entreprise?.devise ?? 'XOF',
    mention_bas: entreprise?.mention_bas ?? '',
  });
  useEffect(() => {
    if (entreprise) setEnt({ ...entreprise });
  }, [entreprise]);

  const saveEntreprise = async () => {
    if (!ent.nom?.trim()) { showToast('Le nom de l\u2019entreprise est requis', 'error'); return; }
    if (!entreprise) { showToast('Aucune entreprise active', 'error'); return; }
    setBusy('entreprise');
    const row = {
      nom: ent.nom.trim(),
      slogan: ent.slogan?.trim() || null,
      adresse: ent.adresse?.trim() || null,
      ville: ent.ville?.trim() || null,
      telephone: ent.telephone?.trim() || null,
      email: ent.email?.trim() || null,
      logo_url: ent.logo_url || null,
      tva_taux: Number(ent.tva_taux) || 0,
      tva_active: ent.tva_active !== false,
      devise: ent.devise || 'XOF',
      mention_bas: ent.mention_bas?.trim() || null,
    };
    const { data, error } = await supabase.from('entreprises').update(row).eq('id', entreprise.id).select().single();
    setBusy(null);
    if (error) { showToast('Échec de l\u2019enregistrement : ' + error.message, 'error'); return; }
    showToast('Paramètres de l\u2019entreprise enregistrés');
    onEntrepriseSaved(data as Entreprise);
  };

  const handleLogo = (f: File) => {
    if (f.size > 500 * 1024) { showToast('Logo trop lourd (max 500 Ko)', 'error'); return; }
    const reader = new FileReader();
    reader.onload = () => setEnt((e) => ({ ...e, logo_url: reader.result as string }));
    reader.readAsDataURL(f);
  };

  const loadUsers = async () => {
    if (!isAdmin) return;
    const { data } = await supabase.from('profiles').select('*').order('created_at');
    setUsers((data as Profile[]) ?? []);
  };

  useEffect(() => {
    if (isAdmin) loadUsers();
  }, [isAdmin]);

  // ---------- Export ----------
  const fetchAll = async () => {
    const [produits, categories, fournisseurs, clients, mouvements, commandes] = await Promise.all([
      supabase.from('produits').select('*, categories(nom)'),
      supabase.from('categories').select('*'),
      supabase.from('fournisseurs').select('*'),
      supabase.from('clients').select('*'),
      supabase.from('mouvements').select('*, produits(nom, sku)'),
      supabase.from('commandes').select('*, fournisseurs(nom), clients(nom), commande_items(*, produits(nom))'),
    ]);
    return {
      produits: (produits.data ?? []) as ProduitWithCategorie[],
      categories: (categories.data ?? []) as Categorie[],
      fournisseurs: (fournisseurs.data ?? []) as Fournisseur[],
      clients: (clients.data ?? []) as Client[],
      mouvements: (mouvements.data ?? []) as MouvementWithProduit[],
      commandes: (commandes.data ?? []) as CommandeWithRelations[],
    };
  };

  const doExportProduits = async (fmt: 'csv' | 'excel' | 'pdf') => {
    setBusy('export');
    const { produits } = await fetchAll();
    const columns = [
      { key: 'nom', label: 'Nom' }, { key: 'sku', label: 'SKU' },
      { key: 'categorie', label: 'Catégorie' }, { key: 'quantite', label: 'Quantité' },
      { key: 'unite', label: 'Unité' }, { key: 'seuil_alerte', label: 'Seuil' },
      { key: 'prix_unitaire', label: 'Prix achat' }, { key: 'prix_vente', label: 'Prix vente' },
      { key: 'emplacement', label: 'Emplacement' },
    ];
    const rows = produits.map((p) => ({
      nom: p.nom, sku: p.sku ?? '', categorie: p.categories?.nom ?? '', quantite: p.quantite,
      unite: p.unite, seuil_alerte: p.seuil_alerte, prix_unitaire: p.prix_unitaire,
      prix_vente: p.prix_vente, emplacement: p.emplacement ?? '',
    }));
    if (fmt === 'csv') exportCSV(rows, columns, 'produits');
    else if (fmt === 'excel') exportExcel(rows, columns, 'produits');
    else exportPDF('Liste des produits', rows, columns);
    setBusy(null);
    showToast('Export des produits terminé');
  };

  const doExportStock = async (fmt: 'csv' | 'excel' | 'pdf') => {
    setBusy('export');
    const { mouvements } = await fetchAll();
    const columns = [
      { key: 'date', label: 'Date' }, { key: 'produit', label: 'Produit' },
      { key: 'type', label: 'Type' }, { key: 'quantite', label: 'Quantité' },
      { key: 'motif', label: 'Motif' }, { key: 'reference', label: 'Référence' },
    ];
    const rows = mouvements.map((m) => ({
      date: new Date(m.created_at).toLocaleString('fr-FR'), produit: m.produits?.nom ?? '',
      type: m.type === 'entree' ? 'Entrée' : 'Sortie', quantite: m.quantite,
      motif: m.motif ?? '', reference: m.reference ?? '',
    }));
    if (fmt === 'csv') exportCSV(rows, columns, 'mouvements');
    else if (fmt === 'excel') exportExcel(rows, columns, 'mouvements');
    else exportPDF('Mouvements de stock', rows, columns);
    setBusy(null);
    showToast('Export des mouvements terminé');
  };

  const doBackup = async () => {
    setBusy('backup');
    const all = await fetchAll();
    exportJSON({ version: 1, date: new Date().toISOString(), ...all }, `sauvegarde-yos360-${new Date().toISOString().slice(0, 10)}`);
    setBusy(null);
    showToast('Sauvegarde complète téléchargée');
  };

  // ---------- Import produits ----------
  const [importResult, setImportResult] = useState<{ ok: number; failed: number; errors: string[] } | null>(null);

  const handleImport = async (file: File) => {
    setBusy('import');
    setImportResult(null);
    try {
      const text = await readFileAsText(file);
      const rows = parseCSV(text);
      if (rows.length === 0) {
        showToast('Fichier vide ou illisible', 'error');
        setBusy(null);
        return;
      }

      // Expected headers (flexible): nom/name, sku/reference, quantite/stock, prix_unitaire/prixAchat...
      const errors: string[] = [];
      let ok = 0;
      const { data: cats } = await supabase.from('categories').select('id, nom');
      const catMap = new Map((cats ?? []).map((c) => [c.nom.toLowerCase(), c.id]));

      for (const [i, r] of rows.entries()) {
        const nom = r['nom'] ?? r['name'] ?? r['Nom'] ?? '';
        if (!nom) { errors.push(`Ligne ${i + 2}: nom manquant`); continue; }
        const catNom = (r['categorie'] ?? r['category'] ?? '').toLowerCase();
        const payload: Record<string, unknown> = {
          nom,
          sku: r['sku'] ?? r['reference'] ?? null,
          quantite: parseInt(r['quantite'] ?? r['stock'] ?? '0') || 0,
          seuil_alerte: parseInt(r['seuil'] ?? r['seuil_alerte'] ?? '10') || 10,
          prix_unitaire: parseFloat((r['prix_unitaire'] ?? r['prix_achat'] ?? '0').replace(',', '.')) || 0,
          prix_vente: parseFloat((r['prix_vente'] ?? r['prix'] ?? '0').replace(',', '.')) || 0,
          unite: r['unite'] ?? 'pièce',
          emplacement: r['emplacement'] ?? null,
        };
        if (catNom && catMap.has(catNom)) payload.categorie_id = catMap.get(catNom);

        const { error } = await supabase.from('produits').insert(payload);
        if (error) errors.push(`Ligne ${i + 2} (${nom}): ${error.message}`);
        else ok++;
      }
      setImportResult({ ok, failed: errors.length, errors });
      if (ok > 0) showToast(`${ok} produit(s) importé(s)`);
      if (errors.length > 0) showToast(`${errors.length} ligne(s) en échec — voir le détail`, 'error');
    } catch {
      showToast('Impossible de lire le fichier', 'error');
    }
    setBusy(null);
  };

  // ---------- Gestion utilisateurs (admin) ----------
  const changeRole = async (user: Profile, role: Role) => {
    const { error } = await supabase.from('profiles').update({ role }).eq('id', user.id);
    if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
    showToast(`Rôle de ${user.email} mis à jour`);
    loadUsers();
    refreshProfile();
  };

  const changeUserEntreprise = async (user: Profile, newEntId: string) => {
    const { error } = await supabase.from('profiles').update({ entreprise_id: newEntId }).eq('id', user.id);
    if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
    showToast(`Rattachement de ${user.email} mis à jour`);
    loadUsers();
  };

  const toggleActive = async (user: Profile) => {
    const { error } = await supabase.from('profiles').update({ actif: !user.actif }).eq('id', user.id);
    if (error) { showToast('Erreur: ' + error.message, 'error'); return; }
    showToast(user.actif ? 'Compte désactivé' : 'Compte activé');
    loadUsers();
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newUserEmail.trim() || !newUserPassword) {
      showToast('Email et mot de passe requis', 'error');
      return;
    }
    if (newUserPassword.length < 6) {
      showToast('Le mot de passe doit contenir au moins 6 caractères', 'error');
      return;
    }
    setCreatingUser(true);
    const { data, error } = await supabase.auth.signUp({
      email: newUserEmail.trim(),
      password: newUserPassword,
      options: {
        data: {
          nom_complet: newUserName.trim() || null,
        },
      },
    });

    if (error) {
      setCreatingUser(false);
      showToast('Erreur création: ' + error.message, 'error');
      return;
    }

    if (data.user) {
      const targetEntId = newUserEntrepriseId || entreprise?.id;
      await supabase.from('profiles').update({
        role: newUserRole,
        entreprise_id: targetEntId,
        super_admin: isNewUserSuperAdmin,
        nom_complet: newUserName.trim() || null,
      }).eq('id', data.user.id);
    }

    setCreatingUser(false);
    showToast(`Compte créé pour ${newUserEmail} !`);
    setShowUserModal(false);
    setNewUserEmail('');
    setNewUserPassword('');
    setNewUserName('');
    setIsNewUserSuperAdmin(false);
    loadUsers();
  };

  const confirmDeleteUser = async () => {
    if (!deleteUser) return;
    if (deleteUser.id === profile?.id) { showToast('Vous ne pouvez pas supprimer votre propre compte', 'error'); return; }
    // On désactive plutôt que de supprimer (les données d'audit doivent être conservées)
    await toggleActive(deleteUser);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 dark:text-slate-100 tracking-tight">Paramètres</h1>
        <p className="text-slate-500 dark:text-slate-400 mt-1">Import, export, sauvegarde et gestion des utilisateurs</p>
      </div>

      {/* Import / Export */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Download className="w-5 h-5 text-sky-600" /> Exports</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-slate-500 mb-2">Produits</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => doExportProduits('csv')} disabled={busy === 'export'} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"><FileText className="w-4 h-4" /> CSV</button>
                <button onClick={() => doExportProduits('excel')} disabled={busy === 'export'} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
                <button onClick={() => doExportProduits('pdf')} disabled={busy === 'export'} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors disabled:opacity-50"><Save className="w-4 h-4" /> PDF</button>
              </div>
            </div>
            <div>
              <p className="text-sm text-slate-500 mb-2">Mouvements de stock</p>
              <div className="flex flex-wrap gap-2">
                <button onClick={() => doExportStock('csv')} disabled={busy === 'export'} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors disabled:opacity-50"><FileText className="w-4 h-4" /> CSV</button>
                <button onClick={() => doExportStock('excel')} disabled={busy === 'export'} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-700 transition-colors disabled:opacity-50"><FileSpreadsheet className="w-4 h-4" /> Excel</button>
                <button onClick={() => doExportStock('pdf')} disabled={busy === 'export'} className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-lg bg-red-50 hover:bg-red-100 text-red-700 transition-colors disabled:opacity-50"><Save className="w-4 h-4" /> PDF</button>
              </div>
            </div>
            <div className="pt-3 border-t border-slate-100">
              <p className="text-sm text-slate-500 mb-2">Sauvegarde complète (JSON)</p>
              <button onClick={doBackup} disabled={busy === 'backup'} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-slate-800 rounded-xl hover:bg-slate-900 transition-colors disabled:opacity-50">
                {busy === 'backup' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                Télécharger la sauvegarde
              </button>
              <p className="text-xs text-slate-400 mt-2">Produits, catégories, fournisseurs, clients, mouvements et commandes dans un seul fichier.</p>
            </div>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Upload className="w-5 h-5 text-emerald-600" /> Import de produits (CSV)</h3>
          <p className="text-sm text-slate-500 mb-3">
            Colonnes attendues : <code className="text-xs bg-slate-100 px-1 py-0.5 rounded">nom; sku; categorie; quantite; seuil; prix_unitaire; prix_vente; unite; emplacement</code>.
            Seule la colonne « nom » est obligatoire. Séparateur point-virgule ou virgule.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleImport(f);
              e.target.value = '';
            }}
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={busy === 'import'}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-emerald-600 rounded-xl hover:bg-emerald-700 transition-colors disabled:opacity-50"
          >
            {busy === 'import' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
            Choisir un fichier CSV
          </button>

          {importResult && (
            <div className="mt-4 rounded-xl border border-slate-200 p-4 text-sm">
              <div className="flex items-center gap-4 mb-2">
                <span className="inline-flex items-center gap-1.5 text-emerald-700 font-medium"><CheckCircle2 className="w-4 h-4" /> {importResult.ok} importé(s)</span>
                {importResult.failed > 0 && <span className="text-red-600 font-medium">{importResult.failed} en échec</span>}
              </div>
              {importResult.errors.length > 0 && (
                <div className="max-h-32 overflow-y-auto text-xs text-red-600 space-y-1">
                  {importResult.errors.map((e, i) => <div key={i}>{e}</div>)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Préférences: langue & thème */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
        <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2 mb-4"><Languages className="w-5 h-5 text-sky-600 dark:text-sky-400" /> {t('pref.title')}</h3>
        <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t('pref.subtitle')}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('pref.language')}</label>
            <div className="flex gap-2">
              {(['fr', 'en'] as const).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  className={`px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    lang === l
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  {l === 'fr' ? 'Français' : 'English'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">{t('pref.theme')}</label>
            <div className="flex gap-2">
              {(
                [
                  { value: 'light' as ThemeMode, icon: Sun, label: t('pref.light') },
                  { value: 'dark' as ThemeMode, icon: Moon, label: t('pref.dark') },
                  { value: 'system' as ThemeMode, icon: Monitor, label: t('pref.system') },
                ]
              ).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setTheme(value)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-medium border transition-colors ${
                    theme === value
                      ? 'bg-sky-600 text-white border-sky-600'
                      : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700'
                  }`}
                >
                  <Icon className="w-4 h-4" /> {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Entreprise (facturation) — admin seulement */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <h3 className="font-semibold text-slate-900 flex items-center gap-2 mb-4"><Building2 className="w-5 h-5 text-sky-600" /> Entreprise & facturation</h3>
          <p className="text-sm text-slate-500 mb-4">Ces informations apparaissent en en-tête de vos devis, factures, bons de livraison et avoirs imprimés.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Nom de l'entreprise *</label>
              <input value={ent.nom ?? ''} onChange={(e) => setEnt({ ...ent, nom: e.target.value })} placeholder="Ex: StockMarket CI" className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Slogan</label>
              <input value={ent.slogan ?? ''} onChange={(e) => setEnt({ ...ent, slogan: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Téléphone</label>
              <input value={ent.telephone ?? ''} onChange={(e) => setEnt({ ...ent, telephone: e.target.value })} placeholder="+225 ..." className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Adresse</label>
              <input value={ent.adresse ?? ''} onChange={(e) => setEnt({ ...ent, adresse: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Ville</label>
              <input value={ent.ville ?? ''} onChange={(e) => setEnt({ ...ent, ville: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
              <input type="email" value={ent.email ?? ''} onChange={(e) => setEnt({ ...ent, email: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Taux de TVA (%)</label>
              <input type="number" min={0} max={100} step={0.5} value={ent.tva_taux ?? 18} onChange={(e) => setEnt({ ...ent, tva_taux: Number(e.target.value) })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500" />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">TVA</label>
              <label className="flex items-center gap-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={ent.tva_active !== false} onChange={(e) => setEnt({ ...ent, tva_active: e.target.checked })} className="w-4 h-4 accent-sky-600" />
                Appliquer la TVA sur les documents
              </label>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Devise</label>
              <select value={ent.devise ?? 'XOF'} onChange={(e) => setEnt({ ...ent, devise: e.target.value })} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white">
                <option value="XOF">FCFA (XOF)</option>
                <option value="EUR">Euro (EUR)</option>
                <option value="USD">Dollar (USD)</option>
                <option value="GHS">Cedi (GHS)</option>
                <option value="NGN">Naira (NGN)</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Logo (pied d'en-tête des documents)</label>
              <div className="flex items-center gap-3">
                {ent.logo_url ? (
                  <img src={ent.logo_url} alt="Logo" className="h-12 w-12 rounded-lg object-contain border border-slate-200 bg-white" />
                ) : (
                  <span className="h-12 w-12 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400"><ImageIcon className="w-5 h-5" /></span>
                )}
                <input ref={logoRef} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) handleLogo(f); e.target.value = ''; }} />
                <button onClick={() => logoRef.current?.click()} className="px-3 py-2 text-sm font-medium rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">Choisir un logo</button>
                {ent.logo_url && <button onClick={() => setEnt({ ...ent, logo_url: null })} className="text-xs text-red-600 hover:underline">Retirer</button>}
              </div>
              <p className="text-xs text-slate-400 mt-1">PNG ou JPG, 500 Ko max.</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">Mentions légales en pied de document</label>
              <textarea value={ent.mention_bas ?? ''} onChange={(e) => setEnt({ ...ent, mention_bas: e.target.value })} rows={3} placeholder="Ex: TVA incluse le cas échéant. Pénalité de retard de 1% par mois..." className="w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 resize-none" />
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <button onClick={saveEntreprise} disabled={busy === 'entreprise'} className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-sky-600 rounded-xl hover:bg-sky-700 transition-colors disabled:opacity-50">
              {busy === 'entreprise' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              Enregistrer
            </button>
          </div>
        </div>
      )}

      {/* Gestion des utilisateurs (admin seulement) */}
      {isAdmin && (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                <Users className="w-5 h-5 text-violet-600 dark:text-violet-400" /> Gestion des utilisateurs & permissions
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Attribuez les rôles métier et rattachez chaque utilisateur à son entreprise cliente en temps réel.
              </p>
            </div>
            <button
              onClick={() => setShowUserModal(true)}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-semibold rounded-xl bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-500/20 transition-all flex-shrink-0"
            >
              <UserPlus className="w-4 h-4" /> Nouvel utilisateur
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800">
                  <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-400">Utilisateur</th>
                  <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-400">Entreprise</th>
                  <th className="text-left py-2 font-semibold text-slate-600 dark:text-slate-400">Rôle</th>
                  <th className="text-center py-2 font-semibold text-slate-600 dark:text-slate-400">Statut</th>
                  <th className="text-right py-2 font-semibold text-slate-600 dark:text-slate-400">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {users.map((u) => (
                  <tr key={u.id}>
                    <td className="py-3">
                      <div className="flex items-center gap-2">
                        <UserCog className="w-4 h-4 text-slate-400" />
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-slate-900 dark:text-slate-100">{u.nom_complet || u.email}</p>
                            {u.super_admin && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-500/20 dark:text-amber-300">
                                Super Admin
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-3">
                      {profile?.super_admin ? (
                        <select
                          value={u.entreprise_id ?? ''}
                          onChange={(e) => changeUserEntreprise(u, e.target.value)}
                          className="px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-medium focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200"
                        >
                          <option value="">(Non rattaché)</option>
                          {entreprises.map((e) => (
                            <option key={e.id} value={e.id}>{e.nom}</option>
                          ))}
                        </select>
                      ) : (
                        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                          {entreprises.find((e) => e.id === u.entreprise_id)?.nom ?? 'Entreprise active'}
                        </span>
                      )}
                    </td>
                    <td className="py-3">
                      <select
                        value={u.role}
                        onChange={(e) => changeRole(u, e.target.value as Role)}
                        disabled={u.id === profile?.id}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-sky-500 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 disabled:opacity-50"
                      >
                        {(Object.keys(ROLE_LABELS) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                      </select>
                    </td>
                    <td className="py-3 text-center">
                      <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${u.actif ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300' : 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300'}`}>
                        <ShieldCheck className="w-3 h-3" /> {u.actif ? 'Actif' : 'Désactivé'}
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => toggleActive(u)}
                        disabled={u.id === profile?.id}
                        className="text-xs font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 px-2"
                      >
                        {u.actif ? 'Désactiver' : 'Réactiver'}
                      </button>
                      {u.id !== profile?.id && (
                        <button onClick={() => setDeleteUser(u)} className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-500/10 text-slate-400 hover:text-red-600 transition-colors" title="Désactiver ce compte">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {users.length === 0 && (
                  <tr><td colSpan={5} className="py-6 text-center text-slate-400 text-sm">Aucun utilisateur</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-xs text-slate-400 mt-3">
            Les comptes désactivés conservent leur historique d'audit mais ne peuvent plus se connecter.
          </p>
        </div>
      )}

      {/* Modules par entreprise (admin) */}
      <ModulesParEntreprise
        entreprise={entreprise}
        entreprises={entreprises}
        onEntrepriseSaved={onEntrepriseSaved}
        onEntrepriseCreated={onRefreshEntreprises}
      />

      {/* API & Intégrations */}
      <Integrations />

      <ConfirmDialog
        open={!!deleteUser}
        onClose={() => setDeleteUser(null)}
        onConfirm={confirmDeleteUser}
        title="Désactiver le compte"
        message={`Le compte ${deleteUser?.email} ne pourra plus se connecter. Son historique d'audit est conservé.`}
        confirmLabel="Désactiver"
      />

      {/* Modal Création Utilisateur */}
      {showUserModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl max-w-lg w-full p-6 sm:p-7 relative">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-violet-500/10 dark:bg-violet-500/20 flex items-center justify-center text-violet-600 dark:text-violet-400">
                  <UserPlus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">Créer un utilisateur</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Ajoutez un collaborateur ou un gérant sans code</p>
                </div>
              </div>
              <button
                onClick={() => setShowUserModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateUser} className="space-y-4 pt-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Nom complet
                </label>
                <input
                  type="text"
                  placeholder="Ex: Amadou Traoré"
                  value={newUserName}
                  onChange={(e) => setNewUserName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Adresse Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="collaborateur@yos360.com"
                  value={newUserEmail}
                  onChange={(e) => setNewUserEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                  Mot de passe provisoire * (min 6 caractères)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  placeholder="••••••••"
                  value={newUserPassword}
                  onChange={(e) => setNewUserPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Entreprise
                  </label>
                  <select
                    value={newUserEntrepriseId}
                    onChange={(e) => setNewUserEntrepriseId(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {entreprises.map((e) => (
                      <option key={e.id} value={e.id}>{e.nom}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1.5">
                    Rôle attribué
                  </label>
                  <select
                    value={newUserRole}
                    onChange={(e) => setNewUserRole(e.target.value as Role)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    {(Object.keys(ROLE_LABELS) as Role[]).map((r) => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {profile?.super_admin && (
                <div className="pt-2">
                  <label className="flex items-center gap-2.5 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isNewUserSuperAdmin}
                      onChange={(e) => setIsNewUserSuperAdmin(e.target.checked)}
                      className="w-4 h-4 rounded text-violet-600 focus:ring-violet-500 border-slate-300"
                    />
                    <span className="font-medium text-amber-600 dark:text-amber-400">Accorder les privilèges Super Admin (vision globale)</span>
                  </label>
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowUserModal(false)}
                  className="px-4 py-2.5 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
                >
                  Annuler
                </button>
                <button
                  type="submit"
                  disabled={creatingUser}
                  className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-violet-600 hover:bg-violet-700 rounded-xl shadow-md shadow-violet-500/20 transition-all disabled:opacity-50"
                >
                  {creatingUser && <Loader2 className="w-4 h-4 animate-spin" />}
                  Créer l'utilisateur
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
