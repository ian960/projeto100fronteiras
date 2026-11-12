import { Alert, ButtonLink, EmptyState, Loading } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import { LeadStory, OpinionPanel, SecondaryStory, SectionBlock, SectionHeading, StoryList } from '../parts';
import { useHome } from '../queries';

// How many stories stand beside the lead, and how many follow as a list.
const BESIDE_LEAD = 3;
const LATEST_LIST = 6;

// Category blocks go three to a row on a wide screen. A last row that is not
// full shares the width instead of leaving a hole: 5 blocks are 3 + 2,
// 4 blocks are 2 + 2. The classes are spelled out for Tailwind to find them.
function blockSpan(index: number, count: number): string {
  const remainder = count % 3;
  const wideFrom = count >= 4 && remainder === 1 ? count - 4 : remainder === 2 ? count - 2 : count;
  if (count === 1) return 'lg:col-span-3';
  return index >= wideFrom ? 'lg:col-span-3' : 'lg:col-span-2';
}

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
  const others = data.latestNews.filter((post) => post.id !== lead?.id);
  const beside = others.slice(0, BESIDE_LEAD);
  const latest = others.slice(BESIDE_LEAD, BESIDE_LEAD + LATEST_LIST);

  // A story appears once on the page: the category blocks skip what the top
  // already shows, and a block left with nothing is not drawn.
  const shown = new Set([lead?.id, ...beside.map((post) => post.id), ...latest.map((post) => post.id)]);
  const sections = (data.sections ?? [])
    .map((section) => ({ ...section, posts: section.posts.filter((post) => !shown.has(post.id)) }))
    .filter((section) => section.posts.length > 0);

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
    <div className="flex flex-col gap-14 sm:gap-20">
      {lead && (
        <div className="grid gap-8 lg:grid-cols-12 lg:gap-10">
          <div className={beside.length > 0 ? 'min-w-0 lg:col-span-8' : 'min-w-0 lg:col-span-12'}>
            <LeadStory post={lead} />
          </div>
          {beside.length > 0 && (
            <div className="flex min-w-0 flex-col gap-6 border-t border-linha pt-6 lg:col-span-4 lg:border-t-0 lg:border-l lg:pt-0 lg:pl-10">
              {/* On a wide screen the third one goes without its photo, so the
                  column ends where the lead does. */}
              {beside.map((post, index) => (
                <SecondaryStory key={post.id} post={post} photoOnWide={index < 2} />
              ))}
            </div>
          )}
        </div>
      )}

      {(latest.length > 0 || data.latestColumns.length > 0) && (
        <div className="grid gap-14 lg:grid-cols-12 lg:gap-10">
          {latest.length > 0 && (
            <section className="min-w-0 lg:col-span-8" aria-label="Últimas notícias">
              <SectionHeading action={{ to: '/noticias', label: 'Ver todas' }}>Últimas notícias</SectionHeading>
              <StoryList posts={latest} />
            </section>
          )}
          {data.latestColumns.length > 0 && (
            // min-w-0: the sideways strip inside must not widen the page.
            <div className={latest.length > 0 ? 'min-w-0 lg:col-span-4' : 'min-w-0 lg:col-span-12'}>
              <OpinionPanel posts={data.latestColumns} />
            </div>
          )}
        </div>
      )}

      {sections.length > 0 && (
        <div className="grid gap-x-10 gap-y-14 md:grid-cols-2 lg:grid-cols-6">
          {sections.map((section, index) => (
            <div key={section.category.id} className={`min-w-0 ${blockSpan(index, sections.length)}`}>
              <SectionBlock name={section.category.name} slug={section.category.slug} posts={section.posts} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
