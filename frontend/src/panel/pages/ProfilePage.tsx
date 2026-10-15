import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Loading, TextArea, TextField } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { roleLabel } from '../../lib/format';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import type { User } from '../../lib/types';
import { useAuthor } from '../../site/queries';
import { useAccountActions } from '../queries';
import { ImageField, PanelHeader, useToast } from '../widgets';

export default function ProfilePage() {
  const { data: me } = useMe();
  useDocumentTitle('Minha conta');
  if (!me) return null;

  return (
    <>
      <PanelHeader title={me.role === 'columnist' ? 'Meu perfil' : 'Minha conta'} />
      <div className="grid gap-8 xl:grid-cols-2">
        {me.role === 'columnist' && me.author && <Byline me={me} />}
        <div className="flex flex-col gap-8">
          <section className="rounded-lg border border-linha bg-papel p-5">
            <h2 className="mb-3 font-semibold">Conta</h2>
            <dl className="grid grid-cols-[7rem_1fr] gap-y-1.5 text-[0.9375rem]">
              <dt className="text-tinta-suave">Nome</dt>
              <dd>{me.name}</dd>
              <dt className="text-tinta-suave">E-mail</dt>
              <dd className="break-all">{me.email}</dd>
              <dt className="text-tinta-suave">Acesso</dt>
              <dd>{roleLabel[me.role]}</dd>
            </dl>
          </section>
          <PasswordForm />
        </div>
      </div>
    </>
  );
}

// The session carries only a summary of the byline (no bio), so the full
// profile is read from the public author endpoint before the form opens.
function Byline({ me }: { me: User }) {
  const { data, isPending } = useAuthor(me.author?.slug);
  if (isPending) return <Loading />;
  // Keyed by id, not updatedAt: saving changes updatedAt, and a remount right
  // after saving would swallow the confirmation.
  return <BylineForm key={data?.id ?? 'sem-perfil'} me={me} initialBio={data?.bio ?? ''} />;
}

// What readers see under every column: name, column title, photo and bio.
function BylineForm({ me, initialBio }: { me: User; initialBio: string }) {
  const { updateProfile } = useAccountActions();
  const toast = useToast();
  const author = me.author!;
  const errors = updateProfile.error instanceof ApiError ? updateProfile.error.fields : {};
  const [form, setForm] = useState({
    name: author.name,
    columnTitle: author.columnTitle ?? '',
    photoUrl: author.photoUrl ?? '',
    bio: initialBio,
  });

  function submit(event: FormEvent) {
    event.preventDefault();
    updateProfile.mutate(
      {
        name: form.name.trim(),
        columnTitle: form.columnTitle.trim() || null,
        photoUrl: form.photoUrl.trim() || null,
        bio: form.bio.trim() || null,
      },
      { onSuccess: () => toast('Perfil atualizado') },
    );
  }

  return (
    <section className="rounded-lg border border-linha bg-papel p-5">
      <h2 className="font-semibold">Como você aparece no site</h2>
      <p className="mb-4 mt-1 text-sm text-tinta-suave">Nome, coluna, foto e mini-bio aparecem no fim de cada coluna e na sua página.</p>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {updateProfile.error && Object.keys(errors).length === 0 && <Alert>{errorMessage(updateProfile.error)}</Alert>}
        <TextField label="Nome na assinatura" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={errors.name} />
        <TextField label="Nome da coluna" optional value={form.columnTitle} onChange={(e) => setForm({ ...form, columnTitle: e.target.value })} error={errors.columnTitle} />
        <TextArea label="Mini-bio" optional rows={3} maxLength={600} value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} error={errors.bio} />
        <ImageField label="Foto" folder="authors" value={form.photoUrl} onChange={(photoUrl) => setForm({ ...form, photoUrl })} error={errors.photoUrl} />
        <div>
          <Button type="submit" busy={updateProfile.isPending}>
            Salvar perfil
          </Button>
        </div>
      </form>
    </section>
  );
}

function PasswordForm() {
  const { changePassword } = useAccountActions();
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const errors = changePassword.error instanceof ApiError ? changePassword.error.fields : {};

  function submit(event: FormEvent) {
    event.preventDefault();
    changePassword.mutate(form, {
      onSuccess: () => {
        setForm({ currentPassword: '', newPassword: '' });
        toast('Senha alterada. Os outros aparelhos foram desconectados.');
      },
    });
  }

  return (
    <section className="rounded-lg border border-linha bg-papel p-5">
      <h2 className="mb-4 font-semibold">Trocar senha</h2>
      <form onSubmit={submit} className="flex flex-col gap-4">
        {changePassword.error && Object.keys(errors).length === 0 && <Alert>{errorMessage(changePassword.error)}</Alert>}
        <TextField
          label="Senha atual"
          type="password"
          autoComplete="current-password"
          value={form.currentPassword}
          onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
          error={errors.currentPassword}
        />
        <TextField
          label="Nova senha"
          type="password"
          autoComplete="new-password"
          value={form.newPassword}
          onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
          error={errors.newPassword}
          hint="Pelo menos 8 caracteres."
        />
        <div>
          <Button type="submit" busy={changePassword.isPending} disabled={!form.currentPassword || form.newPassword.length < 8}>
            Trocar senha
          </Button>
        </div>
      </form>
    </section>
  );
}
