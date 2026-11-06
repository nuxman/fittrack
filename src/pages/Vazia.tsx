import { Page } from '../components/Page';

export function Vazia({ title }: { title: string }) {
  return (
    <Page title={title}>
      <p className="card text-neutral-400">Nada por aqui ainda.</p>
    </Page>
  );
}
