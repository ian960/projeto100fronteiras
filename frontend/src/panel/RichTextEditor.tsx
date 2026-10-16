import { useEffect, useRef } from 'react';
import Quill from 'quill';
import 'quill/dist/quill.snow.css';
import { cx } from '../components/ui';

// The formats the editor can produce. This list and ALLOWED_TAGS in
// backend/src/shared/utils/sanitizeHtml.ts must stay in sync: anything the
// editor makes that the server strips would vanish on save without warning.
//
// No alignment, indent, colour or size on purpose. Quill exports those as CSS
// classes (ql-align-center...), which look right here and arrive unstyled on
// the public site.
const FORMATS = ['header', 'bold', 'italic', 'underline', 'strike', 'blockquote', 'link', 'list', 'image'];

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  ['blockquote', 'link', 'image'],
  [{ list: 'ordered' }, { list: 'bullet' }],
  ['clean'],
];

// Quill's buttons are icons without names; a screen reader would announce
// "button, button, button".
const BUTTON_LABELS: Record<string, string> = {
  'ql-bold': 'Negrito',
  'ql-italic': 'Itálico',
  'ql-underline': 'Sublinhado',
  'ql-strike': 'Tachado',
  'ql-blockquote': 'Citação',
  'ql-link': 'Link',
  'ql-image': 'Foto',
  'ql-list[value="ordered"]': 'Lista numerada',
  'ql-list[value="bullet"]': 'Lista com marcadores',
  'ql-clean': 'Limpar formatação',
};

// Quill 2's getSemanticHTML() turns every space into &nbsp;. Stored as-is, a
// paragraph could never wrap and would overflow a phone screen.
function serialize(quill: Quill): string {
  if (quill.getText().trim().length === 0) return '';
  return quill.getSemanticHTML().replace(/&nbsp;/g, ' ');
}

export type InsertImage = () => Promise<{ url: string; alt: string } | null>;

type Props = {
  id?: string;
  initialHtml: string;
  onChange: (html: string) => void;
  // Called by the toolbar's photo button: uploads a photo and resolves with
  // what to insert (see BodyImageDialog), or null if the writer cancelled.
  onInsertImage?: InsertImage;
  readOnly?: boolean;
  invalid?: boolean;
  label: string;
};

// Uncontrolled on purpose: Quill owns the document while the user types and
// reports changes out. Feeding the value back in on every keystroke would
// reset the cursor. To load a different post, remount with a new `key`.
export function RichTextEditor({ id, initialHtml, onChange, onInsertImage, readOnly, invalid, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const onInsertImageRef = useRef(onInsertImage);
  onInsertImageRef.current = onInsertImage;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Quill inserts its toolbar next to the element it is given. Building that
    // element here, and clearing the host on cleanup, keeps React StrictMode's
    // mount-unmount-mount from leaving two toolbars behind.
    const container = document.createElement('div');
    host.appendChild(container);

    const quill: Quill = new Quill(container, {
      theme: 'snow',
      formats: FORMATS,
      modules: {
        toolbar: {
          container: TOOLBAR,
          handlers: {
            // Photos go through the upload dialog, never as a pasted link.
            image: async () => {
              if (!quill.isEnabled()) return; // a locked post
              const range = quill.getSelection(true);
              const image = await onInsertImageRef.current?.();
              if (!image) return;

              // The photo gets a paragraph of its own: text typed before or
              // after it would otherwise sit glued to the picture.
              let index = range.index;
              const [, offset] = quill.getLine(index);
              if (offset > 0) {
                quill.insertText(index, '\n', 'user');
                index += 1;
              }
              quill.insertEmbed(index, 'image', image.url, 'user');
              quill.formatText(index, 1, 'alt', image.alt, 'user');
              // Close the photo's line, and make sure a line follows it, so
              // the cursor lands on a fresh paragraph under the picture.
              const closesLine = quill.getText(index + 1, 1) === '\n';
              const isLastLine = index + 2 >= quill.getLength();
              if (!closesLine || isLastLine) quill.insertText(index + 1, '\n', 'user');
              quill.setSelection(index + 2, 0, 'user');
            },
          },
        },
        // Dropping or pasting an image file would put the whole picture in
        // the text as base64, which the server strips on save. Ignored here;
        // the photo button is the way in.
        uploader: { handler: () => {} },
      },
      placeholder: 'Escreva o texto aqui…',
    });

    if (initialHtml) {
      // Parses <ul>/<ol> back into Quill's own list format, and keeps the
      // photos already in the text.
      quill.clipboard.dangerouslyPasteHTML(initialHtml, 'silent');
    }

    // Registered after the initial load: from now on, images pasted from
    // other sites are dropped right away instead of vanishing on save.
    const Delta = Quill.import('delta') as typeof import('quill').Delta;
    quill.clipboard.addMatcher('IMG', () => new Delta());

    quill.root.setAttribute('role', 'textbox');
    quill.root.setAttribute('aria-multiline', 'true');
    quill.root.setAttribute('aria-label', label);
    if (id) quill.root.id = id;

    for (const [selector, name] of Object.entries(BUTTON_LABELS)) {
      host.querySelectorAll<HTMLButtonElement>(`button.${selector}`).forEach((button) => {
        button.setAttribute('aria-label', name);
        button.title = name;
      });
    }

    quill.on('text-change', (_delta, _old, source) => {
      if (source === 'silent') return;
      onChangeRef.current(serialize(quill));
    });

    quillRef.current = quill;

    return () => {
      quillRef.current = null;
      host.innerHTML = '';
    };
    // Mount once per key; see the comment on the component.
  }, []);

  useEffect(() => {
    quillRef.current?.enable(!readOnly);
  }, [readOnly]);

  return <div ref={hostRef} className={cx('editor-texto', invalid && 'editor-texto--erro', readOnly && 'opacity-80')} />;
}
