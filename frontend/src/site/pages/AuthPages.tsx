import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, TextField } from '../../components/ui';
import { ApiError, post } from '../../lib/api';
import { useChangePassword, useDeleteMe, useDocumentTitle, useHealth, useLogin, useLogout, useMe } from '../../lib/hooks';
import type { User } from '../../lib/types';

function canUsePanel(user: Pick<User, 'role'>) {
  return user.role === 'admin' || user.role === 'columnist';
}

// Where to go after logging in. Readers never land on the panel, even when
// ?proxima= points there: they go to the home page instead.
function afterLogin(user: Pick<User, 'role'> | null | undefined, next: string | null) {
  const staff = !!user && canUsePanel(user);
  if (next && (staff || !next.startsWith('/painel'))) return next;
  return staff ? '/painel' : '/';
}

// Only same-site paths are accepted as ?proxima=, so the login page cannot be
// used to bounce someone to another website.
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
}

// What /api/auth/google/callback says when it sends the reader back here.
const GOOGLE_ERRORS: Record<string, string> = {
  google: 'Não foi possível entrar com o Google. Tente de novo.',
  'google-desativada': 'Esta conta está desativada. Fale com a equipe do portal.',
  'google-outra-conta': 'Este e-mail já está ligado a outra conta do Google. Entre com essa conta ou com a sua senha.',
  'google-indisponivel': 'O login com Google não está disponível agora. Use e-mail e senha.',
};

// "Entrar com Google": a plain link, not fetch. The whole page goes to Google
// and comes back logged in (backend: modules/auth/auth.google.ts). Hidden
// while the API has no Google keys.
function GoogleButton({ next, label }: { next: string | null; label: string }) {
  const { data: health } = useHealth();
  if (!health?.googleLogin) return null;

  const href = `/api/auth/google${next ? `?proxima=${encodeURIComponent(next)}` : ''}`;

  return (
    <>
      <a
        href={href}
        className="inline-flex h-11 w-full items-center justify-center gap-3 rounded-md border border-linha bg-papel px-4 text-[0.9375rem] font-medium text-tinta transition-colors hover:bg-superficie"
      >
        <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        {label}
      </a>
      <div className="flex items-center gap-3 text-sm text-tinta-suave">
        <span className="h-px flex-1 bg-linha" />
        ou
        <span className="h-px flex-1 bg-linha" />
      </div>
    </>
  );
}

function AuthCard({ title, children, footer }: { title: string; children: React.ReactNode; footer: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-md py-6 sm:py-12">
      <h1 className="titulo text-4xl text-anil">{title}</h1>
      <div className="mt-8">{children}</div>
      <div className="mt-8 border-t border-linha pt-5 text-[0.9375rem] text-tinta-suave">{footer}</div>
    </div>
  );
}

export function LoginPage() {
  useDocumentTitle('Entrar');
  const [params] = useSearchParams();
  const next = safeNext(params.get('proxima'));
  const navigate = useNavigate();
  const { data: me } = useMe();
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  if (me) return <Navigate to={afterLogin(me, next)} replace />;

  const googleError = GOOGLE_ERRORS[params.get('erro') ?? ''];

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (data) => {
          const user = (data as { user: Pick<User, 'role'> }).user;
          navigate(afterLogin(user, next), { replace: true });
        },
      },
    );
  }

  const error = login.error instanceof ApiError ? login.error : null;

  return (
    <AuthCard
      title="Entrar"
      footer={
        <>
          Ainda não tem conta?{' '}
          <Link to="/cadastro" className="font-medium text-anil hover:underline underline-offset-4">
            Criar conta
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {googleError && !error && <Alert>{googleError}</Alert>}
        <GoogleButton next={next} label="Entrar com Google" />
        {error && error.status !== 422 && <Alert>{error.message}</Alert>}
        <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error?.fields.email} required />
        <TextField
          label="Senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error?.fields.password}
          required
        />
        <Button type="submit" busy={login.isPending} className="mt-1 h-11">
          Entrar
        </Button>
        <p className="text-sm">
          <Link to="/esqueci-senha" className="font-medium text-anil hover:underline underline-offset-4">
            Esqueci minha senha
          </Link>
        </p>
      </form>
    </AuthCard>
  );
}

