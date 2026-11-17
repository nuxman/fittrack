/**
 * Modo demonstração: escolhido na abertura do app pela marca em sessionStorage. A marca sobrevive às recargas
 * feitas ao entrar e ao recomeçar, mas some ao fechar o app (aba ou PWA): a próxima abertura usa o banco real.
 */
export const BANCO_REAL = 'fittrack';
export const BANCO_DEMO = 'fittrack-demo';
const CHAVE = 'fittrack-modo';

export function emDemo(): boolean {
  try {
    // 0.8.0 guardava a marca em localStorage (persistia entre aberturas): descarta.
    localStorage.removeItem(CHAVE);
    return sessionStorage.getItem(CHAVE) === 'demo';
  } catch {
    return false;
  }
}

/** Nome do banco Dexie desta abertura do app. */
export const nomeDoBanco = () => (emDemo() ? BANCO_DEMO : BANCO_REAL);

/** Recarregar a página (objeto para os testes poderem espionar; o jsdom não recarrega). */
export const pagina = { recarregar: () => location.reload() };

/** Marca a demonstração para esta aba e recarrega (quem chama já apagou o banco de demonstração). */
export function marcarDemo() {
  sessionStorage.setItem(CHAVE, 'demo');
  pagina.recarregar();
}

export function sairDemo() {
  sessionStorage.removeItem(CHAVE);
  pagina.recarregar();
}
