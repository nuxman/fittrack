import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Download, Sheet, Upload } from 'lucide-react';
import { useDialog } from './ConfirmDialog';
import { useAsync } from '../useAsync';
import { settingsRepository } from '../db/repositories/settings';
import { backupRepository, BackupInvalidoError, validarBackup, type Previa } from '../db/repositories/backup';
import { demoRepository } from '../db/repositories/demo';
import { pagina } from '../modo';
import { chaveDia } from '../semana';
import { entregarArquivo, textoUltimoBackup } from '../backup';
import { AVISO_FOTOS } from './FotosCorporais';

const TOTAIS: [keyof Previa['totais'], string][] = [
  ['fichas', 'fichas'], ['exercicios', 'exercícios'], ['imagens', 'imagens de exercício'], ['treinos', 'treinos'],
  ['series', 'séries'], ['cardios', 'cardios'], ['medidas', 'medidas'], ['descansos', 'dias de descanso'],
];

/** Configurações → Backup: exportar (JSON) e importar (com pré-visualização e confirmação). */
export function Backup() {
  const [settings, recarregar] = useAsync(() => settingsRepository.get());
  const { escolher, avisar } = useDialog();
  const input = useRef<HTMLInputElement>(null);
  const [ocupado, setOcupado] = useState(false);
  const demo = demoRepository.ativo();
  const secao = useRef<HTMLElement>(null);
  // Link "Faça um backup" do Início (/configuracoes#backup): rola até esta seção.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#backup') secao.current?.scrollIntoView?.({ block: 'start' });
  }, [hash]);

  const exportar = async () => {
    setOcupado(true);
    try {
      const agora = new Date();
      if (await entregarArquivo(`fittrack-backup-${chaveDia(agora)}.json`, await backupRepository.exportar(agora))) {
        await backupRepository.marcarExportado(agora);
        recarregar();
      }
    } finally {
      setOcupado(false);
    }
  };

  const exportarCsv = async (qual: 'series' | 'medidas') => {
    setOcupado(true);
    try {
      const conteudo = qual === 'series' ? await backupRepository.csvSeries() : await backupRepository.csvMedidas();
      await entregarArquivo(`fittrack-${qual}-${chaveDia(new Date())}.csv`, conteudo, true, 'text/csv');
    } finally {
      setOcupado(false);
    }
  };

  const importar = async (f: File) => {
    setOcupado(true);
    try {
      const b = validarBackup(await f.text());
      const p = await backupRepository.previa(b);
      const ok = await escolher({
        titulo: 'Substituir todos os dados deste aparelho?',
        mensagem: (
          <div className="space-y-2" data-testid="previa-backup">
            <p>Backup de {new Date(p.exportadoEm).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}:</p>
            <ul className="list-inside list-disc">
              {TOTAIS.map(([k, rotulo]) => <li key={k}>{p.totais[k]} {rotulo}</li>)}
            </ul>
            {p.fotosApagadas > 0 && <p className="text-red-400">{p.fotosApagadas} {p.fotosApagadas === 1 ? 'foto corporal será apagada' : 'fotos corporais serão apagadas'} (não estão no backup).</p>}
            <p>Antes de substituir, um backup dos dados atuais é baixado automaticamente (fittrack-antes-da-importacao).</p>
          </div>
        ),
        opcoes: [{ label: 'Substituir dados', value: true, variante: 'perigo' }],
      });
      if (!ok) return;
      await entregarArquivo(`fittrack-antes-da-importacao-${chaveDia(new Date())}.json`, await backupRepository.exportar(), false);
      await backupRepository.importar(b);
      pagina.recarregar();
    } catch (e) {
      await avisar('Backup não importado', e instanceof BackupInvalidoError ? e.message : 'Não foi possível ler o arquivo. Nenhum dado foi alterado.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section ref={secao} id="backup" className="card space-y-3" aria-label="Backup">
      <h2 className="text-lg font-semibold">Backup</h2>
      <p className="text-neutral-300">
        Seus dados ficam só neste aparelho. Eles se perdem se você limpar os dados do navegador ou trocar de aparelho sem um backup.
      </p>
      <p className="text-sm text-neutral-400">{AVISO_FOTOS}</p>
      {demo && <p className="text-sm text-primary-400">Você está no modo demonstração: o backup é dos dados de exemplo.</p>}
      <p className="text-neutral-300" data-testid="ultimo-backup">{settings ? textoUltimoBackup(settings.ultimoBackupEm, new Date()) : ' '}</p>
      <button type="button" className="btn-primary w-full" disabled={ocupado} onClick={() => void exportar()}>
        <Download size={22} /> Exportar backup
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Arquivo do backup"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importar(f);
        }}
      />
      <button type="button" className="btn-secondary w-full" disabled={ocupado} onClick={() => input.current?.click()}>
        <Upload size={22} /> Importar backup
      </button>
      <p className="text-sm text-neutral-400">Planilhas (CSV) para abrir no Excel ou no Google Planilhas. Não servem para restaurar. No LibreOffice, marque 'Detectar números especiais' ao abrir.</p>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-secondary px-2" disabled={ocupado} onClick={() => void exportarCsv('series')}>
          <Sheet size={20} /> Séries (CSV)
        </button>
        <button type="button" className="btn-secondary px-2" disabled={ocupado} onClick={() => void exportarCsv('medidas')}>
          <Sheet size={20} /> Medidas (CSV)
        </button>
      </div>
    </section>
  );
}
