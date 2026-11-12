// Fills an empty local database with demo content, the way the newsroom
// would: categories, writers and columnists with photos, published news with
// covers, opinion columns and a lead story. For development only.
//
//   docker compose exec api npm run db:demo
//
// It goes through the API's own routes, like the panel does, so everything is
// checked as real content would be. That needs the API running and the admin
// from `npm run db:seed`. The pictures (scripts/demo-images) go to Cloudinary
// when it is configured; without it the stories go without them.

import fs from 'node:fs';
import path from 'node:path';
import { disconnectDatabase, prisma } from '../src/config/prisma';
import { env, isProduction } from '../src/config/env';

// The same development fallback as prisma/seed.ts.
const DEV_ADMIN_PASSWORD = 'admin12345';
const COLUMNIST_PASSWORD = 'senha-demo-123';
const IMAGES = path.join(__dirname, 'demo-images');
const API = `http://localhost:${env.PORT}`;

type Json = Record<string, any>;

// A logged-in browser, in short: keeps the session cookie between calls.
function client() {
  let cookie = '';
  return async (method: string, route: string, body?: unknown): Promise<Json> => {
    const response = await fetch(API + route, {
      method,
      headers: { 'content-type': 'application/json', ...(cookie ? { cookie } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const setCookie = response.headers.get('set-cookie');
    if (setCookie) cookie = setCookie.split(';')[0]!;
    const json = (await response.json().catch(() => ({}))) as Json;
    if (!response.ok) {
      throw new Error(`${method} ${route} answered ${response.status}: ${json.error?.message ?? JSON.stringify(json).slice(0, 200)}`);
    }
    return json.data as Json;
  };
}

type Call = ReturnType<typeof client>;

// The panel's upload: ask the API for a signature, send the file straight to
// Cloudinary, then register what Cloudinary answered.
async function upload(call: Call, purpose: 'cover' | 'author', file: string): Promise<string> {
  const { upload: signed } = await call('POST', '/api/media/signature', { purpose });
  const form = new FormData();
  for (const [key, value] of Object.entries(signed.fields as Record<string, string>)) form.append(key, value);
  form.append('file', new Blob([fs.readFileSync(path.join(IMAGES, file))], { type: 'image/jpeg' }), file);

  const response = await fetch(signed.uploadUrl as string, { method: 'POST', body: form });
  const answer = (await response.json()) as Json;
  if (!response.ok) throw new Error(`Cloudinary refused ${file}: ${answer.error?.message ?? response.status}`);

  const { media } = await call('POST', '/api/media', {
    purpose,
    publicId: answer.public_id,
    version: String(answer.version),
    signature: answer.signature,
    resourceType: answer.resource_type,
    format: answer.format,
    bytes: answer.bytes,
    width: answer.width ?? null,
    height: answer.height ?? null,
    duration: null,
    pages: null,
    originalName: file,
  });
  return media.id as string;
}

const html = (paragraphs: string[]) => paragraphs.map((text) => `<p>${text}</p>`).join('');

const ARTICLE = [
  'A prefeitura confirmou nesta segunda-feira o cronograma das obras, que devem começar ainda neste mês e seguir até o fim do primeiro semestre do ano que vem.',
  'Segundo a secretaria responsável, o trecho mais movimentado será liberado por etapas, para que o comércio da região não fique fechado durante as intervenções.',
  'Moradores ouvidos pela reportagem dizem que a mudança era esperada havia anos, mas cobram mais informação sobre os desvios e os horários de trabalho das equipes.',
  '“A gente quer a obra, mas quer saber como chegar em casa enquanto ela acontece”, resumiu uma comerciante que mantém uma banca no local há quase duas décadas.',
];

const SHORT_ARTICLE = [
  'A medida foi anunciada nesta semana e deve começar a valer nos próximos dias, segundo a administração.',
  'Moradores e comerciantes ouvidos pela reportagem aprovam a mudança, mas pedem mais divulgação.',
];

const CATEGORIES = ['Cidade', 'Política', 'Economia', 'Cultura', 'Esportes'];

const WRITERS = [
  { name: 'Ana Beatriz Lima', photo: 'ana.jpg', bio: 'Repórter de cidade. Cobre transporte, obras e o dia a dia dos bairros.' },
  { name: 'Marcos Vieira', photo: 'marcos.jpg', bio: 'Editor de política e economia.' },
];

const COLUMNISTS = [
  {
    name: 'Lúcia Medeiros',
    email: 'lucia@demo.local',
    photo: 'lucia.jpg',
    columnTitle: 'Crônicas da Orla',
    bio: 'Escritora e professora. Escreve sobre a cidade que a gente vive e não repara.',
  },
  {
    name: 'Rafael Nóbrega',
    email: 'rafael@demo.local',
    photo: 'rafael.jpg',
    columnTitle: 'Bola no Chão',
    bio: 'Jornalista esportivo há vinte anos, torcedor há mais tempo ainda.',
  },
];

// [title, category, picture, excerpt, writer]. The first one leads the home.
const TOP_NEWS: Array<[string, string, string, string, string]> = [
  ['Orla ganha ciclovia contínua de 12 km e novo calçadão até o fim do semestre', 'Cidade', 'orla.jpg', 'Obra liga as três praias urbanas e prevê iluminação nova, bicicletários e faixas exclusivas nos cruzamentos mais perigosos.', 'Ana Beatriz Lima'],
  ['Feira da praça volta aos sábados com 80 barracas e horário estendido', 'Economia', 'feira.jpg', 'Produtores rurais da região voltam a ocupar o centro a partir de outubro, agora até as 14h.', 'Ana Beatriz Lima'],
  ['Câmara aprova reajuste da tarifa de ônibus abaixo da inflação', 'Política', 'onibus.jpg', 'Passagem sobe 4,2% em janeiro; integração gratuita em 60 minutos passa a valer em todas as linhas.', 'Marcos Vieira'],
  ['Chuva forte deixa bairros sem energia e alaga avenidas da zona norte', 'Cidade', 'chuva.jpg', 'Defesa Civil registrou 140 mm em seis horas e pede que moradores de áreas de risco procurem abrigo.', 'Ana Beatriz Lima'],
  ['Festival de inverno anuncia programação gratuita com 40 shows', 'Cultura', 'show.jpg', 'Evento ocupa quatro palcos no centro histórico entre 18 e 27 de julho.', 'Marcos Vieira'],
  ['Time da casa vence o clássico de virada e assume a liderança', 'Esportes', 'estadio.jpg', 'Dois gols nos últimos dez minutos levaram 18 mil torcedores ao delírio no estádio municipal.', 'Marcos Vieira'],
  ['Governo do estado anuncia concurso com 1.200 vagas para a educação', 'Política', 'governo.jpg', 'Edital deve sair em novembro; salário inicial para professor é de R$ 4.580.', 'Marcos Vieira'],
  ['Escolas municipais terão aula de programação a partir de março', 'Cidade', 'escola.jpg', 'Projeto começa em 30 escolas e chega a toda a rede em dois anos.', 'Ana Beatriz Lima'],
  ['Safra de feijão cresce 18% e preço deve cair nas feiras da região', 'Economia', 'campo.jpg', 'Chuvas regulares no interior garantiram a melhor colheita dos últimos seis anos.', 'Marcos Vieira'],
  ['Ponte nova encurta em 20 minutos a viagem entre as duas margens do rio', 'Cidade', 'ponte.jpg', 'Estrutura de 600 metros foi inaugurada neste domingo após três anos de obras.', 'Ana Beatriz Lima'],
  ['São João movimenta R$ 90 milhões e lota hotéis da cidade', 'Cultura', 'festa.jpg', 'Ocupação hoteleira chegou a 97% no fim de semana mais movimentado da festa.', 'Marcos Vieira'],
  ['Centro comercial reabre com lojas de bairro e área de convivência', 'Economia', 'cidade.jpg', 'Prédio estava fechado havia cinco anos e foi reformado por uma cooperativa de comerciantes.', 'Ana Beatriz Lima'],
];

// Older news, so every category block on the home has something to show.
const OLDER_NEWS: Array<[string, string, string]> = [
  ['Prefeitura abre inscrições para hortas comunitárias em 12 bairros', 'Cidade', 'campo.jpg'],
  ['Mercado central ganha estacionamento rotativo a partir de dezembro', 'Cidade', 'cidade.jpg'],
  ['Linha de ônibus noturna liga o aeroporto à rodoviária', 'Cidade', 'onibus.jpg'],
  ['Deputados aprovam fundo para recuperar estradas do interior', 'Política', 'governo.jpg'],
  ['Prefeito sanciona lei que proíbe som alto na orla depois das 22h', 'Política', 'orla.jpg'],
  ['Vereadores criam comissão para acompanhar obras da ponte', 'Política', 'ponte.jpg'],
  ['Comércio do centro espera vendas 9% maiores no Natal', 'Economia', 'feira.jpg'],
  ['Cooperativa de pescadores abre loja própria no porto', 'Economia', 'orla.jpg'],
  ['Teatro municipal reabre com temporada de peças locais', 'Cultura', 'show.jpg'],
  ['Biblioteca pública passa a abrir aos domingos', 'Cultura', 'escola.jpg'],
  ['Quadrilhas juninas começam ensaios para o concurso estadual', 'Cultura', 'festa.jpg'],
  ['Corrida de rua da orla terá percurso de 10 km e 5 mil inscritos', 'Esportes', 'orla.jpg'],
  ['Escolinha de vôlei de praia forma três atletas para a seleção juvenil', 'Esportes', 'estadio.jpg'],
  ['Estádio municipal recebe gramado novo antes da final', 'Esportes', 'estadio.jpg'],
];

// [title, excerpt, columnist]
const COLUMNS: Array<[string, string, string]> = [
  ['A cidade que acorda antes do sol', 'Às cinco da manhã, a orla é de quem trabalha. Uma crônica sobre os pescadores, os ambulantes e o café da esquina.', 'Lúcia Medeiros'],
  ['O que a gente perde quando derruba um prédio velho', 'Toda cidade tem a memória que decide guardar. A nossa anda guardando pouco.', 'Lúcia Medeiros'],
  ['O clássico se ganha na arquibancada', 'Dezoito mil pessoas empurraram o time nos últimos dez minutos. Não foi sorte.', 'Rafael Nóbrega'],
  ['Por que o futebol de várzea merece mais atenção da prefeitura', 'Os campos de bairro formam mais jogadores do que qualquer escolinha paga.', 'Rafael Nóbrega'],
];

async function main() {
  // Same rule as the seed: never against production, never against a
  // database that is not on this machine or in Docker (Render's, say).
  const host = new URL(env.DATABASE_URL).hostname;
  if (isProduction || !['localhost', '127.0.0.1', '::1', 'db'].includes(host)) {
    throw new Error(`Demo content is for a local database only, not ${host}.`);
  }

  // Running it twice would duplicate everything.
  if ((await prisma.post.count()) > 0 || (await prisma.category.count()) > 0) {
    throw new Error('The database already has content. Demo content goes into an empty database (see the README: "start over").');
  }

  let uploads: string;
  try {
    uploads = (await (await fetch(`${API}/api/health`)).json() as Json).data.uploads;
  } catch {
    throw new Error(`The API is not answering at ${API}. Start it first (docker compose up).`);
  }
  const withPictures = uploads === 'cloudinary';
  if (!withPictures) console.log('Cloudinary is not configured: the stories go without pictures.');

  const admin = client();
  try {
    await admin('POST', '/api/auth/login', { email: env.SEED_ADMIN_EMAIL, password: env.SEED_ADMIN_PASSWORD ?? DEV_ADMIN_PASSWORD });
  } catch {
    throw new Error(`Could not log in as ${env.SEED_ADMIN_EMAIL}. Run npm run db:seed first.`);
  }

  const picture = async (purpose: 'cover' | 'author', file: string) => (withPictures ? upload(admin, purpose, file) : undefined);

  const categories = new Map<string, string>();
  for (const name of CATEGORIES) {
    categories.set(name, (await admin('POST', '/api/admin/categories', { name })).category.id);
  }
  console.log(`Categories: ${CATEGORIES.join(', ')}`);

  const authors = new Map<string, string>();
  for (const writer of WRITERS) {
    const photoId = await picture('author', writer.photo);
    const { author } = await admin('POST', '/api/admin/authors', { name: writer.name, bio: writer.bio, photoId, type: 'writer' });
    authors.set(writer.name, author.id);
  }

  // A columnist is a reader's account promoted by the admin, as in the panel.
  for (const columnist of COLUMNISTS) {
    const { user } = await client()('POST', '/api/auth/register', {
      name: columnist.name,
      email: columnist.email,
      password: COLUMNIST_PASSWORD,
    });
    const photoId = await picture('author', columnist.photo);
    const promoted = await admin('POST', `/api/admin/users/${user.id}/promote`, {
      name: columnist.name,
      bio: columnist.bio,
      photoId,
      columnTitle: columnist.columnTitle,
    });
    authors.set(columnist.name, promoted.user.author.id);
  }
  console.log(`Writers and columnists: ${[...authors.keys()].join(', ')}`);

  const publish = async (body: Json) => {
    const { post } = await admin('POST', '/api/admin/posts', body);
    await admin('POST', `/api/admin/posts/${post.id}/publish`);
    return post.id as string;
  };

  const recent: string[] = [];
  for (const [title, category, file, excerpt, writer] of TOP_NEWS) {
    const coverId = await picture('cover', file);
    recent.push(
      await publish({
        type: 'news',
        title,
        excerpt,
        content: html(ARTICLE),
        categoryId: categories.get(category),
        authorId: authors.get(writer),
        ...(coverId ? { coverId, coverAlt: title } : {}),
      }),
    );
    process.stdout.write('.');
  }
  await admin('POST', `/api/admin/posts/${recent[0]}/feature`);

  for (const [title, excerpt, columnist] of COLUMNS) {
    recent.push(await publish({ type: 'column', title, excerpt, content: html(ARTICLE.slice(0, 3)), authorId: authors.get(columnist) }));
    process.stdout.write('.');
  }

  const older: string[] = [];
  for (const [title, category, file] of OLDER_NEWS) {
    const coverId = await picture('cover', file);
    older.push(
      await publish({
        type: 'news',
        title,
        excerpt: 'Medida começa a valer nos próximos dias, segundo a administração.',
        content: html(SHORT_ARTICLE),
        categoryId: categories.get(category),
        authorId: authors.get('Ana Beatriz Lima'),
        ...(coverId ? { coverId, coverAlt: title } : {}),
      }),
    );
    process.stdout.write('.');
  }
  console.log('');

  // Everything was published in the last minute. Spread it over the past
  // hours and days, so the site shows "Hoje, 14:05", "Ontem"... as it will.
  const now = Date.now();
  const minutes = (n: number) => n * 60 * 1000;
  for (const [index, id] of recent.entries()) {
    await prisma.post.update({ where: { id }, data: { publishedAt: new Date(now - minutes(5 + index * 47)) } });
  }
  for (const [index, id] of older.entries()) {
    await prisma.post.update({ where: { id }, data: { publishedAt: new Date(now - minutes(60 * 26 + index * 190)) } });
  }

  console.log(`Published ${TOP_NEWS.length + OLDER_NEWS.length} news stories and ${COLUMNS.length} columns.`);
  console.log(`Columnists log in with ${COLUMNISTS.map((c) => c.email).join(' or ')}, password ${COLUMNIST_PASSWORD}.`);
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => disconnectDatabase());
