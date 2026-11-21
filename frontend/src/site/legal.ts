// The texts of /privacidade, /termos and /contato, in one place.
//
// Plain data, no React: the site (pages/LegalPages.tsx) draws them, and the
// Cloudflare Worker (worker/seo.ts) writes the same text into the HTML for
// Google, which checks these pages before approving AdSense.
//
// A paragraph is plain text. The only markup is a link: [words](/path),
// [words](https://...) or [words](mailto:...).
//
// The portal's owner is the one legally responsible for these texts: have
// them read before publishing, and update UPDATED_AT on every change.

// Where readers write. Shown on /contato, /privacidade and /termos.
export const CONTACT_EMAIL = 'portal100fronteiras1@gmail.com';

export const UPDATED_AT = '15 de novembro de 2026';

export type LegalSection = {
  id: string;
  title: string;
  paragraphs?: string[];
  items?: string[];
  // Text after the list.
  after?: string[];
};

export type LegalPage = {
  path: string;
  title: string;
  // For Google and for link previews.
  description: string;
  intro: string[];
  sections: LegalSection[];
};

const email = `[${CONTACT_EMAIL}](mailto:${CONTACT_EMAIL})`;

export const PRIVACY: LegalPage = {
  path: '/privacidade',
  title: 'Política de Privacidade',
  description:
    'Quais dados o Portal100Fronteiras coleta, para quê, com quem compartilha, por quanto tempo guarda e como você exerce os seus direitos pela LGPD.',
  intro: [
    'Esta política explica, em linguagem simples, quais dados pessoais o Portal100Fronteiras coleta, para que usa, com quem compartilha e como você pode consultar, corrigir ou apagar esses dados, conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018, a LGPD).',
    'Ler as notícias não exige cadastro. A maior parte dos dados abaixo só existe se você criar uma conta, comentar, nos escrever ou aceitar os cookies de medição.',
  ],
  sections: [
    {
      id: 'responsavel',
      title: '1. Quem é o responsável',
      paragraphs: [
        `O controlador dos dados é o Portal100Fronteiras, que publica este site. Para qualquer assunto sobre privacidade, inclusive para falar com o encarregado pelo tratamento de dados, escreva para ${email} ou use a página de [Contato](/contato).`,
      ],
    },
    {
      id: 'dados',
      title: '2. Quais dados coletamos',
      items: [
        'Cadastro: nome, e-mail e senha. A senha é guardada só de forma cifrada (Argon2): nem a equipe do portal consegue lê-la.',
        'Entrar com Google, se você escolher: o Google nos informa o seu nome, o seu e-mail (confirmado por ele) e um código que identifica a sua conta do Google. Não recebemos a sua senha do Google, seus contatos nem nada além disso. Na primeira vez, pedimos que você crie também uma senha do portal.',
        'Perfil, se você quiser preencher: foto e uma bio curta. Eles aparecem ao lado dos seus comentários.',
        'Comentários: o texto, a data e a conta que comentou. Comentários são públicos e mostram o seu nome e a sua foto.',
        'Login: um cookie de sessão que mantém você conectado (veja a seção 4).',
        'Redefinição de senha: quando você pede "Esqueci minha senha", guardamos um código cifrado do link enviado, que vale por 1 hora.',
        'Formulário de contato: nome, e-mail, assunto e mensagem. Eles são enviados por e-mail para a redação e não ficam guardados no banco de dados do site.',
        'Newsletter, só se você pedir: o seu e-mail, a situação da inscrição (aguardando confirmação, inscrito ou descadastrado), as datas do pedido, da confirmação e do descadastro, e quais edições foram enviadas para você. Não registramos se você abriu o e-mail nem em quais links clicou dentro dele.',
        'Notificações no celular ou no computador, só se você ativar: o endereço que o seu navegador cria no serviço de notificações dele (Google, Apple, Mozilla ou Microsoft) e duas chaves que servem para cifrar as mensagens, mais as datas de ativação e do último envio. Esse endereço não traz o seu nome nem o seu e-mail e não fica ligado à sua conta. Não registramos se você tocou na notificação.',
        'Medição de audiência (Google Analytics), só se você aceitar os cookies: páginas visitadas, tempo de leitura, tipo de aparelho e navegador, e cidade aproximada.',
        'Dados técnicos de acesso: como em qualquer site, o endereço IP, a data e a hora e o navegador passam pelos nossos servidores. São usados para entregar as páginas, para segurança (por exemplo, limitar tentativas de senha) e ficam nos registros dos provedores de hospedagem.',
        'Colunistas e autores: nome de assinatura, bio e foto são publicados junto com os textos que eles assinam.',
      ],
      after: [
        'A lista de matérias "Salvos", a escolha do modo noturno e a sua resposta ao aviso de cookies ficam guardadas só no seu navegador. Elas não são enviadas ao portal.',
        'Não coletamos dados sensíveis (como saúde, religião ou opinião política) por formulário. Evite escrever esse tipo de informação nos comentários, que são públicos.',
      ],
    },
    {
      id: 'finalidades',
      title: '3. Para que usamos os dados e com qual base legal',
      items: [
        'Manter a sua conta, permitir login, comentários e a página Minha conta: execução do serviço que você pediu ao se cadastrar (art. 7º, V, da LGPD).',
        'Enviar e-mails necessários, como o link para redefinir a senha e o aviso de senha alterada: execução do serviço.',
        'Responder mensagens enviadas pelo formulário de contato: atendimento ao seu pedido.',
        'Enviar a newsletter: somente com o seu consentimento (art. 7º, I). Ninguém é inscrito sem pedir: a inscrição só vale depois que você confirma pelo link enviado ao seu e-mail (quem entrou com o Google, que já confirmou o e-mail, ativa direto em Minha conta). Você pode retirar o consentimento quando quiser, pelo link "Descadastre-se" no fim de qualquer edição, pelo botão de cancelar inscrição do seu aplicativo de e-mail ou em [Minha conta](/minha-conta#newsletter), sem precisar explicar o motivo.',
        'Enviar notificações de notícias: somente com o seu consentimento (art. 7º, I). O site nunca pede a permissão sozinho: o navegador só pergunta depois que você clica em "Ativar notificações". Para retirar o consentimento, clique em "Desativar notificações" no rodapé do site (ou em [Minha conta](/minha-conta#notificacoes)), ou bloqueie as notificações do portal nas configurações do navegador ou do celular.',
        'Proteger o site contra abuso, fraude, robôs e invasões: legítimo interesse (art. 7º, IX) e cumprimento de obrigação legal.',
        'Medir a audiência com o Google Analytics: somente com o seu consentimento (art. 7º, I), que pode ser retirado a qualquer momento.',
        'Contar quantas vezes cada banner de anunciante foi visto e clicado, só em números totais, sem identificar quem viu ou clicou: legítimo interesse.',
      ],
      after: ['Não vendemos dados pessoais e não usamos os seus dados para publicidade direcionada.'],
    },
    {
      id: 'cookies',
      title: '4. Cookies e armazenamento no navegador',
      items: [
        'portal.sid (necessário): cookie de sessão criado só quando você entra na sua conta. Mantém o login por até 7 dias sem uso e é apagado quando você sai. Não pode ser lido por scripts da página.',
        'Google Analytics, _ga e _ga_* (opcionais): só são criados se você clicar em "Aceitar" no aviso de cookies. Servem para contar visitas e saber quais notícias são mais lidas. Duram até 2 anos, conforme o padrão do Google.',
        'Vídeos do YouTube: são incorporados no modo de privacidade reforçada (youtube-nocookie.com). O YouTube só pode gravar dados no seu navegador quando você dá o play.',
        'Armazenamento local do navegador: guarda a lista de Salvos, o modo noturno e a sua resposta ao aviso de cookies. Fica só no seu aparelho.',
        'Service worker (só se você ativar as notificações): um pequeno programa do portal que o navegador guarda para mostrar as notificações com o site fechado. Ele não lê as páginas que você visita nem guarda cópias delas, e deixa de funcionar quando você desativa as notificações ou apaga os dados do site.',
      ],
      after: [
        'Você pode mudar a sua escolha a qualquer momento no botão "Cookies", no rodapé de todas as páginas. Também pode apagar os cookies nas configurações do seu navegador.',
      ],
    },
    {
      id: 'compartilhamento',
      title: '5. Com quem compartilhamos',
      paragraphs: [
        'Usamos empresas especializadas para hospedar e operar o portal. Elas tratam os dados apenas para prestar o serviço contratado:',
      ],
      items: [
        'Cloudflare: hospedagem e entrega das páginas do site, e proteção contra ataques.',
        'Render: servidor e banco de dados onde ficam as contas e os comentários.',
        'Cloudinary: armazenamento e entrega das imagens e arquivos, incluindo a sua foto de perfil, se você enviar uma.',
        'Brevo: envio dos e-mails do portal (redefinição de senha, mensagens de contato, confirmação da newsletter e a própria newsletter).',
        'Serviços de notificação dos navegadores (Google Firebase Cloud Messaging, Apple, Mozilla e Microsoft, conforme o navegador que você usa): só se você ativar as notificações. Eles entregam a mensagem ao seu aparelho, que chega cifrada e só pode ser lida pelo seu navegador.',
        'Google: login com a conta do Google, só se você escolher essa opção; Google Analytics, só com o seu consentimento; e YouTube, nos vídeos incorporados às matérias. Ao entrar com o Google, o próprio Google fica sabendo que você entrou no portal, conforme a política de privacidade dele.',
      ],
      after: [
        'Anunciantes não recebem dados pessoais dos leitores: só o total de visualizações e de cliques dos seus banners.',
        'Também podemos fornecer dados quando houver ordem judicial ou obrigação legal.',
        'Algumas dessas empresas guardam dados em servidores fora do Brasil, como nos Estados Unidos. Essa transferência internacional é feita com as garantias previstas no art. 33 da LGPD, como cláusulas contratuais de proteção de dados.',
      ],
    },
    {
      id: 'publicidade',
      title: '6. Publicidade',
      paragraphs: [
        'O portal exibe banners de anunciantes locais, identificados como publicidade. Ao clicar em um banner, você vai para o site do anunciante, que tem a sua própria política de privacidade.',
        'Se o portal passar a exibir anúncios do Google (Google AdSense), o Google e outros fornecedores poderão usar cookies para mostrar anúncios com base nas suas visitas a este e a outros sites. Isso só acontecerá com o seu consentimento, pelo aviso de cookies, e você poderá desativar os anúncios personalizados em [Configurações de anúncios do Google](https://adssettings.google.com). Esta política será atualizada antes disso.',
      ],
    },
    {
      id: 'retencao',
      title: '7. Por quanto tempo guardamos',
      items: [
        'Conta e perfil, incluindo a ligação com a sua conta do Google: enquanto a conta existir.',
        'Comentários: até você apagá-los, excluir a conta ou a moderação removê-los.',
        'Sessão de login: até 7 dias sem uso, ou até você sair.',
        'Links de redefinição de senha: valem por 1 hora e só podem ser usados uma vez.',
        'Newsletter: enquanto você estiver inscrito. Se você se descadastrar, guardamos apenas o e-mail marcado como descadastrado, para garantir que nada mais seja enviado sem um novo pedido seu; se quiser que ele seja apagado de vez, peça pelo e-mail ou pela página de [Contato](/contato). Pedidos de inscrição que nunca foram confirmados não recebem nenhum e-mail além do de confirmação.',
        'Notificações: enquanto estiverem ativadas. Quando você desativa, o endereço é apagado na hora. Se você bloquear o site, desinstalar o navegador ou o endereço deixar de funcionar, ele é apagado no próximo envio.',
        'Mensagens de contato: na caixa de e-mail da redação, pelo tempo necessário para responder e acompanhar o assunto.',
        'Dados do Google Analytics: até 14 meses, e depois são apagados pelo Google.',
        'Registros técnicos de acesso: pelo prazo dos provedores de hospedagem e pelo exigido em lei, como o Marco Civil da Internet.',
      ],
    },
    {
      id: 'exclusao',
      title: '8. Excluir a sua conta',
      paragraphs: [
        'Você mesmo pode excluir a conta, a qualquer momento, no fim da página [Minha conta](/minha-conta), confirmando com a sua senha. Na hora, apagamos o seu nome, e-mail, senha, foto e bio, a ligação com a sua conta do Google e a inscrição na newsletter, e encerramos todas as sessões abertas. Para também tirar o acesso do portal no Google, acesse [Sua conta do Google → Segurança → Apps e serviços de terceiros](https://myaccount.google.com/connections).',
        'Os comentários que você escreveu continuam no ar, para não quebrar as conversas, mas passam a aparecer como "Conta excluída", sem nome nem foto. Se quiser que algum comentário também seja apagado, apague antes de excluir a conta ou escreva para nós.',
      ],
    },
    {
      id: 'direitos',
      title: '9. Os seus direitos',
      paragraphs: ['Pela LGPD (art. 18), você pode pedir a qualquer momento:'],
      items: [
        'confirmação de que tratamos dados seus e acesso a eles;',
        'correção de dados incompletos ou errados (nome, foto e bio você mesmo muda em Minha conta);',
        'anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em desacordo com a lei;',
        'portabilidade dos dados para outro serviço;',
        'eliminação dos dados tratados com o seu consentimento e informação sobre as consequências de não dar o consentimento;',
        'informação sobre com quem compartilhamos os seus dados;',
        'revogação do consentimento, pelo botão "Cookies" no rodapé.',
      ],
      after: [
        `Para fazer um pedido, escreva para ${email}, de preferência a partir do e-mail da sua conta. Respondemos em até 15 dias. Se não ficar satisfeito, você também pode reclamar à Autoridade Nacional de Proteção de Dados (ANPD), em [gov.br/anpd](https://www.gov.br/anpd).`,
      ],
    },
    {
      id: 'seguranca',
      title: '10. Segurança',
      paragraphs: [
        'O site funciona só com conexão segura (HTTPS). As senhas são guardadas cifradas, o cookie de login não pode ser lido por scripts, há limite de tentativas de login e o acesso ao painel da redação é restrito por perfil. Nenhum sistema é totalmente imune a falhas: se houver um incidente de segurança que possa causar risco a você, avisaremos os afetados e a ANPD, como manda a lei.',
      ],
    },
    {
      id: 'menores',
      title: '11. Crianças e adolescentes',
      paragraphs: [
        'O portal pode ser lido por qualquer pessoa, mas o cadastro e os comentários são destinados a maiores de 18 anos. Adolescentes só devem criar conta com a autorização de um responsável. Crianças não devem criar conta. Se você souber de uma conta criada por uma criança, avise-nos para que seja excluída.',
      ],
    },
    {
      id: 'mudancas',
      title: '12. Mudanças nesta política',
      paragraphs: [
        `Esta política pode mudar quando o portal mudar. A data da última atualização fica no topo da página e, em mudanças importantes, avisaremos no site. Última atualização: ${UPDATED_AT}.`,
      ],
    },
  ],
};

