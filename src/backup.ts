/** Lembrete de backup (regras puras) e entrega do arquivo exportado. */

const DIA_MS = 864e5;
export const LEMBRETE_DIAS = 14;

/** Dias inteiros desde o último backup (null = nunca). */
export const diasSemBackup = (ultimoBackupEm: string | undefined, agora: Date) =>
  ultimoBackupEm ? Math.floor((agora.getTime() - Date.parse(ultimoBackupEm)) / DIA_MS) : null;

export function textoUltimoBackup(ultimoBackupEm: string | undefined, agora: Date) {
  const d = diasSemBackup(ultimoBackupEm, agora);
  return d === null ? 'Nenhum backup feito' : d <= 0 ? 'Último backup: hoje' : `Último backup: há ${d} ${d === 1 ? 'dia' : 'dias'}`;
}

/** Início: lembra com 14 dias ou mais sem backup (ou nenhum), só se já houver treino registrado. */
export const lembrarBackup = (ultimoBackupEm: string | undefined, temTreino: boolean, agora: Date) => {
  const d = diasSemBackup(ultimoBackupEm, agora);
  return temTreino && (d === null || d >= LEMBRETE_DIAS);
};

/** Compartilha o arquivo (Drive, WhatsApp, e-mail) quando o navegador aceita; senão, baixa. Cancelar o compartilhamento devolve false. */
export async function entregarArquivo(nome: string, conteudo: string, compartilhar = true, tipo = 'application/json'): Promise<boolean> {
  const arquivo = new File([conteudo], nome, { type: tipo });
  if (compartilhar && navigator.canShare?.({ files: [arquivo] })) {
    try {
      await navigator.share({ files: [arquivo], title: nome });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return false;
      // Outra falha do compartilhamento: baixa o arquivo.
    }
  }
  const url = URL.createObjectURL(arquivo);
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return true;
}
