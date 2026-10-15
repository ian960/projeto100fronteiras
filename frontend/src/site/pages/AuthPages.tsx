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
        <p className="text-sm text-tinta-suave">Esqueceu a senha? Peça ao administrador do portal para redefinir.</p>
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
          Você já está conectado. Se vai escrever colunas para o portal, avise o administrador: ele libera o seu acesso à área da redação.
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