export function RegisterPage() {
  useDocumentTitle('Criar conta');
  const client = useQueryClient();
  const { data: me } = useMe();
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  // Unticked: the newsletter is always the reader's own choice.
  const [newsletter, setNewsletter] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (me && !done) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/register', { ...form, newsletter });
      // Mark done before the session refresh lands, or the redirect for
      // logged-in visitors would fire first.
      setDone(true);
      void client.invalidateQueries({ queryKey: ['me'] });
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Algo deu errado.'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <AuthCard title="Conta criada" footer={<Link to="/" className="font-medium text-anil hover:underline underline-offset-4">Ir para a página inicial</Link>}>
        <p className="text-lg leading-relaxed">
          Sua conta foi criada com sucesso. Seja bem-vindo!
        </p>
        {newsletter && (
          <p className="mt-3 text-tinta-suave">
            Para começar a receber a newsletter, confirme pelo link que enviamos para {form.email.trim()}.
          </p>
        )}
      </AuthCard>
    );
  }

  const field = (name: keyof typeof form) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => setForm({ ...form, [name]: event.target.value }),
    error: error?.fields[name],
  });

  return (
    <AuthCard
      title="Criar conta"
      footer={
        <>
          Já tem conta?{' '}
          <Link to="/entrar" className="font-medium text-anil hover:underline underline-offset-4">
            Entrar
          </Link>
        </>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <GoogleButton next={null} label="Criar conta com Google" />
        {error && Object.keys(error.fields).length === 0 && (
          <Alert>{error.code === 'CONFLICT' ? 'Este e-mail já tem conta. Use “Entrar”.' : error.message}</Alert>
        )}
        <TextField label="Nome" autoComplete="name" {...field('name')} required />
        <TextField label="E-mail" type="email" autoComplete="email" {...field('email')} required />
        <TextField label="Senha" type="password" autoComplete="new-password" hint="Pelo menos 8 caracteres." {...field('password')} required />
        <Checkbox
          label="Quero receber a newsletter por e-mail"
          hint="Opcional. Enviamos um link para confirmar, e você desliga quando quiser em Minha conta."
          checked={newsletter}
          onChange={setNewsletter}
        />
        <p className="text-sm text-tinta-suave">
          Ao criar a conta, você concorda com os{' '}
          <Link to="/termos" className="font-medium text-anil hover:underline underline-offset-4">
            Termos de uso
          </Link>{' '}
          e com a{' '}
          <Link to="/privacidade" className="font-medium text-anil hover:underline underline-offset-4">
            Política de Privacidade
          </Link>
          .
        </p>
        <Button type="submit" busy={busy} className="mt-1 h-11">
          Criar conta
        </Button>
      </form>
    </AuthCard>
  );
}

// "Esqueci minha senha": always the same answer, account or not (the API
// does the same), so the form cannot tell anyone who is registered.
export function ForgotPasswordPage() {
  useDocumentTitle('Esqueci minha senha');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Algo deu errado.'));
    } finally {
      setBusy(false);
    }
  }

  const footer = (
    <Link to="/entrar" className="font-medium text-anil hover:underline underline-offset-4">
      Voltar para o login
    </Link>
  );

  if (sent) {
    return (
      <AuthCard title="Confira seu e-mail" footer={footer}>
        <p className="text-lg leading-relaxed">
          Se existir uma conta com <strong>{email.trim()}</strong>, enviamos um link para escolher uma senha nova. Ele vale por 1 hora.
        </p>
        <p className="mt-4 text-tinta-suave">Não chegou? Olhe a caixa de spam ou peça de novo daqui a alguns minutos.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Esqueci minha senha" footer={footer}>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <p className="text-tinta-suave">Digite o e-mail da sua conta e enviaremos um link para você escolher uma senha nova.</p>
        {error && error.status !== 422 && <Alert>{error.message}</Alert>}
        <TextField label="E-mail" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} error={error?.fields.email} required />
        <Button type="submit" busy={busy} disabled={!email.trim()} className="mt-1 h-11">
          Enviar link
        </Button>
      </form>
    </AuthCard>
  );
}

