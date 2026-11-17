/** Modo demonstração: escolhido na abertura do app (localStorage); entrar e sair recarregam a página. */
export const BANCO_REAL = 'fittrack';
export const BANCO_DEMO = 'fittrack-demo';
const CHAVE = 'fittrack-modo';

export function emDemo(): boolean {
  try {
    return localStorage.getItem(CHAVE) === 'demo';
  } catch {
    return false;
  }
}

/** Nome do banco Dexie desta abertura do app. */
export const nomeDoBanco = () => (emDemo() ? BANCO_DEMO : BANCO_REAL);

/** Recarregar a página (objeto para os testes poderem espionar; o jsdom não recarrega). */
export const pagina = { recarregar: () => location.reload() };

export function entrarDemo() {
  localStorage.setItem(CHAVE, 'demo');
  pagina.recarregar();
}

export function sairDemo() {
  localStorage.removeItem(CHAVE);
  pagina.recarregar();
}
