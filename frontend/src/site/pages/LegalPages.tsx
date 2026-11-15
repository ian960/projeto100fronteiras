import { useState } from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router';
import { Alert, Button, SelectField, TextArea, TextField } from '../../components/ui';
import { ApiError, post } from '../../lib/api';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import { CONTACT, CONTACT_EMAIL, PRIVACY, TERMS, UPDATED_AT, pieces, type LegalPage } from '../legal';

// /privacidade, /termos and /contato. The words live in ../legal.ts, shared
// with the Worker, which writes them into the HTML for Google.

const link = 'font-medium text-anil hover:underline underline-offset-4';

// A paragraph from legal.ts: plain text with [words](href) links.
function Rich({ text }: { text: string }) {
  return (
    <>
      {pieces(text).map((piece, index) => {
        if (!piece.href) return piece.text;
        if (piece.href.startsWith('/')) {
          return (
            <Link key={index} to={piece.href} className={link}>
              {piece.text}
            </Link>
          );
        }
        const external = piece.href.startsWith('http');
        return (
          <a key={index} href={piece.href} className={link} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
            {piece.text}
          </a>
        );
      })}
    </>
  );
}

function Paragraphs({ list }: { list?: string[] }) {
  return list?.map((text) => (
    <p key={text} className="mt-4">
      <Rich text={text} />
    </p>
  ));
}

function PageHeader({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <header className="border-b-2 border-anil pb-4">
      <h1 className="titulo text-4xl text-anil sm:text-5xl">{title}</h1>
      {children}
    </header>
  );
}

function LegalDocument({ page }: { page: LegalPage }) {
  useDocumentTitle(page.title);

  return (
    <article className="mx-auto max-w-3xl py-4 sm:py-8">
      <PageHeader title={page.title}>
        <p className="mt-3 text-sm text-tinta-suave">Última atualização: {UPDATED_AT}</p>
      </PageHeader>

      <div className="mt-6 text-[1.0625rem] leading-relaxed">
        <Paragraphs list={page.intro} />
      </div>

      {/* Long page: the reader jumps to the part they came for. */}
      <nav aria-label="Nesta página" className="mt-8 rounded-lg bg-superficie p-5">
        <p className="text-sm font-semibold uppercase tracking-wide text-tinta-suave">Nesta página</p>
        <ol className="mt-3 grid gap-x-6 gap-y-1.5 text-[0.9375rem] sm:grid-cols-2">
          {page.sections.map((section) => (
            <li key={section.id}>
              <a href={`#${section.id}`} className="hover:text-anil hover:underline underline-offset-4">
                {section.title}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="mt-4 text-[1.0625rem] leading-relaxed">
        {page.sections.map((section) => (
          <section key={section.id} id={section.id} className="scroll-mt-20 pt-8">
            <h2 className="titulo text-2xl text-anil">{section.title}</h2>
            <Paragraphs list={section.paragraphs} />
            {section.items && (
              <ul className="mt-4 flex list-disc flex-col gap-2 pl-6 marker:text-anil">
                {section.items.map((item) => (
                  <li key={item}>
                    <Rich text={item} />
                  </li>
                ))}
              </ul>
            )}
            <Paragraphs list={section.after} />
          </section>
        ))}
      </div>
    </article>
  );
}

export function PrivacyPage() {
  return <LegalDocument page={PRIVACY} />;
}

export function TermsPage() {
  return <LegalDocument page={TERMS} />;
}

// Same keys as the API's CONTACT_SUBJECTS (backend contact.schemas.ts).
const SUBJECTS = [
  ['pauta', 'Sugestão de pauta'],
  ['correcao', 'Correção ou direito de resposta'],
  ['anuncio', 'Anunciar no portal'],
  ['privacidade', 'Privacidade e dados pessoais'],
  ['outro', 'Outro assunto'],
] as const;

export function ContactPage() {
  useDocumentTitle(CONTACT.title);
  const { data: me } = useMe();
  // name and e-mail start as null ("not typed yet"), so a logged-in reader
  // sees their own already filled in, and can still change or clear them.
  const [form, setForm] = useState<{ name: string | null; email: string | null; subject: string; message: string; website: string }>({
    name: null,
    email: null,
    subject: 'pauta',
    message: '',
    website: '',
  });
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const name = form.name ?? me?.name ?? '';
  const email = form.email ?? me?.email ?? '';

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/contact', { ...form, name, email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Algo deu errado.'));
    } finally {
      setBusy(false);
    }
  }

  const set = (field: keyof typeof form) => (event: { target: { value: string } }) => setForm({ ...form, [field]: event.target.value });

  return (
    <div className="mx-auto max-w-3xl py-4 sm:py-8">
      <PageHeader title={CONTACT.title} />

      <div className="mt-6 grid gap-10 md:grid-cols-[1fr_16rem]">
        <div>
          <div className="text-[1.0625rem] leading-relaxed">
            <Paragraphs list={CONTACT.intro} />
          </div>

          {sent ? (
            <div className="mt-8">
              <Alert tone="ok">
                <p className="font-semibold">Mensagem enviada. Obrigado!</p>
                <p className="mt-1">A redação lê todas as mensagens e responde pelo e-mail que você informou, quando for o caso.</p>
              </Alert>
              <Button
                variant="secundario"
                className="mt-4"
                onClick={() => {
                  setForm({ ...form, message: '' });
                  setSent(false);
                }}
              >
                Enviar outra mensagem
              </Button>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 flex flex-col gap-5" noValidate>
              {error && Object.keys(error.fields).length === 0 && <Alert>{error.message}</Alert>}
              <div className="grid gap-5 sm:grid-cols-2">
                <TextField label="Nome" autoComplete="name" value={name} onChange={set('name')} error={error?.fields.name} required maxLength={100} />
                <TextField
                  label="E-mail"
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={set('email')}
                  error={error?.fields.email}
                  hint="Só para responder você."
                  required
                  maxLength={200}
                />
              </div>
              <SelectField label="Assunto" value={form.subject} onChange={set('subject')} error={error?.fields.subject}>
                {SUBJECTS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </SelectField>
              <TextArea label="Mensagem" rows={7} value={form.message} onChange={set('message')} error={error?.fields.message} required maxLength={5000} />
              {/* The robot trap: hidden from people and from screen readers.
                  A form-filling script fills it, and the API drops the message. */}
              <div aria-hidden="true" className="absolute left-[-10000px] h-px w-px overflow-hidden">
                <label>
                  Site
                  <input type="text" name="website" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
                </label>
              </div>
              <p className="text-sm text-tinta-suave">
                Os seus dados são usados só para responder a sua mensagem. Veja a{' '}
                <Link to="/privacidade" className={link}>
                  Política de Privacidade
                </Link>
                .
              </p>
              <div>
                <Button type="submit" busy={busy} className="h-11 px-6">
                  Enviar mensagem
                </Button>
              </div>
            </form>
          )}
        </div>

        <aside className="flex flex-col gap-6 text-[0.9375rem] leading-relaxed md:border-l md:border-linha md:pl-6">
          <div>
            <h2 className="titulo text-xl text-anil">E-mail</h2>
            <p className="mt-2 break-all">
              <a href={`mailto:${CONTACT_EMAIL}`} className={link}>
                {CONTACT_EMAIL}
              </a>
            </p>
          </div>
          <div>
            <h2 className="titulo text-xl text-anil">Sobre o que escrever</h2>
            <ul className="mt-2 flex flex-col gap-2">
              {CONTACT.topics.map((topic) => (
                <li key={topic}>
                  <Rich text={topic} />
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}
