export type RoleCode = 'ADMIN' | 'MAGASINIER' | 'TOP_MANAGEMENT' | 'SALES_ADMIN';

/**
 * Droits de l'application (D16).
 *
 * Cette liste est un MIROIR de `server/src/auth/permissions.ts`, mais elle ne sert
 * qu'a la verification de compilation. La source de verite reste le serveur : il
 * renvoie les droits reels dans /auth/login et /auth/me, et le client ne calcule
 * donc jamais un droit de lui-meme. Toute divergence ici provoque au mieux une
 * erreur TypeScript, au pire un bouton masque a tort.
 */
export type Permission =
  | 'dashboard:read'
  | 'stock:read'
  | 'article:read'
  | 'article:write'
  | 'movement:read'
  | 'movement:write'
  | 'movement:revise'
  | 'lot:read'
  | 'lot:write'
  | 'inventory:read'
  | 'inventory:count'
  | 'inventory:write'
  | 'inventory:decide'
  | 'loan:read'
  | 'loan:write'
  | 'reservation:read'
  | 'reservation:write'
  | 'reservation:decide'
  | 'bon:read'
  | 'bon:write'
  | 'valuation:read'
  | 'referential:read'
  | 'referential:manage'
  | 'referential:write'
  | 'user:read'
  | 'user:write'
  | 'settings:read'
  | 'settings:write'
  | 'audit:read';
export type ArticleEmploi = 'PRODUCTION' | 'REVENTE_EN_LETAT' | 'MIXTE';
export type SourceAchat = 'INTERNATIONAL' | 'LOCAL' | 'MIXTE' | 'NON_DEFINI';
export type ArticleStatut = 'ACTIVE' | 'INACTIVE';
export type MoveTypeCode = 'ENTREE' | 'SORTIE' | 'TRANSFERT' | 'PERTE' | 'AJUSTEMENT' | 'RETOUR';
export type MoveStatus = 'ACTIF' | 'ANNULE';
export type InventoryStatus = 'OUVERTE' | 'CLOTUREE';
export type InventoryLineStatus = 'A_COMPTER' | 'COMPTE' | 'VALIDE' | 'REFUSE';
export type InventoryDecision = 'AJUSTEMENT' | 'PERTE';
export type LoanType = 'PRET' | 'EMPRUNT';
export type RestitutionType = 'RESTITUTION_PRET' | 'RESTITUTION_EMPRUNT';
export type BonType = 'ENTREE' | 'SORTIE' | 'LIVRAISON' | 'TRANSFERT' | 'RETOUR';
export type PartnerType = 'FOURNISSEUR' | 'CLIENT' | 'ENTITE' | 'AUTRE';

export interface Paged<T> {
  items: T[];
  total: number;
  /** true si la recherche cote serveur a ete plafonnee (X-Search-Truncated). */
  truncated?: boolean;
}

export interface Category {
  id: number;
  code: string;
  label: string;
  sort: number | null;
}
export interface Family {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
  categoryId: number | null;
  category?: Category | null;
}
export interface Unit {
  id: number;
  code: string;
  label: string;
}
export interface Packaging {
  id: number;
  label: string;
}
export interface Origin {
  id: number;
  code: string;
  label: string;
  region: string | null;
}
export interface Depot {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
}
export interface StorageLocation {
  id: number;
  code: string;
  label: string;
  isActive: boolean;
}
export interface Partner {
  id: number;
  name: string;
  type: PartnerType;
  isActive: boolean;
}

export interface Article {
  id: number;
  code: string;
  designation: string;
  designation2: string | null;
  fabricant: string | null;
  emploiGd: ArticleEmploi;
  categoryId: number;
  category?: Category;
  familyId: number | null;
  family?: Family | null;
  application: string | null;
  unitId: number;
  unit?: Unit;
  packagingId: number | null;
  packaging?: Packaging | null;
  sourceAchat: SourceAchat | null;
  originId: number | null;
  origin?: Origin | null;
  periode: string | null;
  frequence: number | null;
  statut: ArticleStatut;
  unitPrice: string | null;
  currency: string;
  isLotTracked: boolean;
}

