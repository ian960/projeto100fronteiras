import { useState } from 'react';
import type { FormEvent } from 'react';
import { Alert, Button, Checkbox, EmptyState, Loading, SelectField, TextField, cx } from '../../components/ui';
import { ApiError, errorMessage } from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useDocumentTitle } from '../../lib/hooks';
import type { BannerAdmin, BannerSlot } from '../../lib/types';
import { ImageField, imageValue } from '../mediaFields';
import type { ImageValue } from '../mediaFields';
import { useAdminBanners, useBannerActions } from '../queries';
import { ConfirmButton, Modal, PanelHeader, useToast } from '../widgets';

// Where each banner can go. The site draws a place only when a banner is
// running there (site/banners.tsx), so an empty place changes nothing.
export const SLOT_LABELS: Record<BannerSlot, { label: string; hint: string }> = {
  home_top: { label: 'Topo da página inicial', hint: 'Acima do carrossel de destaques.' },
  home_middle: { label: 'Meio da página inicial', hint: 'Entre as últimas notícias e os blocos das categorias.' },
  article_middle: { label: 'Meio da matéria', hint: 'No meio do texto de notícias e colunas (só em textos com 4 parágrafos ou mais).' },
  article_end: { label: 'Fim da matéria', hint: 'Logo depois do texto de notícias e colunas.' },
  site_footer: { label: 'Antes do rodapé', hint: 'No fim de todas as páginas do site.' },
};

const SLOTS = Object.keys(SLOT_LABELS) as BannerSlot[];

function fieldErrors(error: unknown): Record<string, string> {
  return error instanceof ApiError ? error.fields : {};
}

