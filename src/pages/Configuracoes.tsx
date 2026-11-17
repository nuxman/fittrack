import { Link } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Page } from '../components/Page';
import { useAsync } from '../useAsync';
import { isPersisted } from '../storage';
import { AlertasDescanso } from '../components/AlertasDescanso';
import { useDialog } from '../components/ConfirmDialog';
import { emDemo, entrarDemo, sairDemo } from '../modo';
import { demoRepository } from '../db/repositories/demo';

export function Configuracoes() {
  const [persistente] = useAsync(isPersisted);
  const { confirmar } = useDialog();
  const demo = emDemo();
  const recomecar = async () => {
    if (await confirmar('Recomeçar demonstração?', 'Apaga o que você fez na demonstração e cria de novo os treinos de exemplo.', 'Recomeçar')) {
      await demoRepository.recomecar();
    }
  };

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
      <AlertasDescanso />
      <section className="card space-y-3" aria-label="Modo demonstração">
        <h2 className="text-lg font-semibold">Modo demonstração</h2>
        {demo ? (
          <>
            <p className="text-neutral-300">Você está vendo dados de exemplo. Seus dados reais continuam guardados, sem nenhuma alteração.</p>
            <button type="button" className="btn-secondary w-full" onClick={() => void recomecar()}>Recomeçar demonstração</button>
            <button type="button" className="btn-primary w-full" onClick={() => sairDemo()}>Sair do modo demonstração</button>
          </>
        ) : (
          <>
            <p className="text-neutral-300">
              Abre o app com cerca de 4 semanas de treinos de exemplo, num banco separado. Seus dados reais não são lidos nem alterados.
            </p>
            <button type="button" className="btn-secondary w-full" onClick={() => entrarDemo()}>Entrar no modo demonstração</button>
          </>
        )}
      </section>
      <p className="text-center text-sm text-neutral-500" data-testid="versao">
        Versão {__APP_VERSION__} · {__APP_COMMIT__} · {new Date(__APP_BUILD_DATE__).toLocaleDateString('pt-BR')}
      </p>
    </Page>
  );
}
