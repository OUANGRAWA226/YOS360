-- ==============================================================================
-- MIGRATION PHASE 3 : FINANCE SYSCOHADA, ÉQUIPE & COMMISSIONS, FIDÉLITÉ CLIENT
-- YOS360 ERP — Système de Gestion d'Entreprise UEMOA (Burkina Faso / UEMOA)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS SUR LA TABLE CLIENTS (Fidélité & Paliers)
-- ------------------------------------------------------------------------------
ALTER TABLE clients 
ADD COLUMN IF NOT EXISTS points_fidelite INT NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS palier_fidelite TEXT NOT NULL DEFAULT 'bronze' CHECK (palier_fidelite IN ('bronze', 'argent', 'or', 'platine')),
ADD COLUMN IF NOT EXISTS total_depense_cumule NUMERIC NOT NULL DEFAULT 0,
ADD COLUMN IF NOT EXISTS date_dernier_achat TIMESTAMPTZ;

-- ------------------------------------------------------------------------------
-- 2. TRANSACTIONS DE FIDÉLITÉ CLIENTS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS fidelite_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
    commande_id UUID REFERENCES commandes(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('gain', 'utilisation', 'ajustement', 'bonus', 'expiration')),
    points INT NOT NULL,
    solde_apres INT NOT NULL,
    valeur_fcfa_equivalente NUMERIC DEFAULT 0,
    motif TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fidelite_client ON fidelite_transactions(client_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_fidelite_entreprise ON fidelite_transactions(entreprise_id);

-- ------------------------------------------------------------------------------
-- 3. PRÉ-COMPTABILITÉ SYSCOHADA RÉVISÉ (OHADA)
-- ------------------------------------------------------------------------------

-- Exercices comptables
CREATE TABLE IF NOT EXISTS compta_exercices (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    annee INT NOT NULL,
    libelle TEXT NOT NULL,
    date_debut DATE NOT NULL,
    date_fin DATE NOT NULL,
    statut TEXT NOT NULL DEFAULT 'ouvert' CHECK (statut IN ('ouvert', 'cloture')),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, annee)
);

-- Plan comptable général OHADA
CREATE TABLE IF NOT EXISTS compta_comptes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    numero TEXT NOT NULL,
    libelle TEXT NOT NULL,
    classe INT NOT NULL CHECK (classe BETWEEN 1 AND 8),
    type TEXT NOT NULL DEFAULT 'ordinaire' CHECK (type IN ('actif', 'passif', 'charge', 'produit', 'tresorerie', 'tiers', 'ordinaire')),
    lettrable BOOLEAN DEFAULT false,
    actif BOOLEAN DEFAULT true,
    parent_numero TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_compta_comptes_ent ON compta_comptes(entreprise_id, numero);

-- Journaux auxiliaires
CREATE TABLE IF NOT EXISTS compta_journaux (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    code TEXT NOT NULL, -- VE, AC, BQ, CA, MM, OD
    libelle TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('ventes', 'achats', 'banque', 'caisse', 'mobile_money', 'operations_diverses')),
    compte_contrepartie_defaut TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, code)
);

