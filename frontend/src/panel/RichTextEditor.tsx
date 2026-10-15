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
const FORMATS = ['header', 'bold', 'italic', 'underline', 'strike', 'blockquote', 'link', 'list'];

const TOOLBAR = [
  [{ header: [2, 3, false] }],
  ['bold', 'italic', 'underline', 'strike'],
  ['blockquote', 'link'],
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

type Props = {
  id?: string;
  initialHtml: string;
  onChange: (html: string) => void;
  readOnly?: boolean;
  invalid?: boolean;
  label: string;
};

// Uncontrolled on purpose: Quill owns the document while the user types and
// reports changes out. Feeding the value back in on every keystroke would
// reset the cursor. To load a different post, remount with a new `key`.
export function RichTextEditor({ id, initialHtml, onChange, readOnly, invalid, label }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<Quill | null>(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    // Quill inserts its toolbar next to the element it is given. Building that
    // element here, and clearing the host on cleanup, keeps React StrictMode's
    // mount-unmount-mount from leaving two toolbars behind.
    const container = document.createElement('div');
    host.appendChild(container);

    const quill = new Quill(container, {
      theme: 'snow',
      formats: FORMATS,
      modules: { toolbar: TOOLBAR },
      placeholder: 'Escreva o texto aqui…',
    });

    if (initialHtml) {
      // Parses <ul>/<ol> back into Quill's own list format.
      quill.clipboard.dangerouslyPasteHTML(initialHtml, 'silent');
    }

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
