-- ==============================================================================
-- MIGRATION PHASE 4 : ÉTATS FINANCIERS SYSCOHADA, FACTURE NORMALISÉE UEMOA & CLÔTURE
-- YOS360 ERP — Zone UEMOA (Burkina Faso / OHADA)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS SUR COMMANDES ET FACTURES (Traçabilité & e-Facture Normalisée DGI)
-- ------------------------------------------------------------------------------
ALTER TABLE commandes 
ADD COLUMN IF NOT EXISTS hash_facture TEXT,
ADD COLUMN IF NOT EXISTS hash_precedent TEXT,
ADD COLUMN IF NOT EXISTS signature_dgi TEXT,
ADD COLUMN IF NOT EXISTS qr_code_fiscal_data TEXT;

-- Ajout sur ventes_factures si la table existe
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'ventes_factures') THEN
        ALTER TABLE ventes_factures 
        ADD COLUMN IF NOT EXISTS hash_facture TEXT,
        ADD COLUMN IF NOT EXISTS hash_precedent TEXT,
        ADD COLUMN IF NOT EXISTS signature_dgi TEXT,
        ADD COLUMN IF NOT EXISTS qr_code_fiscal_data TEXT;
    END IF;
END $$;

-- ------------------------------------------------------------------------------
-- 2. TABLE DES CLÔTURES D'EXERCICE COMPTABLE (Piste d'Audit Fiable - PAF)
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS compta_clotures (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entreprise_id UUID NOT NULL REFERENCES entreprises(id) ON DELETE CASCADE,
    exercice_id UUID NOT NULL REFERENCES compta_exercices(id) ON DELETE CASCADE,
    annee INT NOT NULL,
    date_cloture TIMESTAMPTZ NOT NULL DEFAULT now(),
    cloture_par UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    total_debit NUMERIC NOT NULL,
    total_credit NUMERIC NOT NULL,
    total_produits NUMERIC NOT NULL DEFAULT 0,
    total_charges NUMERIC NOT NULL DEFAULT 0,
    resultat_net NUMERIC NOT NULL DEFAULT 0,
    sens_resultat TEXT NOT NULL CHECK (sens_resultat IN ('benefice', 'perte', 'equilibre')),
    piece_cloture_id UUID REFERENCES compta_pieces(id) ON DELETE SET NULL,
    piece_a_nouveaux_id UUID REFERENCES compta_pieces(id) ON DELETE SET NULL,
    exercice_suivant_id UUID REFERENCES compta_exercices(id) ON DELETE SET NULL,
    paf_hash_archive TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(entreprise_id, exercice_id)
);

CREATE INDEX IF NOT EXISTS idx_compta_clotures_ent ON compta_clotures(entreprise_id, annee);

ALTER TABLE compta_clotures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS compta_clotures_tenant_isolation ON compta_clotures;
CREATE POLICY compta_clotures_tenant_isolation ON compta_clotures
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

-- ------------------------------------------------------------------------------
-- 3. FONCTIONS PL/PGSQL POUR LA FACTURATION NORMALISÉE UEMOA (e-Sintax / DGI)
-- ------------------------------------------------------------------------------

