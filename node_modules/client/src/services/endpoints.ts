import { request, requestPaged } from './api';
import type {
  Article,
  ArticleDetailStock,
  AuditLog,
  Bon,
  BonType,
  Category,
  DashboardAlerts,
  Depot,
  Family,
  Inventory,
  InventoryDecision,
  InventoryDetail,
  Kpis,
  Loan,
  LoanType,
  Lot,
  LotFlag,
  Movement,
  Origin,
  Packaging,
  Paged,
  Partner,
  Reservation,
  ReservationAvailability,
  RestitutionType,
  Setting,
  StockByCategoryRow,
  StockRow,
  StorageLocation,
  ThresholdRow,
  Unit,
  User,
  ValuationResult,
  Permission,
  RoleCode,
} from '../types';

export interface SessionUser {
  id: number;
  login: string;
  displayName: string | null;
  role: RoleCode;
  roleLabel: string;
  /** Droits reellement accordes, calcules par le serveur (D16). */
  permissions: Permission[];
}

export interface LoginResponse {
  token: string;
  user: SessionUser;
}

export const authApi = {
  login: (login: string, password: string) =>
    request<LoginResponse>('/auth/login', { method: 'POST', body: { login, password } }),
  me: () => request<SessionUser>('/auth/me'),
};

export const dashboardApi = {
  kpis: () => request<Kpis>('/dashboard/kpis'),
  alerts: () => request<DashboardAlerts>('/dashboard/alerts'),
  lotsFlags: () => request<{ counts: Record<string, number>; lots: LotFlag[] }>('/dashboard/lots-flags'),
  stockByCategory: () => request<StockByCategoryRow[]>('/dashboard/stock-by-category'),
};

export interface ArticleFilters {
  search?: string;
  categoryId?: number;
  familyId?: number;
  statut?: string;
  /** demandes uniquement par articlesApi.listPaged ; absent = catalogue complet. */
  limit?: number;
  offset?: number;
}

export interface ArticlePayload {
  designation: string;
  designation2?: string | null;
  fabricant?: string | null;
  emploiGd?: string;
  categoryId: number;
  familyId?: number | null;
  application?: string | null;
  unitId: number;
  packagingId?: number | null;
  sourceAchat?: string | null;
  originId?: number | null;
  periode?: string | null;
  frequence?: number | null;
  statut?: string;
  unitPrice?: number | null;
  currency?: string;
  isLotTracked?: boolean;
}

export const articlesApi = {
  /** Catalogue complet : utilise par les listes deroulantes des autres ecrans. */
  list: (filters: ArticleFilters = {}) => request<Article[]>('/articles', { query: { ...filters } }),
  /** Page de 75 lignes + total reel : utilise par la page Article. */
  listPaged: (filters: ArticleFilters = {}): Promise<Paged<Article>> =>
    requestPaged<Article>('/articles', { query: { ...filters } }),
  get: (id: number) => request<Article>(`/articles/${id}`),
  create: (payload: ArticlePayload) => request<Article>('/articles', { method: 'POST', body: payload }),
  update: (id: number, payload: Partial<ArticlePayload>) =>
    request<Article>(`/articles/${id}`, { method: 'PUT', body: payload }),
  setPrice: (id: number, unitPrice: number, currency?: string) =>
    request<Article>(`/articles/${id}/price`, { method: 'PUT', body: { unitPrice, currency } }),
  remove: (id: number) => request<Article>(`/articles/${id}`, { method: 'DELETE' }),
  consumption: (id: number) =>
    request<{ months: number; cMax: number; avg: number; breakdown: Record<string, number> }>(
      `/articles/${id}/consumption`,
    ),
};

export const stockApi = {
  rows: (filters: { group?: string; depotId?: number; articleId?: number; categoryId?: number; familyId?: number; search?: string } = {}) =>
    request<StockRow[]>('/stock', { query: { ...filters } }),
  thresholds: (filters: { articleId?: number; depotId?: number } = {}) =>
    request<ThresholdRow[]>('/stock/thresholds', { query: { ...filters } }),
  article: (id: number) => request<ArticleDetailStock>(`/stock/article/${id}`),
  depots: () => request<Depot[]>('/stock/depots'),
  locations: () => request<StorageLocation[]>('/stock/locations'),
  categories: () => request<Category[]>('/stock/categories'),
};

export interface MovementPayload {
  type: string;
  articleId: number;
  quantity: number;
  movementDate: string;
  depotId: number;
  locationId?: number | null;
  depotDestId?: number | null;
  locationDestId?: number | null;
  lotId?: number | null;
  partnerId?: number | null;
  docNumber?: string | null;
  unitPrice?: number | null;
  currency?: string;
  observation?: string | null;
  /** D20 : jeton signe renvoye apres confirmation d'un empietement de reservation. */
  confirmToken?: string | null;
}

