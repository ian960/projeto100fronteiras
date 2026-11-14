import { Alert, ButtonLink, EmptyState, Loading } from '../../components/ui';
import { errorMessage } from '../../lib/api';
import { useDocumentTitle, useMe } from '../../lib/hooks';
import { HighlightsCarousel } from '../HighlightsCarousel';
import { OpinionPanel, SecondaryStory, SectionBlock, SectionHeading, StoryList } from '../parts';
import { useHome } from '../queries';

// How many stories sit in the row under the carousel, and how many follow as a list.
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

  // The carousel: what the admin featured, topped up with the latest news by
  // the API. An API from before the carousel sends only one lead story.
  const fallbackLead = data.featured ?? data.latestNews[0];
  const highlights = data.highlights ?? (fallbackLead ? [fallbackLead] : []);
  const inCarousel = new Set(highlights.map((post) => post.id));
  const others = data.latestNews.filter((post) => !inCarousel.has(post.id));
  const beside = others.slice(0, BESIDE_LEAD);
  const latest = others.slice(BESIDE_LEAD, BESIDE_LEAD + LATEST_LIST);

  // A story appears once on the page: the category blocks skip what the top
  // already shows, and a block left with nothing is not drawn.
  const shown = new Set([...inCarousel, ...beside.map((post) => post.id), ...latest.map((post) => post.id)]);
  const sections = (data.sections ?? [])
    .map((section) => ({ ...section, posts: section.posts.filter((post) => !shown.has(post.id)) }))
    .filter((section) => section.posts.length > 0);

  if (highlights.length === 0 && data.latestColumns.length === 0) {
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
      {highlights.length > 0 && (
        <div className="flex flex-col gap-8 sm:gap-10">
          <HighlightsCarousel posts={highlights} />
          {beside.length > 0 && (
            <div className="grid gap-6 lg:grid-cols-3 lg:gap-10">
              {beside.map((post) => (
                <div key={post.id} className="min-w-0">
                  <SecondaryStory post={post} />
                </div>
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