export const TERMS: LegalPage = {
  path: '/termos',
  title: 'Termos de Uso',
  description: 'As regras para usar o Portal100Fronteiras: conta, comentários, direitos sobre o conteúdo, publicidade e responsabilidades.',
  intro: [
    'Estes termos são as regras para usar o Portal100Fronteiras. Ao navegar no site ou criar uma conta, você concorda com eles e com a nossa [Política de Privacidade](/privacidade).',
  ],
  sections: [
    {
      id: 'portal',
      title: '1. O portal',
      paragraphs: [
        'O Portal100Fronteiras publica notícias produzidas pela sua redação, notícias de outros portais que permitem a reprodução (sempre com a fonte creditada) e colunas de opinião assinadas por colunistas. As colunas, identificadas em verde na seção Opinião, expressam a visão de quem assina e não necessariamente a do portal.',
        'A leitura é gratuita e não exige cadastro.',
      ],
    },
    {
      id: 'conta',
      title: '2. A sua conta',
      items: [
        'O cadastro é destinado a maiores de 18 anos. Adolescentes só podem se cadastrar com autorização de um responsável.',
        'Use o seu nome e um e-mail seu. Contas falsas ou que se passem por outra pessoa podem ser removidas.',
        'Você é responsável por manter a sua senha em segredo e pelo que for feito com a sua conta.',
        'Você pode excluir a sua conta quando quiser, em Minha conta.',
      ],
    },
    {
      id: 'comentarios',
      title: '3. Regras dos comentários',
      paragraphs: ['Os comentários são um espaço para debater as matérias com respeito. Não são permitidos comentários que:'],
      items: [
        'ofendam, ameacem, assediem ou exponham outras pessoas;',
        'tenham discurso de ódio, racismo ou qualquer discriminação;',
        'divulguem dados pessoais de terceiros, como telefone, endereço ou documentos;',
        'espalhem informações sabidamente falsas;',
        'façam propaganda, correntes, spam ou tragam links suspeitos;',
        'violem direitos autorais ou qualquer lei.',
      ],
      after: [
        'Quem escreve o comentário é responsável pelo que escreveu. A redação, os autores das matérias e os administradores podem remover comentários que descumpram estas regras, e contas que insistirem nisso podem ser desativadas.',
        'Viu um comentário que fere estas regras? Avise pela página de [Contato](/contato).',
      ],
    },
    {
      id: 'direitos-autorais',
      title: '4. Direitos sobre o conteúdo',
      paragraphs: [
        'Os textos, fotos, vídeos e o visual do portal são protegidos pela Lei de Direitos Autorais (Lei nº 9.610/1998) e pertencem ao Portal100Fronteiras ou aos seus autores.',
        'Compartilhar o link das matérias é livre e bem-vindo. Citar trechos curtos também, desde que com o crédito ao portal e o link para a matéria original. Reproduzir uma matéria inteira, ou as suas fotos, exige autorização por escrito.',
        'O comentário continua sendo seu. Ao publicá-lo, você autoriza o portal a exibi-lo junto com a matéria, sem custo, enquanto ele estiver no ar.',
      ],
    },
    {
      id: 'correcoes',
      title: '5. Correções e direito de resposta',
      paragraphs: [
        'Erramos? Pedimos que avise pela página de [Contato](/contato), escolhendo o assunto "Correção ou direito de resposta". Corrigimos as informações erradas e garantimos o direito de resposta nos termos da Lei nº 13.188/2015.',
      ],
    },
    {
      id: 'publicidade',
      title: '6. Publicidade e links para outros sites',
      paragraphs: [
        'Os banners exibidos no portal são de anunciantes e estão identificados como publicidade. O portal não vende os produtos anunciados e não responde por eles nem pelo conteúdo dos sites para os quais os anúncios e os links das matérias levam.',
        'Para anunciar no portal, escreva pela página de [Contato](/contato), assunto "Anunciar no portal".',
      ],
    },
    {
      id: 'responsabilidade',
      title: '7. Disponibilidade',
      paragraphs: [
        'Trabalhamos para que o site esteja sempre no ar, mas ele pode ficar fora do ar por manutenção ou por falhas técnicas, e funcionalidades podem mudar ou deixar de existir.',
      ],
    },
    {
      id: 'lei',
      title: '8. Lei aplicável',
      paragraphs: [
        'Estes termos seguem as leis brasileiras, em especial o Marco Civil da Internet (Lei nº 12.965/2014), a LGPD e o Código de Defesa do Consumidor. Qualquer questão pode ser levada ao foro do domicílio do leitor.',
      ],
    },
    {
      id: 'mudancas',
      title: '9. Mudanças nestes termos',
      paragraphs: [
        `Os termos podem ser atualizados. A versão em vigor é sempre a desta página. Última atualização: ${UPDATED_AT}. Dúvidas: ${email}.`,
      ],
    },
  ],
};

