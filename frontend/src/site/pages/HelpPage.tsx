import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Avatar, Button, ButtonLink, cx } from '../../components/ui';
import { useDocumentTitle } from '../../lib/hooks';
import { SectionHeading } from '../parts';

// "Ajuda": every feature of the site explained, each one next to a copy of
// how it looks on the site. The copies are drawn with the site's own pieces
// and styles, but they do nothing when clicked (they are pictures).

type Question = { q: string; a: ReactNode };
type Topic = { id: string; title: string; tone?: 'anil' | 'mata'; preview?: ReactNode; questions: Question[] };

const pill = 'inline-flex h-9 items-center gap-2 rounded-full border px-3.5 text-sm font-medium';
const link = 'font-medium text-anil hover:underline underline-offset-4';

// A frame that says "this is what you will see". Not clickable on purpose.
function Preview({ children, caption }: { children: ReactNode; caption: string }) {
  return (
    <figure className="mt-5 overflow-hidden rounded-lg border border-linha">
      <div aria-hidden="true" inert className="pointer-events-none select-none bg-papel p-4 sm:p-5">
        {children}
      </div>
      <figcaption className="border-t border-linha bg-superficie px-4 py-2 text-xs text-tinta-suave">{caption}</figcaption>
    </figure>
  );
}

function FakeField({ label, value, type = 'text' }: { label: string; value: string; type?: string }) {
  return (
    <div>
      <p className="mb-1 text-sm font-medium">{label}</p>
      <div className="flex h-10 items-center rounded-md border border-linha bg-papel px-3 text-[0.9375rem] text-tinta-suave">
        {type === 'password' ? '••••••••' : value}
      </div>
    </div>
  );
}

const loginPreview = (
  <div className="mx-auto max-w-sm">
    <p className="titulo mb-4 text-2xl text-anil">Entrar</p>
    <div className="flex flex-col gap-3">
      <FakeField label="E-mail" value="voce@email.com" />
      <FakeField label="Senha" value="" type="password" />
      <p className="text-right text-sm">
        <span className={link}>Esqueci minha senha</span>
      </p>
      <Button tabIndex={-1}>Entrar</Button>
      <p className="text-center text-sm text-tinta-suave">
        Ainda não tem conta? <span className={link}>Criar conta</span>
      </p>
    </div>
  </div>
);

const postActionsPreview = (
  <div className="flex flex-wrap gap-2">
    <span className={cx(pill, 'border-linha')}>
      <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
        <path d="M4 2.5h8v11l-4-2.8-4 2.8z" strokeLinejoin="round" />
      </svg>
      Salvar para ler depois
    </span>
    <span className={cx(pill, 'border-linha')}>Enviar no WhatsApp</span>
    <span className={cx(pill, 'border-linha')}>Copiar link</span>
  </div>
);

function FakeComment({ name, badge, badgeClass, text, edited, reply }: {
  name: string;
  badge?: string;
  badgeClass?: string;
  text: string;
  edited?: boolean;
  reply?: boolean;
}) {
  return (
    <div className={cx('flex gap-3', reply && 'ml-10 border-l-2 border-linha pl-4')}>
      <Avatar name={name} size={36} />
      <div className="min-w-0">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="font-semibold">{name}</span>
          {badge && <span className={cx('rounded-full px-2 py-0.5 text-xs font-medium', badgeClass)}>{badge}</span>}
          <span className="text-sm text-tinta-suave">há 2 horas{edited && ' · editado em 14/11, 10:32'}</span>
        </p>
        <p className="mt-1 text-[0.9375rem] leading-relaxed">{text}</p>
        <p className="mt-1 flex gap-4 text-sm text-tinta-suave">
          <span>Responder</span>
          {edited && <span>Editar</span>}
          {edited && <span>Excluir</span>}
        </p>
      </div>
    </div>
  );
}

const commentsPreview = (
  <div>
    <SectionHeading>Comentários (3)</SectionHeading>
    <div className="mt-4 flex flex-col gap-5">
      <FakeComment name="Maria Souza" text="Ótima matéria, não sabia desse detalhe da obra." edited />
      <FakeComment
        name="Carlos Lima"
        badge="Autor da matéria"
        badgeClass="bg-superficie text-anil"
        text="Obrigado, Maria! A segunda parte sai na semana que vem."
        reply
      />
      <FakeComment name="Equipe do Portal" badge="Administrador" badgeClass="bg-anil text-sobre-anil" text="Lembrando: comentários ofensivos são removidos." />
    </div>
  </div>
);

