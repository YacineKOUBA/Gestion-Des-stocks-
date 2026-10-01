import { PrismaClient, RoleCode, MoveTypeCode, AlertLevel } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  console.log('Seed GD Trading V1 ...');

  // ---- Roles ----
  const roleAdmin = await prisma.role.upsert({
    where: { code: RoleCode.ADMIN },
    update: {},
    create: { code: RoleCode.ADMIN, label: 'Administrateur' },
  });
  const roleMag = await prisma.role.upsert({
    where: { code: RoleCode.MAGASINIER },
    update: {},
    create: { code: RoleCode.MAGASINIER, label: 'Magasinier' },
  });

  // ---- Utilisateurs initiaux ----
  const adminHash = await bcrypt.hash('admin2026', 10);
  const magHash = await bcrypt.hash('magasinier2026', 10);

  const admin = await prisma.user.upsert({
    where: { login: 'admin' },
    update: { roleId: roleAdmin.id, passwordHash: adminHash, isActive: true },
    create: {
      roleId: roleAdmin.id,
      login: 'admin',
      passwordHash: adminHash,
      displayName: 'Administrateur GD Trading',
    },
  });
  const mag = await prisma.user.upsert({
    where: { login: 'magasinier' },
    update: { roleId: roleMag.id, passwordHash: magHash, isActive: true },
    create: {
      roleId: roleMag.id,
      login: 'magasinier',
      passwordHash: magHash,
      displayName: 'Magasinier',
    },
  });
  console.log('Utilisateurs :', admin.login, mag.login);

  // ---- Categories + series de codes ----
  const cats = [
    { code: 'EMBALLAGE', label: 'Emballage', prefix: '100', sort: 1 },
    { code: 'MATIERE_PREMIERE', label: 'Matière première', prefix: '200', sort: 2 },
    { code: 'PIECE_DE_RECHANGE', label: 'Pièce de rechange', prefix: '300', sort: 3 },
    { code: 'EQUIPEMENT', label: 'Équipement', prefix: '400', sort: 4 },
  ];
  for (const c of cats) {
    await prisma.category.upsert({
      where: { code: c.code },
      update: { label: c.label, sort: c.sort },
      create: { code: c.code, label: c.label, sort: c.sort },
    });
    const cat = await prisma.category.findUniqueOrThrow({ where: { code: c.code } });
    await prisma.codeSeries.upsert({
      where: { categoryId: cat.id },
      update: { prefix: c.prefix },
      create: { categoryId: cat.id, prefix: c.prefix, nextValue: 1, digits: 6 },
    });
  }
  console.log('Catégories + séries de codes OK');

  // ---- Familles (listé fournie par le client) ----
  const fams = [
    ['ACIDE', 'ACIDE', 'MATIERE_PREMIERE'],
    ['ACIDIFIANT', 'ACIDIFIANT', 'MATIERE_PREMIERE'],
    ['AGENT_CROUSTILLANT', 'AGENT CROUSTILLANT', 'MATIERE_PREMIERE'],
    ['AGENT_LEVEE_BIOLO', 'AGENT DE LEVEE BIOLOGIQUE', 'MATIERE_PREMIERE'],
    ['AGENT_SERTISSAGE', 'AGENT DE SERTISSAGE EMBALLAG', 'EMBALLAGE'],
    ['AGENT_ENROBAGE', "AGENT D'ENROBAGE", 'MATIERE_PREMIERE'],
    ['ALUMINIUM', 'ALUMINIUM', 'EMBALLAGE'],
    ['AMIDON', 'AMIDON', 'MATIERE_PREMIERE'],
    ['ANTI_BACTERIEN', 'ANTI BACTERIEN', 'MATIERE_PREMIERE'],
    ['ANTI_OXYDANT', 'ANTI OXYDANT', 'MATIERE_PREMIERE'],
    ['AROME', 'ARÔME', 'MATIERE_PREMIERE'],
    ['BASE', 'BÅSE', 'MATIERE_PREMIERE'],
    ['BASE_FOISONNANTE', 'BASE FOISONNANTE', 'MATIERE_PREMIERE'],
    ['CHAPELURE', 'CHAPELURE', 'MATIERE_PREMIERE'],
    ['COLORANT', 'COLORANT', 'MATIERE_PREMIERE'],
    ['CONSERVATEUR', 'CONSERVATEUR', 'MATIERE_PREMIERE'],
    ['DIVERS', 'DIVERS', 'MATIERE_PREMIERE'],
    ['EMBALLAGE', 'EMBALLAGE', 'EMBALLAGE'],
    ['EMULSIFIANT', 'EMULSIFIANT', 'MATIERE_PREMIERE'],
    ['ENZYME', 'ENZYME', 'MATIERE_PREMIERE'],
    ['EPAISSISSANT', 'EPAISSISSANT', 'MATIERE_PREMIERE'],
    ['FARINE', 'FARINE', 'MATIERE_PREMIERE'],
    ['FERMENT', 'FERMENT', 'MATIERE_PREMIERE'],
    ['FERMENT_LACTIQUE', 'FERMENT LACTIQUE', 'MATIERE_PREMIERE'],
    ['FILM', 'FILM', 'EMBALLAGE'],
    ['GELIFIANT', 'GELIFIANT', 'MATIERE_PREMIERE'],
    ['GRAISSE_VEGETALE', 'GRAISSE VEGETALE', 'MATIERE_PREMIERE'],
    ['HUMIDIFIANT', 'HUMIDIFIANT', 'MATIERE_PREMIERE'],
    ['LAIT', 'LAIT', 'MATIERE_PREMIERE'],
    ['LEVURE', 'LEVURE', 'MATIERE_PREMIERE'],
    ['PARAFFINE', 'PARAFFINE', 'EMBALLAGE'],
    ['PLASTIQUE', 'PLASTIQUE', 'EMBALLAGE'],
    ['PROTEINE', 'PROTEINE', 'MATIERE_PREMIERE'],
    ['RUBAN_ADHESIF', 'RUBAN ADHESIF', 'EMBALLAGE'],
    ['SEL_DE_FONTE', 'SEL DE FONTE', 'MATIERE_PREMIERE'],
    ['SOUDE', 'SOUDE', 'MATIERE_PREMIERE'],
    ['STABILISANT', 'STABILISANT', 'MATIERE_PREMIERE'],
    ['SUCRE', 'SUCRE', 'MATIERE_PREMIERE'],
    ['TEXTURANT', 'TEXTURANT', 'MATIERE_PREMIERE'],
    ['ACCESSOIRE', 'ACCESSOIRE', 'EMBALLAGE'],
  ];
  for (const [code, label, catCode] of fams) {
    const cat = await prisma.category.findUniqueOrThrow({ where: { code: catCode } });
    await prisma.family.upsert({
      where: { code },
      update: { label },
      create: { code, label, categoryId: cat.id },
    });
  }
  console.log(`Familles OK (${fams.length})`);

  // ---- Types de mouvement ----
  const mtypes = [
    { code: MoveTypeCode.ENTREE, label: 'Entrée', sens: 1 },
    { code: MoveTypeCode.SORTIE, label: 'Sortie', sens: -1 },
    { code: MoveTypeCode.TRANSFERT, label: 'Transfert', sens: 1 },
    { code: MoveTypeCode.PERTE, label: 'Perte', sens: -1 },
    { code: MoveTypeCode.AJUSTEMENT, label: 'Ajustement', sens: 1 },
    { code: MoveTypeCode.RETOUR, label: 'Retour', sens: 1 },
  ];
  for (const t of mtypes) {
    await prisma.moveType.upsert({
      where: { code: t.code },
      update: {},
      create: t,
    });
  }
  console.log('Types de mouvement OK');

  // ---- Depots (etablissements) ----
  const depots = [
    { code: 'ALGER', label: 'Alger' },
    { code: 'BLIDA1', label: 'Blida 1' },
    { code: 'BLIDA2', label: 'Blida 2' },
    { code: 'CONSTANTINE', label: 'Constantine' },
    { code: 'EXTERIEUR', label: 'Extérieur' },
  ];
  for (const d of depots) {
    await prisma.depot.upsert({
      where: { code: d.code },
      update: {},
      create: d,
    });
  }

  // ---- Emplacements internes ----
  const locations = [
    { code: 'DEPOT1', label: 'Dépôt 1' },
    { code: 'DEPOT2', label: 'Dépôt 2' },
    { code: 'DEPOT12', label: 'Dépôt 1 & 2' },
    { code: 'EXTERIEUR', label: 'Extérieur' },
    { code: 'FERMENT', label: 'Fermentation' },
  ];
  for (const l of locations) {
    await prisma.location.upsert({
      where: { code: l.code },
      update: {},
      create: l,
    });
  }
  console.log('Dépôts + emplacements OK');

  // ---- Acteurs (fournisseurs / clients / entités) ----
  const partners = [
    { name: 'Fournisseur divers', type: 'FOURNISSEUR' as const },
    { name: 'Client divers', type: 'CLIENT' as const },
    { name: 'Entité interne GD', type: 'ENTITE' as const },
  ];
  for (const p of partners) {
    const existing = await prisma.partner.findFirst({ where: { name: p.name } });
    if (!existing) await prisma.partner.create({ data: p });
  }
  console.log('Acteurs OK');

  // ---- Parametres (seuils) ----
  const settings = [
    { code: 'JOURS_SECURITE', value: '9', label: 'Jours de couverture sécurité' },
    { code: 'JOURS_MIN', value: '21', label: 'Jours de stock minimum' },
    { code: 'COEF_MAXI', value: '0.5', label: 'Coefficient stock maxi' },
    { code: 'COEF_ALERTE', value: '1.05', label: 'Coefficient alerte (classement observation)' },
    { code: 'ALERTE_PEREMPTION_JOURS', value: '30', label: "Délai avant expiration à signaler (jours)" },
  ];
  for (const s of settings) {
    await prisma.setting.upsert({
      where: { code: s.code },
      update: { value: s.value },
      create: s,
    });
  }
  console.log('Paramètres OK');

  // ---- Unites de mesure ----
  const units = [
    { code: 'KG', label: 'Kilogramme' },
    { code: 'UNITE', label: 'Unité' },
    { code: 'LITRE', label: 'Litre' },
    { code: 'ML', label: 'Millilitre' },
    { code: 'PIECE', label: 'Pièce' },
  ];
  for (const u of units) {
    await prisma.unit.upsert({
      where: { code: u.code },
      update: {},
      create: u,
    });
  }
  console.log('Unités OK');

  // ---- Pays (origines) ----
  const origins = [
    ['AF', 'Afghanistan'], ['ZA', 'Afrique du Sud'], ['AL', 'Albanie'], ['DZ', 'Algérie'],
    ['DE', 'Allemagne'], ['AD', 'Andorre'], ['AO', 'Angola'], ['AG', 'Antigua-et-Barbuda'],
    ['SA', 'Arabie saoudite'], ['AR', 'Argentine'], ['AM', 'Arménie'], ['AU', 'Australie'],
    ['AT', 'Autriche'], ['AZ', 'Azerbaïdjan'], ['BS', 'Bahamas'], ['BH', 'Bahreïn'],
    ['BD', 'Bangladesh'], ['BB', 'Barbade'], ['BE', 'Belgique'], ['BZ', 'Belize'],
    ['BJ', 'Bénin'], ['BT', 'Bhoutan'], ['BY', 'Biélorussie'], ['MM', 'Birmanie'],
    ['BO', 'Bolivie'], ['BA', 'Bosnie-Herzégovine'], ['BW', 'Botswana'], ['BR', 'Brésil'],
    ['BN', 'Brunei'], ['BG', 'Bulgarie'], ['BF', 'Burkina Faso'], ['BI', 'Burundi'],
    ['KH', 'Cambodge'], ['CM', 'Cameroun'], ['CA', 'Canada'], ['CV', 'Cap-Vert'],
    ['CF', 'Centrafrique'], ['CL', 'Chili'], ['CN', 'Chine'], ['CY', 'Chypre'],
    ['CO', 'Colombie'], ['KM', 'Comores'], ['CG', 'Congo'], ['CD', 'Congo (RD)'],
    ['KR', 'Corée du Sud'], ['KP', 'Corée du Nord'], ['CR', 'Costa Rica'], ['CI', "Côte d'Ivoire"],
    ['HR', 'Croatie'], ['CU', 'Cuba'], ['DK', 'Danemark'], ['DJ', 'Djibouti'],
    ['DM', 'Dominique'], ['EG', 'Égypte'], ['AE', 'Émirats arabes unis'], ['EC', 'Équateur'],
    ['ER', 'Érythrée'], ['ES', 'Espagne'], ['EE', 'Estonie'], ['US', 'États-Unis'],
    ['ET', 'Éthiopie'], ['FJ', 'Fidji'], ['FI', 'Finlande'], ['FR', 'France'],
    ['GA', 'Gabon'], ['GM', 'Gambie'], ['GE', 'Géorgie'], ['GH', 'Ghana'],
    ['GR', 'Grèce'], ['GD', 'Grenade'], ['GT', 'Guatemala'], ['GN', 'Guinée'],
    ['GQ', 'Guinée équatoriale'], ['GW', 'Guinée-Bissau'], ['GY', 'Guyana'], ['HT', 'Haïti'],
    ['HN', 'Honduras'], ['HU', 'Hongrie'], ['IN', 'Inde'], ['ID', 'Indonésie'],
    ['IQ', 'Irak'], ['IR', 'Iran'], ['IE', 'Irlande'], ['IS', 'Islande'],
    ['IL', 'Israël'], ['IT', 'Italie'], ['JM', 'Jamaïque'], ['JP', 'Japon'],
    ['JO', 'Jordanie'], ['KZ', 'Kazakhstan'], ['KE', 'Kenya'], ['KG', 'Kirghizistan'],
    ['KI', 'Kiribati'], ['KW', 'Koweït'], ['LA', 'Laos'], ['LS', 'Lesotho'],
    ['LV', 'Lettonie'], ['LB', 'Liban'], ['LR', 'Libéria'], ['LY', 'Libye'],
    ['LI', 'Liechtenstein'], ['LT', 'Lituanie'], ['LU', 'Luxembourg'], ['MK', 'Macédoine du Nord'],
    ['MG', 'Madagascar'], ['MY', 'Malaisie'], ['MW', 'Malawi'], ['MV', 'Maldives'],
    ['ML', 'Mali'], ['MT', 'Malte'], ['MA', 'Maroc'], ['MH', 'Îles Marshall'],
    ['MR', 'Mauritanie'], ['MU', 'Maurice'], ['MX', 'Mexique'], ['FM', 'Micronésie'],
    ['MD', 'Moldavie'], ['MC', 'Monaco'], ['MN', 'Mongolie'], ['ME', 'Monténégro'],
    ['MZ', 'Mozambique'], ['NA', 'Namibie'], ['NR', 'Nauru'], ['NP', 'Népal'],
    ['NI', 'Nicaragua'], ['NE', 'Niger'], ['NG', 'Nigéria'], ['NO', 'Norvège'],
    ['NZ', 'Nouvelle-Zélande'], ['OM', 'Oman'], ['UG', 'Ouganda'], ['UZ', 'Ouzbékistan'],
    ['PK', 'Pakistan'], ['PW', 'Palaos'], ['PA', 'Panama'], ['PG', 'Papouasie-Nouvelle-Guinée'],
    ['PY', 'Paraguay'], ['NL', 'Pays-Bas'], ['PE', 'Pérou'], ['PH', 'Philippines'],
    ['PL', 'Pologne'], ['PT', 'Portugal'], ['QA', 'Qatar'], ['RO', 'Roumanie'],
    ['GB', 'Royaume-Uni'], ['RU', 'Russie'], ['RW', 'Rwanda'], ['KN', 'Saint-Christophe-et-Niévès'],
    ['SM', 'Saint-Marin'], ['VC', 'Saint-Vincent-et-les-Grenadines'], ['LC', 'Sainte-Lucie'], ['SB', 'Salomon'],
    ['SV', 'Salvador'], ['WS', 'Samoa'], ['ST', 'Sao Tomé-et-Principe'], ['SN', 'Sénégal'],
    ['RS', 'Serbie'], ['SC', 'Seychelles'], ['SL', 'Sierra Leone'], ['SG', 'Singapour'],
    ['SK', 'Slovaquie'], ['SI', 'Slovénie'], ['SO', 'Somalie'], ['SD', 'Soudan'],
    ['SS', 'Soudan du Sud'], ['LK', 'Sri Lanka'], ['SE', 'Suède'], ['CH', 'Suisse'],
    ['SR', 'Suriname'], ['SY', 'Syrie'], ['TJ', 'Tadjikistan'], ['TW', 'Taïwan'],
    ['TZ', 'Tanzanie'], ['TD', 'Tchad'], ['CZ', 'Tchéquie'], ['TH', 'Thaïlande'],
    ['TL', 'Timor oriental'], ['TG', 'Togo'], ['TO', 'Tonga'], ['TT', 'Trinité-et-Tobago'],
    ['TN', 'Tunisie'], ['TM', 'Turkménistan'], ['TR', 'Turquie'], ['TV', 'Tuvalu'],
    ['UA', 'Ukraine'], ['UY', 'Uruguay'], ['VU', 'Vanuatu'], ['VA', 'Vatican'],
    ['VE', 'Venezuela'], ['VN', 'Vietnam'], ['YE', 'Yémen'], ['ZM', 'Zambie'],
    ['ZW', 'Zimbabwe'],
  ];
  for (const [code, label] of origins) {
    await prisma.origin.upsert({
      where: { code },
      update: { label },
      create: { code, label },
    });
  }
  console.log(`Origines OK (${origins.length} pays)`);

  console.log('Seed terminé.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });