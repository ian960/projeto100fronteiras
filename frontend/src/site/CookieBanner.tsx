import { Button } from '../components/ui';
import { GA_ID, setConsent, useConsent } from '../lib/analytics';

// The cookie notice (LGPD). It only exists when Google Analytics is switched
// on (VITE_GA_ID), and stays until the reader answers. "Recusar" is as easy
// as "Aceitar": the law asks for a real choice.
export default function CookieBanner() {
  const consent = useConsent();
  if (!GA_ID || consent) return null;

  return (
    <section
      aria-label="Aviso de cookies"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-linha bg-papel/95 text-tinta shadow-[0_-4px_16px_rgb(0_0_0/0.08)] backdrop-blur"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-6">
        <p className="text-[0.9375rem] leading-relaxed">
          Usamos cookies do Google Analytics para contar as visitas e saber quais notícias são mais lidas. Nada é usado para
          anúncios. Você aceita?
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="secundario" small onClick={() => setConsent('recusado')}>
            Recusar
          </Button>
          <Button small onClick={() => setConsent('aceito')}>
            Aceitar
          </Button>
        </div>
      </div>
    </section>
  );
}

// For the footer: opens the notice again so the reader can change their mind.
export function CookieSettingsButton({ className }: { className: string }) {
  if (!GA_ID) return null;
  return (
    <button type="button" onClick={() => setConsent(null)} className={className}>
      Cookies
    </button>
  );
}