-- Pièces comptables (En-tête)
CREATE TABLE IF NOT EXISTS compta_pieces (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES entrepots(id) ON DELETE SET NULL,
    journal_id UUID NOT NULL REFERENCES compta_journaux(id) ON DELETE CASCADE,
    exercice_id UUID REFERENCES compta_exercices(id) ON DELETE SET NULL,
    numero_piece TEXT NOT NULL,
    date_piece DATE NOT NULL DEFAULT CURRENT_DATE,
    libelle TEXT NOT NULL,
    reference_document TEXT, -- ex: FAC-2026-0001
    origine_type TEXT, -- facture_vente, facture_achat, reglement_client, paiement_fournisseur, depense, manuel
    origine_id UUID,
    statut TEXT NOT NULL DEFAULT 'valide' CHECK (statut IN ('brouillon', 'valide', 'annule')),
    total_debit NUMERIC NOT NULL DEFAULT 0,
    total_credit NUMERIC NOT NULL DEFAULT 0,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compta_pieces_ent ON compta_pieces(entreprise_id, date_piece DESC);
CREATE INDEX IF NOT EXISTS idx_compta_pieces_journal ON compta_pieces(journal_id, date_piece DESC);

-- Écritures comptables (Double entrée lignes)
CREATE TABLE IF NOT EXISTS compta_ecritures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    piece_id UUID NOT NULL REFERENCES compta_pieces(id) ON DELETE CASCADE,
    compte_numero TEXT NOT NULL,
    compte_libelle TEXT NOT NULL,
    site_id UUID REFERENCES entrepots(id) ON DELETE SET NULL,
    debit NUMERIC NOT NULL DEFAULT 0 CHECK (debit >= 0),
    credit NUMERIC NOT NULL DEFAULT 0 CHECK (credit >= 0),
    libelle_ligne TEXT,
    lettrage TEXT,
    tiers_id UUID,
    tiers_nom TEXT,
    date_ecriture DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compta_ecritures_compte ON compta_ecritures(entreprise_id, compte_numero, date_ecriture);
CREATE INDEX IF NOT EXISTS idx_compta_ecritures_piece ON compta_ecritures(piece_id);

-- ------------------------------------------------------------------------------
-- 4. TRÉSORERIE & DÉPENSES D'EXPLOITATION
-- ------------------------------------------------------------------------------

-- Comptes de trésorerie (Banques, Caisses, Mobile Money)
CREATE TABLE IF NOT EXISTS tresorerie_comptes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES entrepots(id) ON DELETE SET NULL,
    nom TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('banque', 'caisse_physique', 'orange_money', 'moov_money', 'wave', 'autre')),
    numero_compte TEXT,
    etablissement TEXT,
    devise TEXT NOT NULL DEFAULT 'XOF',
    solde_initial NUMERIC NOT NULL DEFAULT 0,
    solde_actuel NUMERIC NOT NULL DEFAULT 0,
    compte_comptable_numero TEXT DEFAULT '521000',
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Mouvements de trésorerie
CREATE TABLE IF NOT EXISTS tresorerie_mouvements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES entrepots(id) ON DELETE SET NULL,
    compte_id UUID NOT NULL REFERENCES tresorerie_comptes(id) ON DELETE CASCADE,
    date_mouvement DATE NOT NULL DEFAULT CURRENT_DATE,
    type TEXT NOT NULL CHECK (type IN ('encaissement', 'decaissement', 'virement_interne')),
    montant NUMERIC NOT NULL CHECK (montant > 0),
    solde_avant NUMERIC DEFAULT 0,
    solde_apres NUMERIC DEFAULT 0,
    motif TEXT NOT NULL,
    tiers_nom TEXT,
    reference_operation TEXT,
    statut_rapprochement TEXT NOT NULL DEFAULT 'non_rapproche' CHECK (statut_rapprochement IN ('non_rapproche', 'rapproche', 'en_suspens')),
    date_rapprochement DATE,
    piece_jointe_url TEXT,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tresorerie_mvt_compte ON tresorerie_mouvements(compte_id, date_mouvement DESC);

-- Catégories de dépenses
CREATE TABLE IF NOT EXISTS depenses_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    nom TEXT NOT NULL,
    code_comptable TEXT NOT NULL DEFAULT '605000',
    budget_mensuel_max NUMERIC DEFAULT 0,
    couleur TEXT DEFAULT '#3b82f6',
    actif BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Dépenses d'exploitation