// The page the e-mail links to: /redefinir-senha?token=...
export function ResetPasswordPage() {
  useDocumentTitle('Nova senha');
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const client = useQueryClient();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await post('/auth/reset-password', { token, newPassword: password });
      // Any session this browser had is gone on the server too.
      client.setQueryData(['me'], null);
      setDone(true);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(0, 'UNKNOWN', 'Algo deu errado.'));
    } finally {
      setBusy(false);
    }
  }

  const askAgain = (
    <Link to="/esqueci-senha" className="font-medium text-anil hover:underline underline-offset-4">
      Pedir um link novo
    </Link>
  );

  if (!token || error?.fields.token) {
    return (
      <AuthCard title="Link inválido" footer={askAgain}>
        <p className="text-lg leading-relaxed">Este link não vale mais: ele expira em 1 hora e só pode ser usado uma vez.</p>
      </AuthCard>
    );
  }

  if (done) {
    return (
      <AuthCard
        title="Senha alterada"
        footer={
          <Link to="/entrar" className="font-medium text-anil hover:underline underline-offset-4">
            Entrar com a senha nova
          </Link>
        }
      >
        <p className="text-lg leading-relaxed">Pronto! Sua senha foi trocada, e por segurança todos os aparelhos foram desconectados.</p>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Escolha uma senha nova" footer={askAgain}>
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        {error && error.status !== 422 && <Alert>{error.message}</Alert>}
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={error?.fields.newPassword}
          hint="Pelo menos 8 caracteres."
          required
        />
        <TextField
          label="Repita a nova senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'As senhas não são iguais.' : undefined}
          required
        />
        <Button type="submit" busy={busy} disabled={password.length < 8 || confirm !== password} className="mt-1 h-11">
          Salvar senha nova
        </Button>
      </form>
    </AuthCard>
  );
}

// Required right after the first "Entrar com Google": an account with no
// password cannot do anything else until it has one (the API answers 403
// PASSWORD_REQUIRED, and the site sends the person here). Afterwards they can
// enter with Google or with e-mail and password.
export function CreatePasswordPage() {
  useDocumentTitle('Crie sua senha');
  const [params] = useSearchParams();
  const next = safeNext(params.get('proxima'));
  const navigate = useNavigate();
  const { data: me, isPending } = useMe();
  const create = useChangePassword();
  const logout = useLogout();
  const deleteMe = useDeleteMe();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [armed, setArmed] = useState(false);

  if (isPending) return null;
  if (!me) return <Navigate to="/entrar" replace />;
  if (me.hasPassword !== false && !create.isSuccess) {
    return <Navigate to={afterLogin(me, next)} replace />;
  }

  const mismatch = confirm.length > 0 && confirm !== password;
  const errors = create.error instanceof ApiError ? create.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    create.mutate(
      { newPassword: password },
      { onSuccess: () => navigate(afterLogin(me, next), { replace: true }) },
    );
  }

  return (
    <AuthCard
      title="Crie sua senha"
      footer={
        <div className="flex flex-col gap-3">
          <p>
            Não quer continuar?{' '}
            <button
              type="button"
              onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) })}
              className="font-medium text-anil hover:underline underline-offset-4"
            >
              Sair
            </button>{' '}
            ou{' '}
            <button
              type="button"
              onClick={() => (armed ? deleteMe.mutate(undefined, { onSuccess: () => navigate('/', { replace: true }) }) : setArmed(true))}
              disabled={deleteMe.isPending}
              className="font-medium text-alerta hover:underline underline-offset-4"
            >
              {armed ? 'Sim, excluir minha conta de vez' : 'excluir a conta'}
            </button>
            .
          </p>
          {armed && <Alert tone="aviso">Tem certeza? Clique de novo para excluir. Não dá para desfazer.</Alert>}
          {deleteMe.error != null && <Alert>{(deleteMe.error as Error).message}</Alert>}
        </div>
      }
    >
      <form onSubmit={submit} className="flex flex-col gap-5" noValidate>
        <p className="text-tinta-suave">
          Você entrou com o Google como <strong className="text-tinta">{me.email}</strong>. Para usar a sua conta, crie uma senha. Depois você pode entrar tanto com o Google quanto com o e-mail e a senha.
        </p>
        {create.error && Object.keys(errors).length === 0 && <Alert>{(create.error as Error).message}</Alert>}
        <TextField
          label="Senha"
          type="password"
          autoComplete="new-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.newPassword}
          hint="Pelo menos 8 caracteres."
          required
        />
        <TextField
          label="Repita a senha"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          error={mismatch ? 'As senhas não são iguais.' : undefined}
          required
        />
        <Button type="submit" busy={create.isPending} disabled={password.length < 8 || confirm !== password} className="mt-1 h-11">
          Criar senha e continuar
        </Button>
      </form>
    </AuthCard>
  );
}
