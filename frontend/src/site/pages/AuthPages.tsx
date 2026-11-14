import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useNavigate, useSearchParams } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, TextField } from '../../components/ui';
import { ApiError, post } from '../../lib/api';
import { useDocumentTitle, useLogin, useMe } from '../../lib/hooks';
import type { User } from '../../lib/types';

function canUsePanel(user: Pick<User, 'role'>) {
  return user.role === 'admin' || user.role === 'columnist';
}

// Only same-site paths are accepted as ?proxima=, so the login page cannot be
// used to bounce someone to another website.
function safeNext(value: string | null): string | null {
  return value && value.startsWith('/') && !value.startsWith('//') ? value : null;
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

  if (me) return <Navigate to={next ?? (canUsePanel(me) ? '/painel' : '/')} replace />;

  function submit(event: FormEvent) {
    event.preventDefault();
    login.mutate(
      { email, password },
      {
        onSuccess: (data) => {
          const user = (data as { user: Pick<User, 'role'> }).user;
          navigate(next ?? (canUsePanel(user) ? '/painel' : '/'), { replace: true });
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
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  if (me && !done) return <Navigate to="/" replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await post('/auth/register', form);
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
        {error && Object.keys(error.fields).length === 0 && (
          <Alert>{error.code === 'CONFLICT' ? 'Este e-mail já tem conta. Use “Entrar”.' : error.message}</Alert>
        )}
        <TextField label="Nome" autoComplete="name" {...field('name')} required />
        <TextField label="E-mail" type="email" autoComplete="email" {...field('email')} required />
        <TextField label="Senha" type="password" autoComplete="new-password" hint="Pelo menos 8 caracteres." {...field('password')} required />
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
