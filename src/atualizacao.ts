/**
 * Versão nova do app (deploy novo): o service worker novo fica esperando até o usuário tocar em "atualizar".
 * main.tsx registra o service worker e chama `avisarNovaVersao`; o AvisoAtualizacao escuta por `ouvirNovaVersao`.
 */
type Atualizar = () => Promise<void>;

let pendente: Atualizar | null = null;
const ouvintes = new Set<(a: Atualizar | null) => void>();

export function avisarNovaVersao(atualizar: Atualizar) {
  pendente = atualizar;
  for (const f of ouvintes) f(pendente);
}

/** Chama `f` já com o estado atual e a cada versão nova; devolve a função que para de ouvir. */
export function ouvirNovaVersao(f: (a: Atualizar | null) => void): () => void {
  ouvintes.add(f);
  f(pendente);
  return () => void ouvintes.delete(f);
}
