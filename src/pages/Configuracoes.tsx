import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Page } from '../components/Page';
import { useAsync } from '../useAsync';
import { isPersisted } from '../storage';

export function Configuracoes() {
  const [persistente] = useAsync(isPersisted);

  return (
    <Page title="Configurações">
      <Link to="/exercicios" className="card flex min-h-16 items-center justify-between text-lg font-semibold">
        Exercícios <ChevronRight className="text-neutral-500" />
      </Link>
      <section className="card">
        <h2 className="text-lg font-semibold">Armazenamento</h2>
        <p className="mt-1 text-neutral-300" data-testid="persistencia">
          {persistente === undefined
            ? 'Verificando…'
            : persistente === null
              ? 'Este navegador não informa se o armazenamento é persistente.'
              : persistente
                ? 'Persistente: o navegador não apagará os dados automaticamente.'
                : 'Não persistente: o navegador pode apagar os dados se faltar espaço.'}
        </p>
      </section>
      <p className="text-center text-sm text-neutral-500" data-testid="versao">
        Versão {__APP_VERSION__} · {__APP_COMMIT__} · {new Date(__APP_BUILD_DATE__).toLocaleDateString('pt-BR')}
      </p>
    </Page>
  );
}
