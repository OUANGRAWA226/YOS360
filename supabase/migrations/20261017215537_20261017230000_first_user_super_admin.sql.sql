/*
# Le premier compte de la plateforme devient super administrateur

1. Contexte
- Vous êtes le propriétaire du SaaS : le premier compte créé (le vôtre) doit
  pouvoir voir et administrer toutes les entreprises clientes, pas seulement
  la vôtre.
- Le drapeau `super_admin` du profil n'était jamais positionné automatiquement.

2. Correctif
- Les comptes créés avant cette migration : le tout premier compte de la
  plateforme est promu super administrateur (aucun autre compte n'existe).
- Pour l'avenir : les nouveaux comptes restent de simples administrateurs de
  leur entreprise ; seul le propriétaire du SaaS (ou un super admin existant)
  peut élever quelqu'un manuellement.

3. Sécurité
- Aucune politique d'accès n'est modifiée ; migration ponctuelle et idempotente.
*/

UPDATE public.profiles
SET super_admin = true
WHERE id = (
  SELECT id FROM public.profiles
  ORDER BY created_at ASC
  LIMIT 1
)
AND NOT EXISTS (
  SELECT 1 FROM public.profiles WHERE super_admin = true
);
