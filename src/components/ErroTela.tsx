import { Link, useRouteError } from 'react-router-dom';

/** errorElement das rotas, em português. "Tentar de novo" recarrega a página (resolve também arquivo antigo apagado por um deploy novo). */
export function ErroTela({ titulo = 'Algo deu errado.' }: { titulo?: string }) {
  console.error(useRouteError());
  return (
    <main role="alert" className="mx-auto max-w-xl space-y-4 px-4 pb-nav pt-6">
      <h1 className="text-2xl font-bold text-primary-400">{titulo}</h1>
      <p className="text-neutral-300">Verifique a internet e tente de novo. Seus dados continuam salvos no aparelho.</p>
      <button type="button" className="btn-primary w-full" onClick={() => window.location.reload()}>
        Tentar de novo
      </button>
      <Link to="/" className="btn-secondary w-full">
        Voltar ao início
      </Link>
    </main>
  );
}