export const movementsApi = {
  list: (filters: { articleId?: number; depotId?: number; lotId?: number; type?: string; from?: string; to?: string; limit?: number; offset?: number } = {}): Promise<Paged<Movement>> =>
    requestPaged<Movement>('/movements', { query: { ...filters } }),
  create: (payload: MovementPayload) => request<Movement | { sortie: Movement; entree: Movement }>('/movements', { method: 'POST', body: payload }),
  // F3 : l'annulation retire du stock (annuler une ENTREE, ou la moitie SORTIE d'un
  // TRANSFERT), elle est donc soumise au meme controle d'empietement D20 que la
  // creation et la reactivation : le jeton signe fait partie de l'appel.
  cancel: (id: string, confirmToken?: string | null) =>
    request<Movement>(`/movements/${id}/cancel`, { method: 'PATCH', body: { confirmToken: confirmToken ?? null } }),
  // D20 : reactiver un mouvement qui retire du stock peut mordre dans une reservation.
  // Le serveur refuse (409) et renvoie un jeton signe ; on le rejoue avec l'identite
  // du mouvement si l'utilisateur a accepte l'amputation.
  reactivate: (id: string, confirmToken?: string | null) =>
    request<Movement>(`/movements/${id}/reactivate`, { method: 'PATCH', body: { confirmToken: confirmToken ?? null } }),
  remove: (id: string) => request<Movement>(`/movements/${id}`, { method: 'DELETE' }),
};

export const lotsApi = {
  list: (filters: { flag?: string; articleId?: number; search?: string; includeExhausted?: boolean } = {}) =>
    request<Lot[]>('/lots', { query: { ...filters, includeExhausted: filters.includeExhausted ? 'true' : undefined } }),
  create: (payload: { articleId: number; lotNumber: string; fabricDate?: string | null; expiryDate?: string | null; unitPrice?: number | null; observation?: string | null }) =>
    request<Lot>('/lots', { method: 'POST', body: payload }),
  update: (id: number, payload: Partial<{ articleId: number; lotNumber: string; fabricDate?: string | null; expiryDate?: string | null; unitPrice?: number | null; observation?: string | null }>) =>
    request<Lot>(`/lots/${id}`, { method: 'PUT', body: payload }),
};

export const inventoriesApi = {
  list: () => request<Inventory[]>('/inventories'),
  get: (id: string) => request<InventoryDetail>(`/inventories/${id}`),
  open: (payload: { title?: string; depotId: number }) =>
    request<Inventory>('/inventories', { method: 'POST', body: payload }),
  populate: (id: string, depotId: number) =>
    request<{ created: number }>(`/inventories/${id}/populate`, { method: 'POST', body: { depotId } }),
  countLine: (id: string, lineId: string, payload: { qtyCounted: number }) =>
    request(`/inventories/${id}/lines/${lineId}/count`, { method: 'POST', body: payload }),
  validateLine: (id: string, lineId: string, payload: { decision: InventoryDecision; lossReason?: string; confirmToken?: string | null }) =>
    request(`/inventories/${id}/lines/${lineId}/validate`, { method: 'POST', body: payload }),
  close: (id: string) => request<Inventory>(`/inventories/${id}/close`, { method: 'POST' }),
};

export const loansApi = {
  list: () => request<Loan[]>('/loans'),
  synthesis: () =>
    request<{
      nbPret: number;
      nbEmprunt: number;
      nbRestituees: number;
      nbRestitueesIncompletes: number;
    }>('/loans/synthesis'),
  create: (payload: { type: LoanType; partnerId: number; articleId: number; lotId?: number | null; depotId?: number | null; locationId?: number | null; quantity: number; loanDate: string; observation?: string | null; confirmToken?: string | null }) =>
    request<Loan>('/loans', { method: 'POST', body: payload }),
  disponibilite: (params: { articleId: number; lotId?: number | null; depotId?: number | null; locationId?: number | null }) =>
    request<{ disponible: number; tousDepots: boolean; depotConseille: number; emplacementConseille: number | null }>(
      '/loans/disponibilite',
      { query: { ...params } },
    ),
  depotSuggestion: () =>
    request<{
      suggested: { depotId: number; label: string; nbLignes: number; nbArticles: number };
      parDepot: { depotId: number; label: string; nbLignes: number; nbArticles: number }[];
    }>('/loans/depot-suggestion'),
  restitute: (payload: { loanId: string; type: RestitutionType; quantity: number; restDate: string; confirmToken?: string | null }) =>
    request('/loans/restitution', { method: 'POST', body: payload }),
};

