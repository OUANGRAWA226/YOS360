/*
# Sécurité : cloisonnement des comptes et des entreprises

Corrige quatre failles critiques relevées à l'audit des profils.

1. Inscription publique rattachée à la première entreprise
   - Avant : le trigger `profiles_fill_entreprise` rattachait tout nouveau compte
     à l'entreprise la plus ancienne (rôle vendeur). Un inconnu qui s'inscrivait
     voyait donc les données de ce client.
   - Après : un compte créé par inscription n'est rattaché à aucune entreprise et
     n'a aucun privilège. Un administrateur le rattache ensuite à SON entreprise
     avec la fonction `rattacher_utilisateur` ; le super administrateur peut tout faire.

2. Administrateurs d'entreprise devenus administrateurs de toute la plateforme
   - Avant : `is_admin()` valait « rôle = admin » sans regarder l'entreprise. L'admin
     d'un client pouvait lire tous les profils de la plateforme, modifier n'importe
     lequel (rôle, entreprise, super_admin), lire les clés API et webhooks des autres
     entreprises, et modifier n'importe quelle entreprise (modules, suspension).
   - Après :
     • `is_admin()` (accès inter-entreprises) est réservé au super administrateur ;
     • `is_tenant_admin()` = propriétaire ou administrateur actif de SON entreprise ;
     • profils et entreprises sont cloisonnés par entreprise ;
     • seul le super administrateur change `super_admin`, le rattachement d'un compte
       existant, les modules, le pack ou la suspension d'une entreprise ;
     • un administrateur ne change pas son propre rôle, et seul un propriétaire
       attribue ou retire le rôle Propriétaire.

3. Rôles refusés par la base
   - Avant : la contrainte n'acceptait que admin, gestionnaire, magasinier, vendeur.
   - Après : les 8 rôles de l'application sont acceptés.

   • le journal d'audit est cloisonné par entreprise (il était lisible en entier
     par tout administrateur dans le schéma d'installation complète).

4. Secret de double authentification lisible
   - Avant : `profiles.two_factor_secret`, lisible par quiconque pouvait lire le profil.
   - Après : déplacé dans `profils_secrets`, sans aucun accès depuis l'application
     (réservé aux fonctions serveur). `profiles.two_factor_enabled` reste en place.

À VÉRIFIER APRÈS APPLICATION (non automatisé, pour ne détacher personne par erreur) :
comptes rattachés à la première entreprise par l'ancien trigger, à contrôler un par un :

  SELECT p.email, p.role, p.created_at
  FROM public.profiles p
  WHERE p.entreprise_id = (SELECT id FROM public.entreprises ORDER BY created_at LIMIT 1)
  ORDER BY p.created_at DESC;

Un compte inconnu se détache par le super administrateur :
  UPDATE public.profiles SET entreprise_id = NULL, actif = false WHERE email = '...';

Idempotente : peut être rejouée sans effet de bord.
*/

-- =============================================================================
-- 0. FONCTIONS D'AIDE
-- =============================================================================

CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND super_admin = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Accès inter-entreprises : réservé au super administrateur de la plateforme.
-- Les politiques existantes « entreprise_id = current_entreprise_id() OR is_admin() »
-- (clés API, webhooks, compteurs de documents) deviennent ainsi cloisonnées.
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
  SELECT public.is_super_admin();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION public.current_entreprise_id()
RETURNS uuid AS $$
  SELECT entreprise_id FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- Propriétaire ou administrateur actif, rattaché à une entreprise
CREATE OR REPLACE FUNCTION public.is_tenant_admin()
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND role IN ('proprietaire', 'admin')
      AND actif = true
      AND entreprise_id IS NOT NULL
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

-- =============================================================================
-- 1. LES 8 RÔLES DE L'APPLICATION
-- =============================================================================

DO $$
DECLARE c record;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.profiles'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%role%'
  LOOP
    EXECUTE format('ALTER TABLE public.profiles DROP CONSTRAINT %I', c.conname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check CHECK (
  role IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'comptable', 'magasinier', 'caissier', 'vendeur')
);

-- =============================================================================
-- 2. INSCRIPTION : AUCUN RATTACHEMENT NI PRIVILÈGE AUTOMATIQUE
-- =============================================================================

DROP TRIGGER IF EXISTS trigger_profiles_fill_entreprise ON public.profiles;
DROP TRIGGER IF EXISTS trigger_first_admin ON public.profiles;

