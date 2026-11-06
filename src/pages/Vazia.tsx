import { Link } from 'react-router-dom';
import { Page } from '../components/Page';

/** Estado vazio: diz o que vai aparecer e como começar. */
export function Vazia({ title, mensagem }: { title: string; mensagem: string }) {
  return (
    <Page title={title}>
      <div className="card space-y-4">
        <p className="text-lg text-neutral-300">{mensagem}</p>
        <Link to="/treinar" className="btn-primary w-full">Ir para Treinar</Link>
      </div>
    </Page>
  );
}