CREATE TABLE IF NOT EXISTS depenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES entrepots(id) ON DELETE SET NULL,
    categorie_id UUID NOT NULL REFERENCES depenses_categories(id) ON DELETE RESTRICT,
    compte_tresorerie_id UUID REFERENCES tresorerie_comptes(id) ON DELETE SET NULL,
    numero_depense TEXT NOT NULL,
    date_depense DATE NOT NULL DEFAULT CURRENT_DATE,
    montant NUMERIC NOT NULL CHECK (montant > 0),
    beneficiaire TEXT NOT NULL,
    motif TEXT NOT NULL,
    mode_reglement TEXT NOT NULL DEFAULT 'especes' CHECK (mode_reglement IN ('especes', 'orange_money', 'moov_money', 'wave', 'virement', 'cheque', 'autre')),
    numero_facture_fournisseur TEXT,
    justificatif_url TEXT,
    statut TEXT NOT NULL DEFAULT 'payee' CHECK (statut IN ('en_attente', 'validee', 'payee', 'rejetee')),
    piece_comptable_id UUID REFERENCES compta_pieces(id) ON DELETE SET NULL,
    created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_depenses_ent ON depenses(entreprise_id, date_depense DESC);

-- ------------------------------------------------------------------------------
-- 5. ÉQUIPE, COMMISSIONS & OBJECTIFS COMMERCIAUX
-- ------------------------------------------------------------------------------

-- Fiche collaborateur
CREATE TABLE IF NOT EXISTS equipe_collaborateurs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    site_id UUID REFERENCES entrepots(id) ON DELETE SET NULL,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    matricule TEXT NOT NULL,
    nom TEXT NOT NULL,
    prenom TEXT NOT NULL,
    poste TEXT NOT NULL,
    telephone TEXT,
    email TEXT,
    date_embauche DATE DEFAULT CURRENT_DATE,
    salaire_base NUMERIC DEFAULT 0,
    taux_commission_pct NUMERIC NOT NULL DEFAULT 2.0,
    base_calcul_commission TEXT NOT NULL DEFAULT 'ca_encaisse' CHECK (base_calcul_commission IN ('ca_encaisse', 'ca_facture', 'marge_brute')),
    statut TEXT NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'conge', 'suspendu', 'sorti')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, matricule)
);

CREATE INDEX IF NOT EXISTS idx_equipe_ent ON equipe_collaborateurs(entreprise_id);

-- Objectifs mensuels
CREATE TABLE IF NOT EXISTS equipe_objectifs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    collaborateur_id UUID NOT NULL REFERENCES equipe_collaborateurs(id) ON DELETE CASCADE,
    site_id UUID REFERENCES entrepots(id) ON DELETE SET NULL,
    periode TEXT NOT NULL, -- YYYY-MM
    objectif_ca NUMERIC NOT NULL DEFAULT 0,
    objectif_marge NUMERIC NOT NULL DEFAULT 0,
    realise_ca NUMERIC NOT NULL DEFAULT 0,
    realise_marge NUMERIC NOT NULL DEFAULT 0,
    prime_objectif NUMERIC DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, collaborateur_id, periode)
);

-- Commissions calculées et liquidées
CREATE TABLE IF NOT EXISTS equipe_commissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    collaborateur_id UUID NOT NULL REFERENCES equipe_collaborateurs(id) ON DELETE CASCADE,
    periode TEXT NOT NULL, -- YYYY-MM
    total_ventes_base NUMERIC NOT NULL DEFAULT 0,
    taux_applique NUMERIC NOT NULL DEFAULT 0,
    montant_commission NUMERIC NOT NULL DEFAULT 0,
    prime_bonus NUMERIC NOT NULL DEFAULT 0,
    retenues NUMERIC NOT NULL DEFAULT 0,
    net_a_payer NUMERIC NOT NULL DEFAULT 0,
    statut TEXT NOT NULL DEFAULT 'calcule' CHECK (statut IN ('calcule', 'valide', 'paye')),
    date_reglement DATE,
    mode_reglement TEXT,
    valide_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, collaborateur_id, periode)
);