const accountPreview = (
  <div className="flex items-center gap-4">
    <Avatar name="Maria Souza" size={56} />
    <div className="min-w-0 flex-1">
      <p className="titulo text-2xl text-anil">Minha conta</p>
      <p className="text-sm text-tinta-suave">maria@email.com · Leitor</p>
    </div>
    <span className="hidden sm:inline-flex">
      <Button tabIndex={-1} variant="secundario" small>
        Salvar
      </Button>
    </span>
  </div>
);

const opinionPreview = (
  <div>
    <SectionHeading tone="mata">Opinião</SectionHeading>
    <div className="mt-4 flex items-start gap-3">
      <Avatar name="Ana Ribeiro" size={44} />
      <div>
        <p className="text-sm font-semibold text-mata">Ana Ribeiro</p>
        <p className="titulo text-lg leading-snug">O que a fronteira ensina sobre o resto do país</p>
      </div>
    </div>
  </div>
);

const topics: Topic[] = [
  {
    id: 'conta',
    title: 'Criar conta e entrar',
    preview: <Preview caption="A tela de entrar (Entrar, no topo do site)">{loginPreview}</Preview>,
    questions: [
      {
        q: 'Preciso de conta para ler as notícias?',
        a: 'Não. Todas as notícias e colunas são abertas. A conta serve para comentar e para ter a sua página "Minha conta".',
      },
      {
        q: 'Como crio uma conta?',
        a: (
          <>
            Clique em <strong>Entrar</strong>, no topo, e depois em <strong>Criar conta</strong>. Basta nome, e-mail e uma senha com
            pelo menos 8 caracteres. Ou vá direto para <Link to="/cadastro" className={link}>a página de cadastro</Link>.
          </>
        ),
      },
      {
        q: 'Esqueci minha senha. E agora?',
        a: (
          <>
            Na tela de entrar, clique em <strong>Esqueci minha senha</strong> e digite o seu e-mail. Chega um e-mail com um botão para
            escolher uma senha nova. O link vale por 1 hora e só funciona uma vez. Se não chegar, olhe a caixa de spam.
          </>
        ),
      },
      {
        q: 'Quero ser colunista. Como faço?',
        a: 'Crie a sua conta normalmente e fale com a equipe do portal. Quem transforma uma conta em colunista é o administrador.',
      },
    ],
  },
  {
    id: 'ler',
    title: 'Ler, buscar e salvar',
    preview: <Preview caption="Os botões que aparecem no começo de cada matéria">{postActionsPreview}</Preview>,
    questions: [
      {
        q: 'Como encontro uma notícia?',
        a: (
          <>
            Use as editorias na barra azul abaixo do nome do portal, a lista de <Link to="/noticias" className={link}>Últimas</Link>, ou
            a lupa no topo para <Link to="/busca" className={link}>buscar</Link> por qualquer palavra.
          </>
        ),
      },
      {
        q: 'O que é "Salvar para ler depois"?',
        a: (
          <>
            Guarda a matéria na sua lista de <Link to="/salvos" className={link}>Salvos</Link>. A lista fica neste navegador, sem
            precisar de conta: em outro aparelho ou navegador ela começa vazia.
          </>
        ),
      },
      {
        q: 'A barrinha no topo da matéria é o quê?',
        a: 'Mostra quanto da leitura já foi. Ao lado do autor aparece também o tempo estimado de leitura.',
      },
      {
        q: 'Tem modo escuro?',
        a: 'Tem. Clique na lua, ao lado da lupa, ou em "Modo noturno" no rodapé (no celular). O site lembra a sua escolha.',
      },
    ],
  },
  {
    id: 'compartilhar',
    title: 'Compartilhar',
    questions: [
      {
        q: 'Como mando uma matéria para alguém?',
        a: (
          <>
            No começo e no fim de cada matéria há <strong>Enviar no WhatsApp</strong>, que já abre a conversa com o título e o link, e{' '}
            <strong>Copiar link</strong>, para colar onde quiser (Instagram, Facebook, e-mail...).
          </>
        ),
      },
      {
        q: 'O link aparece com foto quando compartilho?',
        a: 'Sim. O WhatsApp e as redes mostram o título, o resumo e a foto de capa da matéria.',
      },
    ],
  },
  {
    id: 'comentarios',
    title: 'Comentários',
    preview: <Preview caption="Os comentários, no fim de cada notícia ou coluna">{commentsPreview}</Preview>,
    questions: [
      {
        q: 'Como comento?',
        a: 'Entre na sua conta e role até o fim da matéria. Escreva no campo "Escreva um comentário" e clique em Comentar. Para responder alguém, clique em Responder embaixo do comentário.',
      },
      {
        q: 'Posso usar negrito, links ou fotos?',
        a: 'Não. Os comentários aceitam só texto simples, até 2.000 caracteres.',
      },
      {
        q: 'Posso editar ou apagar o que escrevi?',
        a: 'Sim, pelos botões Editar e Excluir no seu comentário. Um comentário editado mostra a data em que foi alterado.',
      },
      {
        q: 'O que são as etiquetas ao lado do nome?',
        a: (
          <>
            <strong>Autor da matéria</strong> ou <strong>Autor da coluna</strong> é quem escreveu o texto. <strong>Administrador</strong> é
            a equipe do portal. Leitores não têm etiqueta.
          </>
        ),
      },
      {
        q: 'Quem pode apagar comentários?',
        a: 'Quem escreveu, o autor da notícia ou coluna (nos comentários dela) e os administradores (em qualquer matéria).',
      },
    ],
  },
  {
    id: 'colunas',
    title: 'Colunas de opinião',
    tone: 'mata',
    preview: <Preview caption="As colunas aparecem em verde, na seção Opinião">{opinionPreview}</Preview>,
    questions: [
      {
        q: 'Qual a diferença entre notícia e coluna?',
        a: 'Notícias são da redação. Colunas, em verde, são textos de opinião assinados pelos colunistas e representam a visão de quem assina.',
      },
      {
        q: 'Onde vejo todos os colunistas?',
        a: (
          <>
            Em <Link to="/colunistas" className={link}>Opinião</Link>, na barra de editorias. Clicando no nome de um colunista você vê
            todas as colunas dele.
          </>
        ),
      },
      {
        q: 'Como um colunista publica?',
        a: 'Pelo Painel (botão no topo, para quem é colunista). A coluna é enviada para revisão e o administrador aprova antes de ela ir ao ar.',
      },
    ],
  },
  {
    id: 'minha-conta',
    title: 'Minha conta',
    preview: <Preview caption="O topo da página Minha conta">{accountPreview}</Preview>,
    questions: [
      {
        q: 'O que dá para mudar?',
        a: (
          <>
            Em <Link to="/minha-conta" className={link}>Minha conta</Link> você muda o nome, a foto e a bio que aparecem nos seus
            comentários, e a sua senha.
          </>
        ),
      },
      {
        q: 'Esqueci a senha atual e quero trocar.',
        a: 'Em Trocar senha, clique em "Receber um link por e-mail". O link chega no e-mail da sua conta.',
      },
      {
        q: 'Como excluo a minha conta?',
        a: 'No fim de Minha conta, em Excluir conta, confirme com a sua senha. Os seus dados pessoais são apagados; os comentários ficam como "Conta excluída".',
      },
    ],
  },
];

