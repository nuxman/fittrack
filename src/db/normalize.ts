/** "  Remada  com Apóio " → "remada com apoio" (sem acentos, minúsculas, espaços colapsados). */
export function normalizeNome(nome: string): string {
  return nome.normalize('NFD').replace(/\p{Diacritic}/gu, '').trim().replace(/\s+/g, ' ').toLocaleLowerCase('pt-BR');
}
