import { useState } from 'react';
import type { FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { Alert, Button, ButtonLink, Loading, TextArea, TextField } from '../../components/ui';
import { ApiError, errorMessage, post } from '../../lib/api';
import { roleLabel } from '../../lib/format';
import { useChangePassword, useDeleteMe, useDocumentTitle, useLogout, useMe, useUpdateMe } from '../../lib/hooks';
import type { User } from '../../lib/types';
import { ImageField } from '../../panel/mediaFields';
import type { ImageValue } from '../../panel/mediaFields';

// "Minha conta": any logged-in person (readers included) changes their own
// name, photo and bio, and their password. Backend: PATCH /api/auth/me.
export default function AccountPage() {
  useDocumentTitle('Minha conta');
  const { data: me, isPending } = useMe();
  const logout = useLogout();
  const navigate = useNavigate();

  if (isPending) return <Loading />;
  if (!me) return <Navigate to="/entrar?proxima=/minha-conta" replace />;

  const inNewsroom = me.role === 'admin' || me.role === 'columnist';

  return (
    <div className="mx-auto max-w-2xl py-4 sm:py-8">
      <h1 className="titulo text-4xl text-anil">Minha conta</h1>
      <p className="mt-2 text-tinta-suave">
        {me.email} · {roleLabel[me.role]}
      </p>

      {inNewsroom && (
        <div className="mt-6">
          <Alert tone="info" action={<ButtonLink to="/painel/perfil" small variant="secundario">Abrir o painel</ButtonLink>}>
            Como aparece a sua assinatura nas colunas é editado no painel.
          </Alert>
        </div>
      )}

      <div className="mt-8 flex flex-col gap-8">
        {/* Keyed by id: saving refreshes `me`, and a remount would wipe the
            confirmation message. */}
        <ProfileForm key={me.id} me={me} />
        <PasswordForm email={me.email} />
        <section className="rounded-lg border border-linha bg-papel p-5">
          <h2 className="font-semibold">Sair</h2>
          <p className="mb-4 mt-1 text-sm text-tinta-suave">Desconecta a sua conta deste aparelho.</p>
          <Button
            type="button"
            variant="secundario"
            busy={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => navigate('/') })}
          >
            Sair da conta
          </Button>
        </section>
        <DeleteAccount inNewsroom={inNewsroom} />
      </div>
    </div>
  );
}

