import { ButtonLink } from '../../components/ui';
import { useDocumentTitle } from '../../lib/hooks';

export default function NotFoundPage({ what = 'página' }: { what?: string }) {
  useDocumentTitle('Não encontrada');
  return (
    <div className="mx-auto max-w-xl py-16 text-center">
      <p className="titulo text-4xl text-anil">Esta {what} não existe</p>
      <p className="mt-3 text-tinta-suave">
        O endereço pode ter sido digitado errado, ou a {what} foi retirada do ar.
      </p>
      <div className="mt-8 flex justify-center gap-3">
        <ButtonLink to="/">Ir para a página inicial</ButtonLink>
        <ButtonLink to="/busca" variant="secundario">
          Buscar
        </ButtonLink>
      </div>
    </div>
  );
}