-- ------------------------------------------------------------------------------
-- 6. SÉCURITÉ ROW LEVEL SECURITY (RLS) MULTI-TENANT STRICT
-- ------------------------------------------------------------------------------
ALTER TABLE fidelite_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE compta_exercices ENABLE ROW LEVEL SECURITY;
ALTER TABLE compta_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE compta_journaux ENABLE ROW LEVEL SECURITY;
ALTER TABLE compta_pieces ENABLE ROW LEVEL SECURITY;
ALTER TABLE compta_ecritures ENABLE ROW LEVEL SECURITY;
ALTER TABLE tresorerie_comptes ENABLE ROW LEVEL SECURITY;
ALTER TABLE tresorerie_mouvements ENABLE ROW LEVEL SECURITY;
ALTER TABLE depenses_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE depenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_collaborateurs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_objectifs ENABLE ROW LEVEL SECURITY;
ALTER TABLE equipe_commissions ENABLE ROW LEVEL SECURITY;

-- Helper macro politique multi-tenant
DO $$
DECLARE
    tbl TEXT;
    tbls TEXT[] := ARRAY[
        'fidelite_transactions',
        'compta_exercices',
        'compta_comptes',
        'compta_journaux',
        'compta_pieces',
        'compta_ecritures',
        'tresorerie_comptes',
        'tresorerie_mouvements',
        'depenses_categories',
        'depenses',
        'equipe_collaborateurs',
        'equipe_objectifs',
        'equipe_commissions'
    ];