// Two steps and the password: a slip of the finger must not erase anyone.
function DeleteAccount({ inNewsroom }: { inNewsroom: boolean }) {
  const deleteMe = useDeleteMe();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [armed, setArmed] = useState(false);
  const errors = deleteMe.error instanceof ApiError ? deleteMe.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!armed) {
      setArmed(true);
      return;
    }
    deleteMe.mutate(password, { onSuccess: () => navigate('/', { replace: true }) });
  }

  return (
    <section className="rounded-lg border border-alerta/40 bg-papel p-5">
      <h2 className="font-semibold text-alerta">Excluir conta</h2>
      <p className="mb-4 mt-1 text-sm text-tinta-suave">
        Apaga seus dados e a sua foto. Não dá para desfazer.
        {inNewsroom && ' As colunas e matérias já publicadas continuam no site, com a assinatura de sempre.'}
      </p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {deleteMe.error && Object.keys(errors).length === 0 && <Alert>{errorMessage(deleteMe.error)}</Alert>}
        <TextField
          label="Sua senha"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => {
            setArmed(false);
            setPassword(e.target.value);
          }}
          error={errors.password}
        />
        {armed && <Alert tone="aviso">Tem certeza? Clique de novo para excluir a sua conta de vez.</Alert>}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" variant="perigo" busy={deleteMe.isPending} disabled={!password}>
            {armed ? 'Sim, excluir minha conta' : 'Excluir minha conta'}
          </Button>
          {armed && (
            <Button type="button" variant="texto" onClick={() => setArmed(false)}>
              Cancelar
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}

function ProfileForm({ me }: { me: User }) {
  const updateMe = useUpdateMe();
  const errors = updateMe.error instanceof ApiError ? updateMe.error.fields : {};
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({
    name: me.name,
    bio: me.bio ?? '',
    avatar: (me.avatarId && me.avatarUrl ? { id: me.avatarId, previewUrl: me.avatarUrl } : null) as ImageValue,
  });

  function change(next: Partial<typeof form>) {
    setSaved(false);
    setForm({ ...form, ...next });
  }

  function submit(event: FormEvent) {
    event.preventDefault();
    updateMe.mutate(
      { name: form.name.trim(), bio: form.bio.trim() || null, avatarId: form.avatar?.id ?? null },
      { onSuccess: () => setSaved(true) },
    );
  }

  return (
    <section className="rounded-lg border border-linha bg-papel p-5">
      <h2 className="font-semibold">Seus dados</h2>
      <p className="mb-4 mt-1 text-sm text-tinta-suave">Nome, foto e uma pequena apresentação sobre você.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {updateMe.error && Object.keys(errors).length === 0 && <Alert>{errorMessage(updateMe.error)}</Alert>}
        {saved && <Alert tone="ok">Dados salvos.</Alert>}
        <ImageField
          label="Foto"
          purpose="avatar"
          round
          optional
          value={form.avatar}
          onChange={(avatar) => change({ avatar })}
          error={errors.avatarId}
          hint="JPG, PNG ou WebP de até 5 MB."
        />
        <TextField
          label="Nome"
          autoComplete="name"
          value={form.name}
          onChange={(e) => change({ name: e.target.value })}
          error={errors.name}
        />
        <TextArea
          label="Bio"
          optional
          rows={3}
          maxLength={600}
          value={form.bio}
          onChange={(e) => change({ bio: e.target.value })}
          error={errors.bio}
          hint="Até 600 caracteres."
        />
        <div>
          <Button type="submit" busy={updateMe.isPending} disabled={form.name.trim().length < 2}>
            Salvar
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordForm({ email }: { email: string }) {
  const changePassword = useChangePassword();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [saved, setSaved] = useState(false);
  // "Esqueci minha senha" from inside the account: the same link by e-mail as
  // on the login page, sent to the address of this account.
  const [linkState, setLinkState] = useState<'idle' | 'sending' | 'sent'>('idle');
  const [linkError, setLinkError] = useState<unknown>(null);

  async function sendLink() {
    setLinkState('sending');
    setLinkError(null);
    try {
      await post('/auth/forgot-password', { email });
      setLinkState('sent');
    } catch (err) {
      setLinkError(err);
      setLinkState('idle');
    }
  }
  const errors = changePassword.error instanceof ApiError ? changePassword.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    changePassword.mutate(form, {
      onSuccess: () => {
        setForm({ currentPassword: '', newPassword: '' });
        setSaved(true);
      },
    });
  }

  return (
    <section className="rounded-lg border border-linha bg-papel p-5">
      <h2 className="mb-4 font-semibold">Trocar senha</h2>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {changePassword.error && Object.keys(errors).length === 0 && <Alert>{errorMessage(changePassword.error)}</Alert>}
        {saved && <Alert tone="ok">Senha alterada. Os outros aparelhos foram desconectados.</Alert>}
        <TextField
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, currentPassword: e.target.value });
          }}
          error={errors.currentPassword}
        />
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => {
            setSaved(false);
            setForm({ ...form, newPassword: e.target.value });
          }}
          error={errors.newPassword}
          hint="Pelo menos 8 caracteres."
        />
        <div>
          <Button type="submit" busy={changePassword.isPending} disabled={!form.currentPassword || form.newPassword.length < 8}>
            Trocar senha
          </Button>
        </div>
      </form>
      <div className="mt-5 border-t border-linha pt-4 text-sm">
        {linkState === 'sent' ? (
          <Alert tone="ok">
            Enviamos um link para <strong>{email}</strong>. Ele vale por 1 hora. Não chegou? Olhe a caixa de spam.
          </Alert>
        ) : (
          <>
            {linkError != null && <Alert>{errorMessage(linkError)}</Alert>}
            <p className="text-tinta-suave">
              Esqueceu a senha atual?{' '}
              <button
                type="button"
                onClick={sendLink}
                disabled={linkState === 'sending'}
                className="font-medium text-anil hover:underline underline-offset-4 disabled:opacity-60"
              >
                {linkState === 'sending' ? 'Enviando...' : 'Receber um link por e-mail'}
              </button>
            </p>
          </>
        )}
      </div>
    </section>
  );
}
