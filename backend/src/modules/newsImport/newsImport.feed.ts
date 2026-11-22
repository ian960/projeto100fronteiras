import { parseDocument } from 'htmlparser2';
import { findAll, findOne, getAttributeValue, textContent } from 'domutils';
import type { Element } from 'domhandler';

// One story as a feed describes it. Every field but guid and title may be
// missing: feeds vary a lot, and a missing photo or date is not an error.
export type FeedItem = {
  guid: string;
  title: string;
  link: string | null;
  // HTML. The description (often a summary, sometimes the whole text) and
  // <content:encoded> (the whole text, when the feed has it).
  summaryHtml: string;
  contentHtml: string;
  author: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
};

// RSS 2.0 and Atom, which together cover the feeds of Brazilian news sites.
// htmlparser2 is the parser sanitize-html already uses, in XML mode: no new
// dependency, and it never fetches anything an XML document points at.
export function parseFeed(xml: string): FeedItem[] {
  const doc = parseDocument(xml, { xmlMode: true, decodeEntities: true });
  const nodes = findAll((el) => el.name === 'item' || el.name === 'entry', doc.children);
  if (nodes.length === 0 && !findOne((el) => ['rss', 'feed', 'rdf:RDF'].includes(el.name), doc.children)) {
    throw new Error('This address does not return an RSS or Atom feed.');
  }

  const items: FeedItem[] = [];
  for (const node of nodes) {
    const item = readItem(node);
    if (item) items.push(item);
  }
  return items;
}

function child(node: Element, ...names: string[]): Element | null {
  for (const name of names) {
    const found = node.children.find((c): c is Element => c.type === 'tag' && (c as Element).name === name);
    if (found) return found;
  }
  return null;
}

function text(node: Element, ...names: string[]): string {
  const el = child(node, ...names);
  return el ? textContent(el).trim() : '';
}

function readLink(node: Element): string | null {
  // Atom: <link rel="alternate" href="…"/>; RSS: <link>…</link>.
  const links = node.children.filter((c): c is Element => c.type === 'tag' && (c as Element).name === 'link');
  for (const link of links) {
    const href = getAttributeValue(link, 'href');
    const rel = getAttributeValue(link, 'rel');
    if (href && (!rel || rel === 'alternate')) return httpUrl(href);
    const inner = textContent(link).trim();
    if (inner) return httpUrl(inner);
  }
  return null;
}

function readImage(node: Element, html: string): string | null {
  for (const el of node.children) {
    if (el.type !== 'tag') continue;
    const tag = el as Element;
    const type = getAttributeValue(tag, 'type') ?? '';
    const url = getAttributeValue(tag, 'url');
    if (tag.name === 'enclosure' && url && type.startsWith('image/')) return httpUrl(url);
    if ((tag.name === 'media:content' || tag.name === 'media:thumbnail') && url) {
      const medium = getAttributeValue(tag, 'medium');
      if (!medium || medium === 'image') return httpUrl(url);
    }
    // Agência Brasil's own element.
    if (tag.name === 'imagem-destaque') {
      const inner = textContent(tag).trim();
      if (inner) return httpUrl(inner);
    }
  }
  // Otherwise the first picture in the text.
  const img = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  return img?.[1] ? httpUrl(img[1]) : null;
}

function readDate(value: string): Date | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

// Only http(s) leaves this file: a "javascript:" link in a feed is dropped.
function httpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function readItem(node: Element): FeedItem | null {
  const title = stripTags(text(node, 'title'));
  const link = readLink(node);
  const guid = text(node, 'guid', 'id') || link;
  if (!title || !guid) return null;

  const summaryHtml = text(node, 'description', 'summary');
  const contentHtml = text(node, 'content:encoded', 'content');
  const authorEl = child(node, 'dc:creator', 'author');
  const author = authorEl ? (text(authorEl, 'name') || textContent(authorEl).trim()) : '';

  return {
    guid: guid.slice(0, 500),
    title,
    link,
    summaryHtml,
    contentHtml,
    author: author ? stripTags(author).slice(0, 120) : null,
    publishedAt: readDate(text(node, 'pubDate', 'published', 'updated', 'dc:date')),
    imageUrl: readImage(node, contentHtml || summaryHtml),
  };
}

// Plain text out of a bit of HTML, for titles and summaries.
export function stripTags(html: string): string {
  // A space where a paragraph or a line ends, or two paragraphs run together.
  const spaced = html.replace(/<\/(p|div|li|h[1-6]|blockquote)\s*>|<br\s*\/?>/gi, '$& ');
  const doc = parseDocument(spaced, { decodeEntities: true });
  return textContent(doc).replace(/\s+/g, ' ').trim();
}

// A summary of at most `max` characters, cut at a word.
export function shorten(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max - 1);
  const space = cut.lastIndexOf(' ');
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,.;:–-]+$/, '')}…`;
}