CREATE OR REPLACE FUNCTION public.profiles_before_insert()
RETURNS trigger AS $$
BEGIN
  -- Tout premier compte de la plateforme (installation neuve) : administrateur
  IF NOT EXISTS (SELECT 1 FROM public.profiles) THEN
    NEW.role := 'admin';
    RETURN NEW;
  END IF;

  -- Inscription (trigger d'auth.users) ou insertion par un utilisateur : compte neutre
  IF auth.uid() IS NULL OR NOT public.is_super_admin() THEN
    NEW.role := 'vendeur';
    NEW.super_admin := false;
    NEW.entreprise_id := NULL;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_profiles_before_insert ON public.profiles;
CREATE TRIGGER trg_profiles_before_insert
  BEFORE INSERT ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_before_insert();

-- =============================================================================
-- 3. PROFILS : RÈGLES D'ACCÈS CLOISONNÉES PAR ENTREPRISE
-- =============================================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles' LOOP
    EXECUTE format('DROP POLICY %I ON public.profiles', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Chacun voit son profil ; l'admin voit les comptes de son entreprise ; le super admin voit tout
CREATE POLICY "profiles_select" ON public.profiles FOR SELECT TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id())
  );

CREATE POLICY "profiles_insert_own" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (id = auth.uid() OR public.is_super_admin());

-- WITH CHECK empêche aussi un admin de déplacer un compte vers une autre entreprise
CREATE POLICY "profiles_update" ON public.profiles FOR UPDATE TO authenticated
  USING (
    id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id())
  )
  WITH CHECK (
    id = auth.uid()
    OR public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id())
  );

CREATE POLICY "profiles_delete" ON public.profiles FOR DELETE TO authenticated
  USING (
    public.is_super_admin()
    OR (public.is_tenant_admin() AND entreprise_id = public.current_entreprise_id() AND id <> auth.uid())
  );

-- Garde-fou sur les colonnes sensibles (s'applique en plus des règles ci-dessus)
CREATE OR REPLACE FUNCTION public.prevent_profile_privilege_escalation()
RETURNS trigger AS $$
DECLARE
  v_role text;
  v_entreprise uuid;
BEGIN
  -- Processus internes (sans utilisateur) et super administrateur : pas de restriction
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;

  IF NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
    RAISE EXCEPTION 'Seul le super administrateur peut modifier ce privilège.';
  END IF;

  -- Rattachement d'un nouveau compte : contrôlé par rattacher_utilisateur()
  IF COALESCE(current_setting('yos360.rattachement', true), '') = 'on' THEN
    RETURN NEW;
  END IF;

  IF NEW.entreprise_id IS DISTINCT FROM OLD.entreprise_id THEN
    RAISE EXCEPTION 'Le rattachement d''un compte à une entreprise ne peut pas être modifié ainsi.';
  END IF;

  IF NEW.role IS DISTINCT FROM OLD.role OR NEW.actif IS DISTINCT FROM OLD.actif THEN
    SELECT role, entreprise_id INTO v_role, v_entreprise FROM public.profiles WHERE id = auth.uid();
    IF NOT public.is_tenant_admin() OR OLD.entreprise_id IS DISTINCT FROM v_entreprise THEN
      RAISE EXCEPTION 'Seul un administrateur de l''entreprise peut modifier le rôle ou l''activation d''un compte.';
    END IF;
    IF NEW.id = auth.uid() THEN
      RAISE EXCEPTION 'Vous ne pouvez pas modifier votre propre rôle ni désactiver votre compte.';
    END IF;
    IF v_role <> 'proprietaire' AND (OLD.role = 'proprietaire' OR NEW.role = 'proprietaire') THEN
      RAISE EXCEPTION 'Seul un propriétaire peut attribuer ou retirer le rôle Propriétaire.';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_prevent_profile_escalation ON public.profiles;
CREATE TRIGGER trg_prevent_profile_escalation
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_privilege_escalation();

-- Rattacher un compte encore sans entreprise à l'entreprise de l'administrateur
CREATE OR REPLACE FUNCTION public.rattacher_utilisateur(p_user_id uuid, p_role text)
RETURNS void AS $$
DECLARE
  v_role text;
  v_entreprise uuid;
  v_cible public.profiles%ROWTYPE;
BEGIN
  IF NOT public.is_tenant_admin() THEN
    RAISE EXCEPTION 'Seul un administrateur d''entreprise peut rattacher un compte.';
  END IF;
  SELECT role, entreprise_id INTO v_role, v_entreprise FROM public.profiles WHERE id = auth.uid();

  SELECT * INTO v_cible FROM public.profiles WHERE id = p_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Compte introuvable.';
  END IF;
  IF v_cible.entreprise_id IS NOT NULL THEN
    RAISE EXCEPTION 'Ce compte est déjà rattaché à une entreprise.';
  END IF;
  IF v_cible.super_admin THEN
    RAISE EXCEPTION 'Ce compte ne peut pas être rattaché.';
  END IF;
  IF p_role NOT IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'comptable', 'magasinier', 'caissier', 'vendeur') THEN
    RAISE EXCEPTION 'Rôle inconnu : %', p_role;
  END IF;
  IF p_role = 'proprietaire' AND v_role <> 'proprietaire' THEN
    RAISE EXCEPTION 'Seul un propriétaire peut attribuer le rôle Propriétaire.';
  END IF;

  PERFORM set_config('yos360.rattachement', 'on', true);
  UPDATE public.profiles SET entreprise_id = v_entreprise, role = p_role WHERE id = p_user_id;
  PERFORM set_config('yos360.rattachement', 'off', true);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