// The text part of /contato (the form is drawn by the page itself).
export const CONTACT = {
  path: '/contato',
  title: 'Contato',
  description: 'Fale com a redação do Portal100Fronteiras: sugestões de pauta, correções, anúncios e pedidos sobre os seus dados.',
  intro: [
    'Quer sugerir uma pauta, apontar um erro, anunciar no portal ou fazer um pedido sobre os seus dados? Fale com a redação pelo formulário abaixo ou pelo e-mail.',
  ],
  topics: [
    'Sugestão de pauta: conte o que aconteceu, onde e quando. Se puder, deixe um jeito de falarmos com você.',
    'Correção ou direito de resposta: diga qual matéria e o que está errado.',
    'Anunciar no portal: diga o nome do seu negócio e um telefone para contato.',
    'Privacidade e dados pessoais: pedidos de acesso, correção ou exclusão, como explicado na [Política de Privacidade](/privacidade).',
  ],
};

// "[words](href)" → pieces, for both the React page and the Worker.
export type Piece = { text: string; href?: string };

export function pieces(paragraph: string): Piece[] {
  const out: Piece[] = [];
  const pattern = /\[([^\]]+)\]\(([^)\s]+)\)/g;
  let last = 0;
  for (const match of paragraph.matchAll(pattern)) {
    if (match.index > last) out.push({ text: paragraph.slice(last, match.index) });
    out.push({ text: match[1]!, href: match[2]! });
    last = match.index + match[0].length;
  }
  if (last < paragraph.length) out.push({ text: paragraph.slice(last) });
  return out;
}
