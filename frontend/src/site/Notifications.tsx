import { Link } from 'react-router';
import { Alert, Button, Loading } from '../components/ui';
import { usePush } from '../lib/push';

// The "Ativar notificações" switch on the site (src/lib/push.ts does the
// work). Discreet on purpose: a line in the footer, and a card in Minha conta
// and on the help page. The browser's permission prompt only ever appears
// after a click here.

const link = 'font-medium text-anil hover:underline underline-offset-4';

// A line in the footer, next to "Cookies". Hidden where it cannot work.
export function PushFooterButton({ className }: { className: string }) {
  const push = usePush();

  if (push.state === 'on' || push.state === 'off') {
    return (
      <>
        <button
          type="button"
          className={className}
          disabled={push.busy}
          aria-pressed={push.state === 'on'}
          onClick={() => void (push.state === 'on' ? push.disable() : push.enable())}
        >
          {push.busy ? 'Aguarde…' : push.state === 'on' ? 'Desativar notificações' : 'Ativar notificações'}
        </button>
        {push.error && (
          <span role="alert" className="basis-full text-sm text-white/80">
            {push.error}
          </span>
        )}
      </>
    );
  }

  // Blocked, or an iPhone outside the Home Screen: the help page explains.
  if (push.state === 'blocked' || push.state === 'ios-needs-home-screen') {
    return (
      <Link to="/ajuda#notificacoes" className={className}>
        Notificações
      </Link>
    );
  }

  return null;
}

// The card on Minha conta and on the help page: the switch and what it does.
export function PushSettings({ id }: { id?: string }) {
  const push = usePush();

  return (
    <section id={id} className="scroll-mt-24 rounded-lg border border-linha bg-papel p-5">
      <h2 className="font-semibold">Notificações neste aparelho</h2>
      <p className="mb-4 mt-1 text-sm text-tinta-suave">
        Um aviso no celular ou no computador quando sair uma notícia importante, mesmo com o site fechado. É opcional, vale só para este
        navegador e você desliga quando quiser.
      </p>

      {push.state === 'loading' ? (
        <Loading />
      ) : push.state === 'unsupported' ? (
        <p className="text-[0.9375rem]">Este navegador não recebe notificações do site.</p>
      ) : push.state === 'ios-needs-home-screen' ? (
        <div className="flex flex-col gap-2 text-[0.9375rem]">
          <p>
            No iPhone e no iPad, as notificações só funcionam com o site na Tela de Início (iOS 16.4 ou mais novo):
          </p>
          <ol className="ml-5 list-decimal">
            <li>No Safari, toque em Compartilhar (o quadrado com a seta para cima).</li>
            <li>Escolha &ldquo;Adicionar à Tela de Início&rdquo;.</li>
            <li>Abra o portal pelo ícone novo e ative as notificações aqui.</li>
          </ol>
        </div>
      ) : push.state === 'blocked' ? (
        <p className="text-[0.9375rem]">
          As notificações deste site estão bloqueadas no navegador. Para receber, libere em Configurações do site (o cadeado ao lado do
          endereço) e recarregue a página.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-[0.9375rem]">
            {push.state === 'on' ? 'Ligadas: você recebe as notificações neste aparelho.' : 'Desligadas neste aparelho.'}
          </p>
          <div>
            {push.state === 'on' ? (
              <Button variant="secundario" busy={push.busy} onClick={() => void push.disable()}>
                Desativar notificações
              </Button>
            ) : (
              <Button busy={push.busy} onClick={() => void push.enable()}>
                Ativar notificações
              </Button>
            )}
          </div>
          {push.state === 'off' && (
            <p className="text-sm text-tinta-suave">
              O navegador vai perguntar se você permite. Veja a{' '}
              <Link to="/privacidade" className={link}>
                Política de Privacidade
              </Link>
              .
            </p>
          )}
        </div>
      )}
      {push.error && (
        <div className="mt-3">
          <Alert>{push.error}</Alert>
        </div>
      )}
    </section>
  );
}