BEGIN
    FOREACH tbl IN ARRAY tbls LOOP
        EXECUTE format('
            DROP POLICY IF EXISTS %I_tenant_isolation ON %I;
            CREATE POLICY %I_tenant_isolation ON %I
                FOR ALL
                USING (
                    public.is_super_admin()
                    OR entreprise_id IN (
                        SELECT p.entreprise_id FROM profiles p WHERE p.id = auth.uid()
                    )
                )
                WITH CHECK (
                    public.is_super_admin()
                    OR entreprise_id IN (
                        SELECT p.entreprise_id FROM profiles p WHERE p.id = auth.uid()
                    )
                );
        ', tbl, tbl, tbl, tbl);
    END LOOP;
END $$;

-- ------------------------------------------------------------------------------
-- 7. FONCTIONS MÉTIER PL/PGSQL
-- ------------------------------------------------------------------------------

-- 7.1 Initialisation du Plan Comptable SYSCOHADA Standard pour une Entreprise
CREATE OR REPLACE FUNCTION rpc_seed_syscohada_plan(p_entreprise_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Insertion des journaux auxiliaires de base
    INSERT INTO compta_journaux (entreprise_id, code, libelle, type, compte_contrepartie_defaut)
    VALUES
        (p_entreprise_id, 'VE', 'Journal des Ventes', 'ventes', '411100'),
        (p_entreprise_id, 'AC', 'Journal des Achats', 'achats', '401100'),
        (p_entreprise_id, 'BQ', 'Journal de Banque', 'banque', '521000'),
        (p_entreprise_id, 'CA', 'Journal de Caisse', 'caisse', '571000'),
        (p_entreprise_id, 'MM', 'Journal Mobile Money', 'mobile_money', '521100'),
        (p_entreprise_id, 'OD', 'Opérations Diverses', 'operations_diverses', NULL)
    ON CONFLICT (entreprise_id, code) DO NOTHING;

    -- Insertion de l'exercice en cours
    INSERT INTO compta_exercices (entreprise_id, annee, libelle, date_debut, date_fin, statut)
    VALUES
        (p_entreprise_id, EXTRACT(YEAR FROM CURRENT_DATE)::INT, 'Exercice ' || EXTRACT(YEAR FROM CURRENT_DATE), (EXTRACT(YEAR FROM CURRENT_DATE) || '-01-01')::DATE, (EXTRACT(YEAR FROM CURRENT_DATE) || '-12-31')::DATE, 'ouvert')
    ON CONFLICT (entreprise_id, annee) DO NOTHING;

    -- Insertion du Plan Comptable SYSCOHADA Révisé fondamental
    INSERT INTO compta_comptes (entreprise_id, numero, libelle, classe, type, lettrable)
    VALUES
        -- CLASSE 1 : COMPTES DE RESSOURCES DURABLES
        (p_entreprise_id, '101000', 'Capital social', 1, 'passif', false),
        (p_entreprise_id, '162000', 'Emprunts auprès des établissements de crédit', 1, 'passif', false),
        -- CLASSE 2 : COMPTES DE L''ACTIF IMMOBILISÉ
        (p_entreprise_id, '215000', 'Matériel industriel et outillage', 2, 'actif', false),
        (p_entreprise_id, '218000', 'Matériel de transport, informatique et mobilier', 2, 'actif', false),
        -- CLASSE 3 : COMPTES DE STOCKS
        (p_entreprise_id, '311000', 'Marchandises en magasin', 3, 'actif', false),
        (p_entreprise_id, '321000', 'Matières premières et consommables', 3, 'actif', false),
        -- CLASSE 4 : COMPTES DE TIERS
        (p_entreprise_id, '401100', 'Fournisseurs - Dettes en compte', 4, 'tiers', true),
        (p_entreprise_id, '411100', 'Clients - Créances ordinaires', 4, 'tiers', true),
        (p_entreprise_id, '422000', 'Personnel - Rémunérations dues', 4, 'tiers', true),
        (p_entreprise_id, '443100', 'État - TVA facturée sur ventes (18%)', 4, 'passif', false),
        (p_entreprise_id, '445100', 'État - TVA récupérable sur achats (18%)', 4, 'actif', false),
        (p_entreprise_id, '444100', 'État - Impôts et taxes exigibles', 4, 'passif', false),
        -- CLASSE 5 : COMPTES DE TRÉSORERIE
        (p_entreprise_id, '521000', 'Banques locales', 5, 'tresorerie', true),
        (p_entreprise_id, '521100', 'Orange Money Entreprise', 5, 'tresorerie', true),
        (p_entreprise_id, '521200', 'Moov Money (Flooz)', 5, 'tresorerie', true),
        (p_entreprise_id, '521300', 'Wave Money', 5, 'tresorerie', true),
        (p_entreprise_id, '571000', 'Caisse principale (Espèces)', 5, 'tresorerie', true),
        (p_entreprise_id, '585000', 'Virements internes de fonds', 5, 'tresorerie', false),
        -- CLASSE 6 : COMPTES DE CHARGES DES ACTIVITÉS ORDINAIRES
        (p_entreprise_id, '601000', 'Achats de marchandises', 6, 'charge', false),
        (p_entreprise_id, '605000', 'Achats de matières et fournitures', 6, 'charge', false),
        (p_entreprise_id, '610000', 'Transports de biens et déplacements', 6, 'charge', false),
        (p_entreprise_id, '620000', 'Services extérieurs (loyers, assurances, maintenance)', 6, 'charge', false),
        (p_entreprise_id, '630000', 'Autres services extérieurs (frais télécoms, pub)', 6, 'charge', false),
        (p_entreprise_id, '640000', 'Impôts, taxes et versements assimilés', 6, 'charge', false),
        (p_entreprise_id, '661000', 'Rémunérations directes du personnel', 6, 'charge', false),
        (p_entreprise_id, '664000', 'Commissions et gratifications versées', 6, 'charge', false),
        (p_entreprise_id, '671000', 'Frais financiers et agios bancaires', 6, 'charge', false),
        -- CLASSE 7 : COMPTES DE PRODUITS DES ACTIVITÉS ORDINAIRES
        (p_entreprise_id, '701000', 'Ventes de marchandises', 7, 'produit', false),
        (p_entreprise_id, '706000', 'Services vendus et prestations', 7, 'produit', false),
        (p_entreprise_id, '707000', 'Produits accessoires et prestations annexes', 7, 'produit', false)
    ON CONFLICT (entreprise_id, numero) DO NOTHING;

    -- Création des catégories de dépenses standard
    INSERT INTO depenses_categories (entreprise_id, nom, code_comptable, budget_mensuel_max, couleur)
    VALUES
        (p_entreprise_id, 'Loyer & Charges locatives', '620000', 500000, '#6366f1'),
        (p_entreprise_id, 'Électricité, Eau & Carburant', '605000', 300000, '#f59e0b'),
        (p_entreprise_id, 'Télécoms & Internet', '630000', 100000, '#06b6d4'),
        (p_entreprise_id, 'Frais de transport & Livraisons', '610000', 250000, '#10b981'),
        (p_entreprise_id, 'Fournitures de bureau & Emballages', '605000', 150000, '#8b5cf6'),
        (p_entreprise_id, 'Maintenance, Réparations & Entretien', '620000', 200000, '#ec4899')
    ON CONFLICT DO NOTHING;
END;
$$;

-- 7.2 Génération Automatique des Écritures de Vente (Double Entrée SYSCOHADA)
CREATE OR REPLACE FUNCTION rpc_generer_ecriture_vente(p_commande_id UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cmd RECORD;
    v_journal_id UUID;
    v_exercice_id UUID;
    v_piece_id UUID;
    v_client_nom TEXT;
    v_montant_ht NUMERIC;
    v_montant_tva NUMERIC;
    v_montant_ttc NUMERIC;
BEGIN
    SELECT c.*, cl.nom AS client_nom
    INTO v_cmd
    FROM commandes c
    LEFT JOIN clients cl ON cl.id = c.client_id
    WHERE c.id = p_commande_id;

    IF v_cmd IS NULL OR v_cmd.type <> 'vente' THEN
        RAISE EXCEPTION 'Commande de vente introuvable : %', p_commande_id;
    END IF;

    -- Trouver le journal des ventes
    SELECT id INTO v_journal_id FROM compta_journaux WHERE entreprise_id = v_cmd.entreprise_id AND code = 'VE' LIMIT 1;
    IF v_journal_id IS NULL THEN
        PERFORM rpc_seed_syscohada_plan(v_cmd.entreprise_id);
        SELECT id INTO v_journal_id FROM compta_journaux WHERE entreprise_id = v_cmd.entreprise_id AND code = 'VE' LIMIT 1;
    END IF;

    -- Trouver l'exercice
    SELECT id INTO v_exercice_id FROM compta_exercices WHERE entreprise_id = v_cmd.entreprise_id AND statut = 'ouvert' LIMIT 1;

    v_montant_ttc := COALESCE(v_cmd.total, 0);
    v_montant_tva := COALESCE(v_cmd.tva, 0);
    v_montant_ht  := v_montant_ttc - v_montant_tva;
    v_client_nom  := COALESCE(v_cmd.client_nom, 'Client Comptoir');

    -- Création de la pièce
    INSERT INTO compta_pieces (
        entreprise_id, site_id, journal_id, exercice_id,
        numero_piece, date_piece, libelle, reference_document,
        origine_type, origine_id, total_debit, total_credit
    ) VALUES (
        v_cmd.entreprise_id, v_cmd.entrepot_id, v_journal_id, v_exercice_id,
        'PC-VE-' || COALESCE(v_cmd.numero_document, v_cmd.reference, substring(p_commande_id::TEXT from 1 for 8)),
        CURRENT_DATE,
        'Facture client ' || COALESCE(v_cmd.numero_document, v_cmd.reference) || ' — ' || v_client_nom,
        v_cmd.numero_document,
        'facture_vente', p_commande_id,
        v_montant_ttc, v_montant_ttc
    ) RETURNING id INTO v_piece_id;

    -- LIGNE 1 : DÉBIT Compte Client 411100 (TTC)
    INSERT INTO compta_ecritures (
        entreprise_id, piece_id, compte_numero, compte_libelle,
        site_id, debit, credit, libelle_ligne, tiers_id, tiers_nom, date_ecriture
    ) VALUES (
        v_cmd.entreprise_id, v_piece_id, '411100', 'Clients - Créances ordinaires',
        v_cmd.entrepot_id, v_montant_ttc, 0,
        'Facture ' || COALESCE(v_cmd.numero_document, '') || ' — ' || v_client_nom,
        v_cmd.client_id, v_client_nom, CURRENT_DATE
    );

    -- LIGNE 2 : CRÉDIT Compte Ventes Marchandises 701000 (HT)
    INSERT INTO compta_ecritures (
        entreprise_id, piece_id, compte_numero, compte_libelle,
        site_id, debit, credit, libelle_ligne, tiers_id, tiers_nom, date_ecriture
    ) VALUES (
        v_cmd.entreprise_id, v_piece_id, '701000', 'Ventes de marchandises',
        v_cmd.entrepot_id, 0, v_montant_ht,
        'Vente HT — ' || v_client_nom,
        v_cmd.client_id, v_client_nom, CURRENT_DATE
    );

    -- LIGNE 3 : CRÉDIT Compte TVA Facturée 443100 (Si TVA > 0)
    IF v_montant_tva > 0 THEN
        INSERT INTO compta_ecritures (
            entreprise_id, piece_id, compte_numero, compte_libelle,
            site_id, debit, credit, libelle_ligne, tiers_id, tiers_nom, date_ecriture
        ) VALUES (
            v_cmd.entreprise_id, v_piece_id, '443100', 'État - TVA facturée sur ventes (18%)',
            v_cmd.entrepot_id, 0, v_montant_tva,
            'TVA 18% — ' || COALESCE(v_cmd.numero_document, ''),
            v_cmd.client_id, v_client_nom, CURRENT_DATE
        );
    END IF;

    RETURN v_piece_id;
END;
$$;

-- 7.3 Crédit & Calcul des Points de Fidélité
CREATE OR REPLACE FUNCTION rpc_crediter_points_fidelite(
    p_client_id UUID,
    p_montant NUMERIC,
    p_commande_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_client RECORD;
    v_points_gagnes INT;
    v_nouveau_solde INT;
    v_cumul NUMERIC;
    v_nouveau_palier TEXT;
BEGIN
    SELECT * INTO v_client FROM clients WHERE id = p_client_id;
    IF v_client IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Client non trouvé');
    END IF;

    -- Règle UEMOA : 1 point par tranche de 1 000 FCFA dépensée
    v_points_gagnes := FLOOR(p_montant / 1000)::INT;
    IF v_points_gagnes <= 0 THEN
        v_points_gagnes := 0;
    END IF;

    v_nouveau_solde := v_client.points_fidelite + v_points_gagnes;
    v_cumul := v_client.total_depense_cumule + p_montant;

    -- Calcul du palier de fidélité
    IF v_cumul >= 2000000 THEN
        v_nouveau_palier := 'platine';
    ELSIF v_cumul >= 500000 THEN
        v_nouveau_palier := 'or';
    ELSIF v_cumul >= 100000 THEN
        v_nouveau_palier := 'argent';
    ELSE
        v_nouveau_palier := 'bronze';
    END IF;

    -- Mise à jour du client
    UPDATE clients
    SET points_fidelite = v_nouveau_solde,
        total_depense_cumule = v_cumul,
        palier_fidelite = v_nouveau_palier,
        date_dernier_achat = now()
    WHERE id = p_client_id;

    -- Transaction de fidélité si points gagnés
    IF v_points_gagnes > 0 THEN
        INSERT INTO fidelite_transactions (
            entreprise_id, client_id, commande_id, type,
            points, solde_apres, valeur_fcfa_equivalente, motif
        ) VALUES (
            v_client.entreprise_id, p_client_id, p_commande_id, 'gain',
            v_points_gagnes, v_nouveau_solde, v_points_gagnes * 25, -- 1 point = 25 FCFA
            'Points acquis sur achat de ' || p_montant || ' FCFA'
        );
    END IF;

    RETURN jsonb_build_object(
        'success', true,
        'points_gagnes', v_points_gagnes,
        'nouveau_solde', v_nouveau_solde,
        'nouveau_palier', v_nouveau_palier,
        'total_depense_cumule', v_cumul
    );
END;
$$;

-- 7.4 Calcul des Commissions Vendeurs
CREATE OR REPLACE FUNCTION rpc_calculer_commissions_vendeur(
    p_collaborateur_id UUID,
    p_periode TEXT -- 'YYYY-MM'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_collab RECORD;
    v_total_ventes NUMERIC := 0;
    v_commission NUMERIC := 0;
    v_prime NUMERIC := 0;
    v_date_debut DATE;
    v_date_fin DATE;
BEGIN
    SELECT * INTO v_collab FROM equipe_collaborateurs WHERE id = p_collaborateur_id;
    IF v_collab IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Collaborateur non trouvé');
    END IF;

    v_date_debut := (p_periode || '-01')::DATE;
    v_date_fin := (v_date_debut + INTERVAL '1 month - 1 day')::DATE;

    -- Somme des ventes réalisées sur le site ou par l'utilisateur
    SELECT COALESCE(SUM(total), 0) INTO v_total_ventes
    FROM commandes
    WHERE entreprise_id = v_collab.entreprise_id
      AND type = 'vente'
      AND statut IN ('confirmee', 'expediee', 'recue')
      AND (
          (v_collab.user_id IS NOT NULL AND created_by = v_collab.user_id)
          OR (v_collab.site_id IS NOT NULL AND entrepot_id = v_collab.site_id)
      )
      AND created_at::DATE BETWEEN v_date_debut AND v_date_fin;

    v_commission := ROUND(v_total_ventes * (v_collab.taux_commission_pct / 100.0));

    -- Enregistrement ou mise à jour de la commission
    INSERT INTO equipe_commissions (
        entreprise_id, collaborateur_id, periode,
        total_ventes_base, taux_applique, montant_commission,
        prime_bonus, retenues, net_a_payer, statut
    ) VALUES (
        v_collab.entreprise_id, p_collaborateur_id, p_periode,
        v_total_ventes, v_collab.taux_commission_pct, v_commission,
        v_prime, 0, v_commission + v_prime, 'calcule'
    )
    ON CONFLICT (entreprise_id, collaborateur_id, periode)
    DO UPDATE SET
        total_ventes_base = EXCLUDED.total_ventes_base,
        taux_applique = EXCLUDED.taux_applique,
        montant_commission = EXCLUDED.montant_commission,
        net_a_payer = EXCLUDED.montant_commission + equipe_commissions.prime_bonus - equipe_commissions.retenues;

    RETURN jsonb_build_object(
        'success', true,
        'collaborateur_id', p_collaborateur_id,
        'periode', p_periode,
        'total_ventes', v_total_ventes,
        'taux_commission_pct', v_collab.taux_commission_pct,
        'montant_commission', v_commission
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 11. ACTIVATION DES NOUVEAUX MODULES SUR LES ENTREPRISES EXISTANTES
-- ------------------------------------------------------------------------------
UPDATE entreprises
SET modules = ARRAY(
    SELECT DISTINCT unnest(modules || ARRAY['comptabilite', 'tresorerie', 'equipe', 'lots', 'tarifs', 'validations'])
)
WHERE modules IS NOT NULL;