export interface Lot {
  id: number;
  articleId: number;
  lotNumber: string;
  fabricDate: string | null;
  expiryDate: string | null;
  unitPrice: string | null;
  observation?: string | null;
  quantity: number;
  /** Lot masque par defaut (deja mouvement, stock ACTIF a zero) : visible si includeExhausted. */
  exhausted?: boolean;
  /** Total SORTIE du lot (depart client) et date de derniere sortie : sert au RETOUR. */
  sortiQty?: number;
  lastExitAt?: string | null;
  flag?: 'PERIME' | 'ROUGE' | 'ORANGE' | 'VERT' | null;
  article?: { code: string; designation: string; currency?: string; unitPrice?: string | number; unit?: { code: string } };
}

export interface StockRow {
  articleId: number;
  articleCode: string;
  designation: string;
  category: string | null;
  family: string | null;
  unit: string | null;
  depot?: string | null;
  location?: string | null;
  lot?: string | null;
  expiryDate?: string | null;
  quantity: number;
}

export interface ThresholdRow {
  articleId: number;
  code: string;
  designation: string;
  category: string | null;
  family: string | null;
  unit: string | null;
  stockDisponible: number;
  stockVirtuel: number;
  stockSecurite: number;
  stockMin: number;
  stockAlerte: number;
  stockMax: number;
  couvStock: number;
  observation: string;
}

export interface ArticleDetailStock {
  lignes: StockRow[];
  stockDisponible: number;
  encours: number;
  stockVirtuel: number;
  seuils: Omit<ThresholdRow, 'articleId' | 'code' | 'designation' | 'category' | 'family' | 'stockDisponible' | 'stockVirtuel'>;
}

export interface Movement {
  id: string;
  typeId: number;
  type?: { code: MoveTypeCode; label: string };
  articleId: number;
  article?: { code: string; designation: string; unit?: { code: string; label: string } };
  lotId: number | null;
  lot?: Lot | null;
  quantity: string;
  sens: number;
  depotId: number;
  depot?: Depot;
  locationId: number | null;
  location?: StorageLocation | null;
  depotDestId: number | null;
  locationDestId: number | null;
  partnerId: number | null;
  partner?: { name: string } | null;
  docNumber: string | null;
  unitPrice: string | null;
  currency: string;
  movementDate: string;
  observation: string | null;
  status: MoveStatus;
  createdBy: number;
  createdAt: string;
}

export interface Inventory {
  id: string;
  code: string;
  title: string | null;
  depotId: number | null;
  depot?: Depot | null;
  openedAt: string;
  openedBy: number;
  closedAt: string | null;
  closedBy: number | null;
  status: InventoryStatus;
  _count?: { lines: number };
}

export interface InventoryLine {
  id: string;
  inventoryId: string;
  articleId: number;
  article?: { code: string; designation: string; unit?: { code: string; label: string } };
  lotId: number | null;
  lot?: Lot | null;
  locationId: number | null;
  location?: StorageLocation | null;
  qtyTheoretical: string;
  qtyCounted: string | null;
  variance: string | null;
  status: InventoryLineStatus;
  decision: InventoryDecision | null;
  lossReason: string | null;
  movementId: string | null;
}

export interface InventoryDetail extends Inventory {
  lines: InventoryLine[];
}

export interface Loan {
  id: string;
  type: LoanType;
  partnerId: number;
  partner?: Partner;
  articleId: number;
  article?: { code: string; designation: string; unit?: { code: string } };
  quantity: string;
  loanDate: string;
  observation: string | null;
  status: 'OUVERT' | 'PARTIEL' | 'CLOTURE';
  depot: string | null;
  emplacement: string | null;
  lotNumber: string | null;
  restitutions?: { id: string; quantity: string }[];
  restitue?: number;
  solde?: number;
}