-- 3.1 Génération et Scellement Cryptographique de la Facture
CREATE OR REPLACE FUNCTION rpc_sceller_facture_normalisee(p_commande_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_cmd RECORD;
    v_ent RECORD;
    v_last_hash TEXT;
    v_raw_content TEXT;
    v_current_hash TEXT;
    v_sig TEXT;
    v_qr_payload TEXT;
BEGIN
    SELECT c.*, cl.ifu AS client_ifu, cl.nom AS client_nom
    INTO v_cmd
    FROM commandes c
    LEFT JOIN clients cl ON cl.id = c.client_id
    WHERE c.id = p_commande_id;

    IF v_cmd IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Facture introuvable');
    END IF;

    SELECT * INTO v_ent FROM entreprises WHERE id = v_cmd.entreprise_id;

    -- Trouver le hash de la dernière facture validée de l'entreprise (chaînage inviolable)
    SELECT hash_facture INTO v_last_hash
    FROM commandes
    WHERE entreprise_id = v_cmd.entreprise_id
      AND hash_facture IS NOT NULL
      AND id <> p_commande_id
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_last_hash IS NULL THEN
        v_last_hash := 'GENESIS-BLOCK-' || v_cmd.entreprise_id;
    END IF;

    -- Chaîne normalisée à signer
    v_raw_content := COALESCE(v_last_hash, '') || '|' ||
                     v_cmd.entreprise_id || '|' ||
                     COALESCE(v_ent.ifu, '00000000') || '|' ||
                     COALESCE(v_cmd.numero_document, v_cmd.reference) || '|' ||
                     v_cmd.created_at::TEXT || '|' ||
                     COALESCE(v_cmd.montant_ht, v_cmd.total)::TEXT || '|' ||
                     COALESCE(v_cmd.tva, 0)::TEXT || '|' ||
                     COALESCE(v_cmd.total, 0)::TEXT;

    -- Calcul du Hash SHA-256
    v_current_hash := encode(digest(v_raw_content, 'sha256'), 'hex');
    v_sig := upper(substring(v_current_hash from 1 for 16));

    -- Format de la charge utile QR Code conforme DGI / e-Sintax UEMOA
    -- Format standard : EMETTEUR_IFU*NUM_FACT*DATE*HT*TVA*TTC*CLIENT_IFU*SIGNATURE
    v_qr_payload := format(
        'FISC-BF*IFU:%s*FAC:%s*DT:%s*HT:%s*TVA:%s*TTC:%s*CIFU:%s*SIG:%s',
        COALESCE(v_ent.ifu, 'SANS_IFU'),
        COALESCE(v_cmd.numero_document, v_cmd.reference),
        to_char(COALESCE(v_cmd.date_commande, CURRENT_DATE), 'YYYY-MM-DD'),
        ROUND(COALESCE(v_cmd.montant_ht, v_cmd.total, 0)),
        ROUND(COALESCE(v_cmd.tva, 0)),
        ROUND(COALESCE(v_cmd.total, 0)),
        COALESCE(v_cmd.client_ifu, 'COMPTOIR'),
        v_sig
    );

    -- Mise à jour de la facture
    UPDATE commandes
    SET hash_facture = v_current_hash,
        hash_precedent = v_last_hash,
        signature_dgi = v_sig,
        qr_code_fiscal_data = v_qr_payload
    WHERE id = p_commande_id;

    RETURN jsonb_build_object(
        'success', true,
        'hash_facture', v_current_hash,
        'hash_precedent', v_last_hash,
        'signature_dgi', v_sig,
        'qr_code_fiscal_data', v_qr_payload
    );
END;
$$;

-- ------------------------------------------------------------------------------
-- 4. PROCÉDURE DE CLÔTURE D'EXERCICE COMPTABLE & GÉNÉRATION DES À-NOUVEAUX
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION rpc_cloturer_exercice_comptable(
    p_entreprise_id UUID,
    p_exercice_id UUID,
    p_user_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_exo RECORD;
    v_next_exo_id UUID;
    v_next_annee INT;
    v_journal_od_id UUID;
    v_piece_cloture_id UUID;
    v_piece_anouveaux_id UUID;
    v_tot_debit NUMERIC := 0;
    v_tot_credit NUMERIC := 0;
    v_tot_produits NUMERIC := 0; -- Classe 7
    v_tot_charges NUMERIC := 0;  -- Classe 6
    v_resultat_net NUMERIC := 0;
    v_sens TEXT;
    v_cloture_id UUID;
    v_paf_hash TEXT;
    r RECORD;
BEGIN
    SELECT * INTO v_exo
    FROM compta_exercices
    WHERE id = p_exercice_id AND entreprise_id = p_entreprise_id;

    IF v_exo IS NULL THEN
        RETURN jsonb_build_object('success', false, 'error', 'Exercice comptable introuvable');
    END IF;

    IF v_exo.statut = 'cloture' THEN
        RETURN jsonb_build_object('success', false, 'error', 'Cet exercice est déjà clôturé');
    END IF;

    -- Trouver le journal des OD
    SELECT id INTO v_journal_od_id
    FROM compta_journaux
    WHERE entreprise_id = p_entreprise_id AND code = 'OD'
    LIMIT 1;

    IF v_journal_od_id IS NULL THEN
        RAISE EXCEPTION 'Journal des Opérations Diverses (OD) manquant';
    END IF;

    -- Calculer les totaux de l'exercice
    SELECT
        COALESCE(SUM(e.debit), 0),
        COALESCE(SUM(e.credit), 0)
    INTO v_tot_debit, v_tot_credit
    FROM compta_ecritures e
    JOIN compta_pieces p ON p.id = e.piece_id
    WHERE e.entreprise_id = p_entreprise_id
      AND p.exercice_id = p_exercice_id
      AND p.statut = 'valide';

    IF v_tot_debit <> v_tot_credit THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', format('Balance déséquilibrée ! Débit = %s, Crédit = %s. Écart : %s FCFA', v_tot_debit, v_tot_credit, (v_tot_debit - v_tot_credit))
        );
    END IF;

    -- Total Charges (Classe 6)
    SELECT COALESCE(SUM(e.debit - e.credit), 0) INTO v_tot_charges
    FROM compta_ecritures e
    JOIN compta_pieces p ON p.id = e.piece_id
    WHERE e.entreprise_id = p_entreprise_id
      AND p.exercice_id = p_exercice_id
      AND e.compte_numero LIKE '6%'
      AND p.statut = 'valide';

    -- Total Produits (Classe 7)
    SELECT COALESCE(SUM(e.credit - e.debit), 0) INTO v_tot_produits
    FROM compta_ecritures e
    JOIN compta_pieces p ON p.id = e.piece_id
    WHERE e.entreprise_id = p_entreprise_id
      AND p.exercice_id = p_exercice_id
      AND e.compte_numero LIKE '7%'
      AND p.statut = 'valide';

    v_resultat_net := v_tot_produits - v_tot_charges;

    IF v_resultat_net > 0 THEN
        v_sens := 'benefice';
    ELSIF v_resultat_net < 0 THEN
        v_sens := 'perte';
    ELSE
        v_sens := 'equilibre';
    END IF;

    -- 1. Pièce de Clôture des Comptes de Gestion (Soldage Classes 6 et 7)
    INSERT INTO compta_pieces (
        entreprise_id, journal_id, exercice_id,
        numero_piece, date_piece, libelle, reference_document,
        origine_type, total_debit, total_credit, statut, created_by
    ) VALUES (
        p_entreprise_id, v_journal_od_id, p_exercice_id,
        'PC-CLOT-' || v_exo.annee, v_exo.date_fin,
        'Clôture des comptes de gestion — Exercice ' || v_exo.annee,
        'CLOTURE-' || v_exo.annee, 'cloture_exercice',
        GREATEST(v_tot_charges, v_tot_produits), GREATEST(v_tot_charges, v_tot_produits),
        'valide', p_user_id
    ) RETURNING id INTO v_piece_cloture_id;

    -- Enregistrement du Résultat Net de l'exercice au Bilan
    IF v_sens = 'benefice' THEN
        -- Crédit 131000 Résultat net : Bénéfice
        INSERT INTO compta_ecritures (
            entreprise_id, piece_id, compte_numero, compte_libelle,
            debit, credit, libelle_ligne, date_ecriture
        ) VALUES (
            p_entreprise_id, v_piece_cloture_id, '131000', 'Résultat net de l''exercice (Bénéfice)',
            0, v_resultat_net, 'Affectation Résultat Bénéficiaire ' || v_exo.annee, v_exo.date_fin
        );
    ELSIF v_sens = 'perte' THEN
        -- Débit 139000 Résultat net : Perte
        INSERT INTO compta_ecritures (
            entreprise_id, piece_id, compte_numero, compte_libelle,
            debit, credit, libelle_ligne, date_ecriture
        ) VALUES (
            p_entreprise_id, v_piece_cloture_id, '139000', 'Résultat net de l''exercice (Perte)',
            ABS(v_resultat_net), 0, 'Affectation Résultat Déficitaire ' || v_exo.annee, v_exo.date_fin
        );
    END IF;

    -- 2. Création ou ouverture de l'exercice suivant (N+1)
    v_next_annee := v_exo.annee + 1;
    SELECT id INTO v_next_exo_id
    FROM compta_exercices
    WHERE entreprise_id = p_entreprise_id AND annee = v_next_annee;

    IF v_next_exo_id IS NULL THEN
        INSERT INTO compta_exercices (
            entreprise_id, annee, libelle, date_debut, date_fin, statut
        ) VALUES (
            p_entreprise_id, v_next_annee, 'Exercice ' || v_next_annee,
            (v_next_annee || '-01-01')::DATE, (v_next_annee || '-12-31')::DATE, 'ouvert'
        ) RETURNING id INTO v_next_exo_id;
    END IF;

    -- 3. Génération de la Pièce d'À-Nouveaux (Bilan d'Ouverture N+1 pour classes 1 à 5)
    INSERT INTO compta_pieces (
        entreprise_id, journal_id, exercice_id,
        numero_piece, date_piece, libelle, reference_document,
        origine_type, total_debit, total_credit, statut, created_by
    ) VALUES (
        p_entreprise_id, v_journal_od_id, v_next_exo_id,
        'PC-AN-' || v_next_annee, (v_next_annee || '-01-01')::DATE,
        'À-Nouveaux (Bilan d''Ouverture) — Exercice ' || v_next_annee,
        'ANOUVEAUX-' || v_next_annee, 'a_nouveaux',
        0, 0, 'valide', p_user_id
    ) RETURNING id INTO v_piece_anouveaux_id;

    -- Report des soldes de bilan (Classes 1 à 5)
    FOR r IN
        SELECT
            e.compte_numero,
            MAX(e.compte_libelle) AS compte_libelle,
            SUM(e.debit) - SUM(e.credit) AS solde
        FROM compta_ecritures e
        JOIN compta_pieces p ON p.id = e.piece_id
        WHERE e.entreprise_id = p_entreprise_id
          AND p.exercice_id = p_exercice_id
          AND substring(e.compte_numero from 1 for 1) IN ('1', '2', '3', '4', '5')
          AND p.statut = 'valide'
        GROUP BY e.compte_numero
        HAVING (SUM(e.debit) - SUM(e.credit)) <> 0
    LOOP
        IF r.solde > 0 THEN
            INSERT INTO compta_ecritures (
                entreprise_id, piece_id, compte_numero, compte_libelle,
                debit, credit, libelle_ligne, date_ecriture
            ) VALUES (
                p_entreprise_id, v_piece_anouveaux_id, r.compte_numero, r.compte_libelle,
                r.solde, 0, 'À-Nouveaux ' || r.compte_numero, (v_next_annee || '-01-01')::DATE
            );
        ELSE
            INSERT INTO compta_ecritures (
                entreprise_id, piece_id, compte_numero, compte_libelle,
                debit, credit, libelle_ligne, date_ecriture
            ) VALUES (
                p_entreprise_id, v_piece_anouveaux_id, r.compte_numero, r.compte_libelle,
                0, ABS(r.solde), 'À-Nouveaux ' || r.compte_numero, (v_next_annee || '-01-01')::DATE
            );
        END IF;
    END LOOP;

    -- Mettre à jour les totaux de la pièce d'À-Nouveaux
    UPDATE compta_pieces
    SET total_debit = (SELECT COALESCE(SUM(debit), 0) FROM compta_ecritures WHERE piece_id = v_piece_anouveaux_id),
        total_credit = (SELECT COALESCE(SUM(credit), 0) FROM compta_ecritures WHERE piece_id = v_piece_anouveaux_id)
    WHERE id = v_piece_anouveaux_id;

    -- 4. Verrouiller définitivement l'exercice clos
    UPDATE compta_exercices
    SET statut = 'cloture'
    WHERE id = p_exercice_id;

    -- 5. Calculer le Hash PAF (Piste d'Audit Fiable)
    v_paf_hash := encode(digest(
        p_entreprise_id::TEXT || '|' || p_exercice_id::TEXT || '|' ||
        v_exo.annee::TEXT || '|' || v_tot_debit::TEXT || '|' ||
        v_resultat_net::TEXT || '|' || now()::TEXT,
        'sha256'
    ), 'hex');

    -- 6. Consigner la clôture
    INSERT INTO compta_clotures (
        entreprise_id, exercice_id, annee, date_cloture, cloture_par,
        total_debit, total_credit, total_produits, total_charges,
        resultat_net, sens_resultat, piece_cloture_id, piece_a_nouveaux_id,
        exercice_suivant_id, paf_hash_archive, notes
    ) VALUES (
        p_entreprise_id, p_exercice_id, v_exo.annee, now(), p_user_id,
        v_tot_debit, v_tot_credit, v_tot_produits, v_tot_charges,
        v_resultat_net, v_sens, v_piece_cloture_id, v_piece_anouveaux_id,
        v_next_exo_id, v_paf_hash,
        format('Clôture officielle arrêtée au résultat net de %s FCFA (%s)', v_resultat_net, v_sens)
    ) RETURNING id INTO v_cloture_id;

    RETURN jsonb_build_object(
        'success', true,
        'cloture_id', v_cloture_id,
        'annee', v_exo.annee,
        'total_produits', v_tot_produits,
        'total_charges', v_tot_charges,
        'resultat_net', v_resultat_net,
        'sens_resultat', v_sens,
        'paf_hash', v_paf_hash,
        'exercice_suivant_id', v_next_exo_id,
        'annee_suivante', v_next_annee
    );
END;
$$;
