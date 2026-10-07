// Categories pouvant porter des familles (decision utilisateur : matiere premiere + emballage).
export const FAMILY_CATEGORY_CODES = ['MATIERE_PREMIERE', 'EMBALLAGE'] as const;

export function isFamilyCategory(category?: { code?: string } | null): boolean {
  return (
    !!category?.code &&
    (FAMILY_CATEGORY_CODES as readonly string[]).includes(category.code)
  );
}