export default function HelpPage() {
  useDocumentTitle('Ajuda');

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-8">
      <h1 className="titulo text-4xl text-anil">Ajuda</h1>
      <p className="mt-3 text-lg leading-relaxed text-tinta-suave">
        Tudo o que dá para fazer no Portal100Fronteiras, com as telas de cada coisa.
      </p>

      <nav aria-label="Assuntos" className="mt-6 flex flex-wrap gap-2">
        {topics.map((topic) => (
          <a key={topic.id} href={`#${topic.id}`} className={cx(pill, 'border-linha text-tinta hover:border-tinta-suave')}>
            {topic.title}
          </a>
        ))}
      </nav>

      <div className="mt-12 flex flex-col gap-14">
        {topics.map((topic) => (
          <section key={topic.id} id={topic.id} className="scroll-mt-20">
            <SectionHeading tone={topic.tone}>{topic.title}</SectionHeading>
            {topic.preview}
            <div className="mt-5 divide-y divide-linha border-y border-linha">
              {topic.questions.map((item) => (
                <details key={item.q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-3 font-medium hover:text-anil [&::-webkit-details-marker]:hidden">
                    {item.q}
                    <span aria-hidden="true" className="text-xl leading-none text-tinta-suave transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <div className="pb-4 text-[0.9375rem] leading-relaxed text-tinta">{item.a}</div>
                </details>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-16 rounded-lg bg-superficie p-6 text-center">
        <p className="titulo text-xl">Não achou o que procurava?</p>
        <p className="mt-2 text-tinta-suave">Comente em qualquer matéria ou fale com a equipe do portal.</p>
        <div className="mt-5 flex justify-center gap-3">
          <ButtonLink to="/">Voltar para o início</ButtonLink>
        </div>
      </div>
    </div>
  );
}