export const reservationsApi = {
  list: (filters: { status?: string; partnerId?: number } = {}) =>
    request<Reservation[]>('/reservations', { query: { ...filters } }),
  synthesis: () =>
    request<{ actives: number; expirees: number; expire7: number; realises: number }>('/reservations/synthesis'),
  /**
   * D21 : `partnerId` conditionne le plafond renvoye, qui est propre a chaque
   * acteur. Sans lui le serveur renvoie un cumul nul, donc un plafond qui n'est le
   * bon pour personne : l'appel doit toujours le passer.
   */
  availability: (articleId: number, partnerId: number) =>
    request<ReservationAvailability>(`/reservations/availability/${articleId}`, {
      query: { partnerId },
    }),
  get: (id: string) => request<Reservation>(`/reservations/${id}`),
  create: (payload: {
    partnerId: number;
    staffLabel: string;
    staffId?: number | null;
    startDate: string;
    endDate: string;
    observation?: string | null;
    lines: { articleId: number; quantity: number }[];
  }) => request<Reservation>('/reservations', { method: 'POST', body: payload }),
  validate: (id: string) =>
    request<Reservation & { notes?: string[] }>(`/reservations/${id}/valider`, { method: 'POST' }),
  cancel: (id: string) => request<Reservation>(`/reservations/${id}/annuler`, { method: 'POST' }),
};

export const valuationApi = {
  get: (filters: { categoryId?: number; familyId?: number; depotId?: number } = {}) =>
    request<ValuationResult>('/valuation', { query: { ...filters } }),
};

export interface BonPayload {
  type: BonType;
  depotId?: number | null;
  depotDestId?: number | null;
  partnerId?: number | null;
  bonDate: string;
  currency: string;
  lines: { articleId: number; lotId?: number | null; quantity: number; unitPrice?: number | null; observation?: string | null }[];
}

export const bonsApi = {
  list: () => request<Bon[]>('/bons'),
  get: (id: string) => request<Bon>(`/bons/${id}`),
  create: (payload: BonPayload) => request<Bon>('/bons', { method: 'POST', body: payload }),
};

export const settingsApi = {
  list: () => request<Setting[]>('/settings'),
  update: (values: Record<string, string>) => request<{ updated: string[] }>('/settings', { method: 'PUT', body: values }),
};

export const usersApi = {
  list: () => request<User[]>('/users'),
  create: (payload: { login: string; password: string; displayName?: string | null; roleId: number }) =>
    request<User>('/users', { method: 'POST', body: payload }),
  update: (id: number, payload: { displayName?: string | null; password?: string | null; isActive?: boolean }) =>
    request<User>(`/users/${id}`, { method: 'PUT', body: payload }),
};

export const auditApi = {
  list: (filters: { userId?: number; entity?: string; action?: string; search?: string; limit?: number; offset?: number } = {}): Promise<Paged<AuditLog>> =>
    requestPaged<AuditLog>('/audit', { query: { ...filters } }),
};

export const referentialApi = {
  families: () => request<Family[]>('/referential/families'),
  categories: () => request<Category[]>('/referential/categories'),
  units: () => request<Unit[]>('/referential/units'),
  packaging: () => request<Packaging[]>('/referential/packaging'),
  origins: () => request<Origin[]>('/referential/origins'),
  depots: () => request<Depot[]>('/referential/depots'),
  locations: () => request<StorageLocation[]>('/referential/locations'),
  partners: () => request<Partner[]>('/referential/partners'),
  roles: () => request<{ id: number; code: string; label: string }[]>('/referential/roles'),
  create: (model: string, payload: { code: string; label: string; categoryId?: number | null }) =>
    request(`/referential/${model}`, { method: 'POST', body: payload }),
  remove: (model: string, id: number) => request(`/referential/${model}/${id}`, { method: 'DELETE' }),
  /**
   * D21 : dispense du plafond de reservation, accordee par la direction generale.
   * Route dediee et non une mise a jour generale : le referentiel n'a pas
   * d'ecran d'edition, et ouvrir une edition complete exposerait le nom et le
   * statut des acteurs a un droit qui n'en a pas la charge.
   */
  setPlafondExempt: (id: number, plafondExempt: boolean) =>
    request<{ id: number; name: string; plafondExempt: boolean }>(
      `/referential/partners/${id}/plafond-exempt`,
      { method: 'PATCH', body: { plafondExempt } },
    ),
};