REVOKE ALL ON FUNCTION public.rattacher_utilisateur(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rattacher_utilisateur(uuid, text) TO authenticated;

-- =============================================================================
-- 4. ENTREPRISES : CHACUN LA SIENNE, GOUVERNANCE AU SUPER ADMIN
-- =============================================================================

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'entreprises' LOOP
    EXECUTE format('DROP POLICY %I ON public.entreprises', pol.policyname);
  END LOOP;
END $$;

ALTER TABLE public.entreprises ENABLE ROW LEVEL SECURITY;

CREATE POLICY "entreprises_select" ON public.entreprises FOR SELECT TO authenticated
  USING (id = public.current_entreprise_id() OR public.is_super_admin());

CREATE POLICY "entreprises_insert" ON public.entreprises FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin());

CREATE POLICY "entreprises_update" ON public.entreprises FOR UPDATE TO authenticated
  USING (public.is_super_admin() OR (public.is_tenant_admin() AND id = public.current_entreprise_id()))
  WITH CHECK (public.is_super_admin() OR (public.is_tenant_admin() AND id = public.current_entreprise_id()));

CREATE POLICY "entreprises_delete" ON public.entreprises FOR DELETE TO authenticated
  USING (public.is_super_admin());

-- Modules, pack et suspension : décidés par le propriétaire du SaaS uniquement
CREATE OR REPLACE FUNCTION public.protect_entreprise_governance()
RETURNS trigger AS $$
BEGIN
  IF auth.uid() IS NULL OR public.is_super_admin() THEN
    RETURN NEW;
  END IF;
  IF NEW.modules IS DISTINCT FROM OLD.modules
     OR NEW.pack IS DISTINCT FROM OLD.pack
     OR NEW.suspendue IS DISTINCT FROM OLD.suspendue THEN
    RAISE EXCEPTION 'Les modules, le pack et la suspension sont gérés par l''éditeur de YOS360.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_protect_entreprise_governance ON public.entreprises;
CREATE TRIGGER trg_protect_entreprise_governance
  BEFORE UPDATE ON public.entreprises
  FOR EACH ROW EXECUTE FUNCTION public.protect_entreprise_governance();

-- =============================================================================
-- 5. JOURNAL D'AUDIT : CHAQUE ENTREPRISE LIT LE SIEN
-- =============================================================================
-- Le schéma d'installation complète n'a pas de colonne entreprise_id sur le journal
-- et le laissait lire en entier par tout administrateur.

ALTER TABLE public.journal_audit ADD COLUMN IF NOT EXISTS entreprise_id uuid REFERENCES public.entreprises(id);
ALTER TABLE public.journal_audit ALTER COLUMN entreprise_id SET DEFAULT public.current_entreprise_id();

-- Entrées existantes : entreprise de l'auteur de l'action
UPDATE public.journal_audit j
SET entreprise_id = p.entreprise_id
FROM public.profiles p
WHERE j.entreprise_id IS NULL AND p.id = j.user_id;

DO $$
DECLARE pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'journal_audit' AND cmd IN ('SELECT', 'ALL')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.journal_audit', pol.policyname);
  END LOOP;
END $$;

-- Mêmes rôles que la matrice de l'application (module audit : lecture)
CREATE POLICY "journal_audit_select" ON public.journal_audit FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      entreprise_id = public.current_entreprise_id()
      AND EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND actif = true
          AND role IN ('proprietaire', 'admin', 'gerant', 'gestionnaire', 'comptable')
      )
    )
  );

-- =============================================================================
-- 6. SECRET DE DOUBLE AUTHENTIFICATION HORS DU PROFIL
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.profils_secrets (
  profile_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  two_factor_secret text,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- RLS activée sans aucune politique et droits retirés : inaccessible depuis l'application
ALTER TABLE public.profils_secrets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.profils_secrets FROM anon, authenticated;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles' AND column_name = 'two_factor_secret'
  ) THEN
    EXECUTE $sql$
      INSERT INTO public.profils_secrets (profile_id, two_factor_secret)
      SELECT id, two_factor_secret FROM public.profiles WHERE two_factor_secret IS NOT NULL
      ON CONFLICT (profile_id) DO UPDATE SET two_factor_secret = EXCLUDED.two_factor_secret, updated_at = now()
    $sql$;
    ALTER TABLE public.profiles DROP COLUMN two_factor_secret;
  END IF;
END $$;
