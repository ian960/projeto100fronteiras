import { Alert, ButtonLink, EmptyState, Loading } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import { LeadStory, OpinionItem, SectionHeading, StoryList } from '../parts';
import { useHome } from '../queries';

export default function HomePage() {
  useDocumentTitle(null);
  const { data, isPending, error, refetch } = useHome();
  const { data: me } = useMe();

  if (isPending) return <Loading />;

  if (error) {
    return (
      <Alert action={<button className="font-medium underline" onClick={() => refetch()}>Tentar de novo</button>}>
        Não foi possível carregar as notícias. {errorMessage(error)}
      </Alert>
    );
  }

  // The admin picks the lead story. Until they do, the most recent news leads.
  const lead = data.featured ?? data.latestNews[0] ?? null;
  const latest = data.latestNews.filter((post) => post.id !== lead?.id);

  if (!lead && data.latestColumns.length === 0) {
    return (
      <EmptyState
        title="Nenhuma notícia publicada ainda"
        action={me?.role === 'admin' ? <ButtonLink to="/painel/materias/nova">Escrever a primeira notícia</ButtonLink> : undefined}
      >
        Assim que a redação publicar, as matérias aparecem aqui.
      </EmptyState>
    );
  }

  return (
    <div className="flex flex-col gap-14">
      {lead && <LeadStory post={lead} />}

      <div className="grid gap-14 lg:grid-cols-12 lg:gap-12">
        {latest.length > 0 && (
          <section className="lg:col-span-8" aria-label="Últimas notícias">
            <SectionHeading action={{ to: '/noticias', label: 'Ver todas' }}>Últimas notícias</SectionHeading>
            <StoryList posts={latest} />
          </section>
        )}

        {data.latestColumns.length > 0 && (
          <section className={latest.length > 0 ? 'lg:col-span-4' : 'lg:col-span-12'} aria-label="Opinião">
            <SectionHeading tone="mata" action={{ to: '/colunistas', label: 'Colunistas' }}>
              Opinião
            </SectionHeading>
            <div className="divide-y divide-linha">
              {data.latestColumns.map((post) => (
                <OpinionItem key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