export interface BonLine {
  id: string;
  articleId: number;
  article?: { code: string; designation: string; unit?: { code: string; label: string } };
  lotId: number | null;
  lot?: Lot | null;
  quantity: string;
  unitPrice: string | null;
  montant: string;
  observation: string | null;
}

export interface Bon {
  id: string;
  ref: string;
  type: BonType;
  depotId: number | null;
  depot?: Depot | null;
  depotDestId: number | null;
  partnerId: number | null;
  partner?: Partner | null;
  bonDate: string;
  currency: string;
  montantTotal: string;
  lines: BonLine[];
}

export type ReservationStatus = 'ACTIF' | 'REALISE' | 'ANNULE' | 'EXPIRE';

export interface ReservationLine {
  id: string;
  articleId: number;
  code: string;
  designation: string;
  unit: string | null;
  quantity: number;
}

/** Part de stock bloquee par la reservation (un mouvement par lot/emplacement touche). */
export interface ReservationMove {
  id: string;
  lotId: number | null;
  lotNumber: string | null;
  expiryDate: string | null;
  articleId: number;
  unit: string | null;
  quantity: number;
  depot: string;
  location: string | null;
  status: 'ACTIF' | 'ANNULE';
}

export interface Reservation {
  id: string;
  ref: string;
  partner: { id: number; name: string };
  /** Personnel saisi librement : ne correspond pas forcément a un utilisateur. */
  staffLabel: string;
  staff: { id: number; displayName: string | null; login: string } | null;
  creator: { id: number; displayName: string | null; login?: string } | null;
  closer: { id: number; displayName: string | null } | null;
  startDate: string;
  endDate: string;
  status: ReservationStatus;
  observation: string | null;
  createdAt: string;
  closedAt: string | null;
  closeReason: string | null;
  lines: ReservationLine[];
  moves: ReservationMove[];
}

export interface ReservationAvailability {
  articleId: number;
  total: number;
  lignes: {
    lotId: number | null;
    lotNumber: string | null;
    expiryDate: string | null;
    depotId: number;
    depotLabel: string;
    locationId: number | null;
    locationLabel: string | null;
    quantity: number;
  }[];
}

export interface Setting {
  id: number;
  code: string;
  value: string;
  label: string | null;
}

export interface AuditLog {
  id: string;
  userId: number | null;
  user?: { login: string } | null;
  action: string;
  entity: string;
  entityId: string | null;
  changes: unknown;
  createdAt: string;
}

export interface User {
  id: number;
  login: string;
  displayName: string | null;
  roleId: number;
  role?: { code: RoleCode; label: string };
  isActive: boolean;
}

export interface Kpis {
  nbArticles: number;
  nbLots: number;
  nbMouvements: number;
  entreesPeriode: number;
  sortiesPeriode: number;
  pertes: number;
  ajustementsEntrees: number;
  ajustementsSorties: number;
  alertes: number;
}

/** Stock par categorie ET par unite : on ne peut pas additionner des quantites d'unites differentes. */
export interface StockByCategoryRow {
  category: string;
  unit: string;
  quantity: number;
}

export type LotFlagCode = 'ROUGE' | 'ORANGE' | 'VERT' | 'PERIME';

export interface LotFlag {
  lotId: number;
  lotNumber: string;
  expiryDate: string;
  articleCode: string;
  designation: string;
  flag: LotFlagCode;
}

export interface DashboardAlerts {
  stock: { articleId: number; code: string; designation: string; observation: string }[];
  lots: LotFlag[];
}

export interface ValuationResult {
  rows: {
    articleId: number;
    articleCode: string;
    designation: string;
    category: string | null;
    family: string | null;
    unit: string | null;
    quantity: number;
    unitPrice: number;
    currency: string;
    value: number;
    /** Detail du prix moyen pondere : une entree par lot en stock. */
    lots: {
      lotId: number | null;
      lotNumber: string | null;
      expiryDate: string | null;
      flag: LotFlagCode | null;
      quantity: number;
      unitPrice: number;
      priceSource: 'LOT' | 'ARTICLE';
      value: number;
    }[];
  }[];
  totals: Record<string, number>;
}