// <input type="date"> speaks "2026-11-20" in the admin's own time zone. The
// banner starts at the first minute of the first day and ends at the last
// minute of the last day.
function dayStart(day: string): string {
  return new Date(`${day}T00:00:00`).toISOString();
}
function dayEnd(day: string): string {
  return new Date(`${day}T23:59:59.999`).toISOString();
}
function toDay(iso: string): string {
  const date = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function addDays(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return toDay(date.toISOString());
}

type Status = { label: string; tone: string };

function statusOf(banner: BannerAdmin): Status {
  const now = Date.now();
  if (!banner.active) return { label: 'Desligado', tone: 'bg-superficie text-tinta-suave' };
  if (new Date(banner.startsAt).getTime() > now) return { label: 'Agendado', tone: 'bg-sol/30 text-tinta' };
  if (new Date(banner.endsAt).getTime() <= now) return { label: 'Encerrado', tone: 'bg-superficie text-tinta-suave' };
  return { label: 'No ar', tone: 'bg-mata text-white' };
}

// "1.234 visualizações, 56 cliques (4,5%)"
function statsLine(banner: BannerAdmin): string {
  const n = new Intl.NumberFormat('pt-BR');
  const views = `${n.format(banner.impressions)} ${banner.impressions === 1 ? 'visualização' : 'visualizações'}`;
  const clicks = `${n.format(banner.clicks)} ${banner.clicks === 1 ? 'clique' : 'cliques'}`;
  const rate = banner.impressions > 0
    ? ` (${new Intl.NumberFormat('pt-BR', { style: 'percent', maximumFractionDigits: 1 }).format(banner.clicks / banner.impressions)})`
    : '';
  return `${views}, ${clicks}${rate}`;
}

export default function BannersPage() {
  useDocumentTitle('Anunciantes');
  const { data, isPending, error } = useAdminBanners();
  const actions = useBannerActions();
  const toast = useToast();
  const [editing, setEditing] = useState<BannerAdmin | 'new' | null>(null);

  return (
    <>
      <PanelHeader
        title="Anunciantes"
        description="Banners de anunciantes locais. Cada um aparece no lugar escolhido só durante o período e enquanto estiver ligado. Um lugar sem banner no ar não aparece no site."
        actions={<Button onClick={() => setEditing('new')}>Novo banner</Button>}
      />

      {(actions.update.error || actions.remove.error) && (
        <div className="mb-4">
          <Alert>{errorMessage(actions.update.error ?? actions.remove.error)}</Alert>
        </div>
      )}

      {isPending ? (
        <Loading />
      ) : error ? (
        <Alert>{errorMessage(error)}</Alert>
      ) : data.length === 0 ? (
        <EmptyState title="Nenhum banner ainda" action={<Button onClick={() => setEditing('new')}>Cadastrar o primeiro</Button>}>
          Enquanto não houver banner no ar, o site continua exatamente como está.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-linha rounded-lg border border-linha bg-papel">
          {data.map((banner) => {
            const status = statusOf(banner);
            return (
              <li key={banner.id} className="flex flex-col gap-3 px-4 py-4 lg:flex-row lg:items-center">
                <img
                  src={banner.image.thumbnailUrl}
                  alt=""
                  className="h-auto max-h-20 w-full max-w-60 rounded border border-linha bg-superficie object-contain"
                />
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2 font-semibold">
                    {banner.advertiser ?? <span className="font-normal text-tinta-suave">Sem nome</span>}
                    <span className={cx('rounded-full px-2 text-xs font-semibold leading-5', status.tone)}>{status.label}</span>
                  </p>
                  <p className="text-sm text-tinta-suave">
                    {SLOT_LABELS[banner.slot].label}, de {formatDate(banner.startsAt)} a {formatDate(banner.endsAt)}
                  </p>
                  <p className="text-sm text-tinta-suave">{statsLine(banner)}</p>
                  {banner.linkUrl ? (
                    <a href={banner.linkUrl} target="_blank" rel="noopener noreferrer" className="block truncate text-sm text-anil hover:underline underline-offset-4">
                      {banner.linkUrl}
                    </a>
                  ) : (
                    <p className="text-sm text-tinta-suave">Sem link (só a imagem, sem clique)</p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Checkbox
                    label="Ligado"
                    checked={banner.active}
                    onChange={(active) =>
                      actions.update.mutate(
                        { id: banner.id, input: { active } },
                        { onSuccess: () => toast(active ? 'Banner ligado' : 'Banner desligado') },
                      )
                    }
                  />
                  <Button variant="secundario" small onClick={() => setEditing(banner)}>
                    Editar
                  </Button>
                  <ConfirmButton
                    label="Excluir"
                    confirmLabel="Confirmar"
                    busy={actions.remove.isPending && actions.remove.variables === banner.id}
                    onConfirm={() => actions.remove.mutate(banner.id, { onSuccess: () => toast('Banner excluído') })}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <Modal open={editing !== null} onClose={() => setEditing(null)} title={editing === 'new' ? 'Novo banner' : 'Editar banner'}>
        {editing && (
          <BannerForm key={editing === 'new' ? 'new' : editing.id} banner={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Modal>
    </>
  );
}

function BannerForm({ banner, onDone }: { banner: BannerAdmin | null; onDone: () => void }) {
  const { create, update } = useBannerActions();
  const toast = useToast();
  const mutation = banner ? update : create;
  const errors = fieldErrors(mutation.error);
  const [form, setForm] = useState({
    advertiser: banner?.advertiser ?? '',
    linkUrl: banner?.linkUrl ?? '',
    slot: banner?.slot ?? ('home_top' as BannerSlot),
    image: (banner ? imageValue(banner.image) : null) as ImageValue,
    mobileImage: (banner?.mobileImage ? imageValue(banner.mobileImage) : null) as ImageValue,
    startDay: banner ? toDay(banner.startsAt) : addDays(0),
    endDay: banner ? toDay(banner.endsAt) : addDays(30),
    active: banner?.active ?? true,
  });
  const [localError, setLocalError] = useState<string | null>(null);

  function submit(event: FormEvent) {
    event.preventDefault();
    setLocalError(null);
    if (!form.image) return setLocalError('Envie a imagem do banner.');
    if (!form.startDay || !form.endDay || form.endDay < form.startDay) {
      return setLocalError('O último dia precisa ser igual ou depois do primeiro.');
    }

    let linkUrl = form.linkUrl.trim();
    // "padaria.com.br" typed without the scheme still works.
    if (linkUrl && !/^https?:\/\//i.test(linkUrl)) linkUrl = `https://${linkUrl}`;

    const input = {
      // Empty means none: a banner can be just the picture.
      advertiser: form.advertiser.trim() || null,
      linkUrl: linkUrl || null,
      slot: form.slot,
      imageId: form.image.id,
      mobileImageId: form.mobileImage?.id ?? null,
      startsAt: dayStart(form.startDay),
      endsAt: dayEnd(form.endDay),
      active: form.active,
    };
    const done = { onSuccess: () => { toast(banner ? 'Banner atualizado' : 'Banner criado'); onDone(); } };
    if (banner) update.mutate({ id: banner.id, input }, done);
    else create.mutate(input, done);
  }

  const shownError = localError ?? (mutation.error && Object.keys(errors).length === 0 ? errorMessage(mutation.error) : null);

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {shownError && <Alert>{shownError}</Alert>}
      <TextField
        label="Anunciante"
        optional
        placeholder="Ex.: Padaria Central"
        value={form.advertiser}
        onChange={(e) => setForm({ ...form, advertiser: e.target.value })}
        error={errors.advertiser}
        hint="Aparece aqui no painel e é lido por leitores de tela. Não aparece escrito no site."
      />
      <TextField
        label="Link do anunciante"
        optional
        type="url"
        inputMode="url"
        placeholder="https://"
        value={form.linkUrl}
        onChange={(e) => setForm({ ...form, linkUrl: e.target.value })}
        error={errors.linkUrl}
        hint="Abre em uma nova aba quando o leitor clica. Sem link, o banner é só a imagem e não é clicável."
      />
      <SelectField
        label="Onde aparece"
        value={form.slot}
        onChange={(e) => setForm({ ...form, slot: e.target.value as BannerSlot })}
        error={errors.slot}
        hint={SLOT_LABELS[form.slot].hint}
      >
        {SLOTS.map((slot) => (
          <option key={slot} value={slot}>
            {SLOT_LABELS[slot].label}
          </option>
        ))}
      </SelectField>
      <ImageField
        label="Imagem"
        purpose="banner"
        value={form.image}
        onChange={(image) => setForm({ ...form, image })}
        error={errors.imageId}
        hint="Formato largo, por exemplo 1200×150 ou 728×90. GIF animado funciona."
      />
      <ImageField
        label="Versão para celular"
        purpose="banner"
        optional
        value={form.mobileImage}
        onChange={(mobileImage) => setForm({ ...form, mobileImage })}
        error={errors.mobileImageId}
        hint="Mais alta e estreita, por exemplo 640×200. Sem ela, o celular mostra a imagem principal."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <TextField label="Primeiro dia" type="date" value={form.startDay} onChange={(e) => setForm({ ...form, startDay: e.target.value })} error={errors.startsAt} />
        <TextField label="Último dia" type="date" value={form.endDay} onChange={(e) => setForm({ ...form, endDay: e.target.value })} error={errors.endsAt} />
      </div>
      <Checkbox
        label="Ligado"
        hint="Desligado, não aparece no site mesmo dentro do período."
        checked={form.active}
        onChange={(active) => setForm({ ...form, active })}
      />
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="secundario" onClick={onDone}>
          Cancelar
        </Button>
        <Button type="submit" busy={mutation.isPending}>
          {banner ? 'Salvar' : 'Criar banner'}
        </Button>
      </div>
    </form>
  );
}
