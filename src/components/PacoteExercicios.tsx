import { useRef, useState } from 'react';
import { PackageOpen, PackagePlus } from 'lucide-react';
import { useDialog } from './ConfirmDialog';
import { BackupInvalidoError, conferirTamanho } from '../db/repositories/backup';
import { exportarPacote, importarPacote, previaPacote, validarPacote } from '../db/repositories/pacote';
import { chaveDia } from '../semana';
import { entregarArquivo } from '../backup';

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/** Configurações → Backup → pacote de exercícios: levar exercícios (e fichas, se marcado) para outro aparelho. */
export function PacoteExercicios({ ocupado, setOcupado }: { ocupado: boolean; setOcupado: (v: boolean) => void }) {
  const { escolher, avisar } = useDialog();
  const input = useRef<HTMLInputElement>(null);
  const [fichas, setFichas] = useState(false);
  const [msg, setMsg] = useState('');

  const exportar = async () => {
    setOcupado(true);
    try {
      await entregarArquivo(`fittrack-exercicios-${chaveDia(new Date())}.json`, await exportarPacote({ fichas }));
    } finally {
      setOcupado(false);
    }
  };

  const importar = async (f: File) => {
    setOcupado(true);
    setMsg('');
    try {
      conferirTamanho(f.size);
      const pacote = validarPacote(await f.text());
      const p = await previaPacote(pacote);
      const ok = await escolher({
        titulo: 'Importar pacote de exercícios?',
        mensagem: (
          <div className="space-y-2" data-testid="previa-pacote">
            <p>Nada deste aparelho é apagado. Exercícios com o mesmo nome são juntados.</p>
            <ul className="list-inside list-disc">
              <li>{plural(p.novos, 'exercício novo', 'exercícios novos')}</li>
              {p.restaurados > 0 && <li>{plural(p.restaurados, 'exercício excluído será restaurado', 'exercícios excluídos serão restaurados')}</li>}
              <li>{plural(p.ganhamFoto, 'exercício ganha foto', 'exercícios ganham foto')}</li>
              <li>{plural(p.jaTemFoto, 'exercício já tem foto (mantida)', 'exercícios já têm foto (mantidas)')}</li>
              <li>{plural(p.fichas, 'ficha', 'fichas')}{p.conflitos.length > 0 && ` (${p.conflitos.length} em dia já ocupado)`}</li>
            </ul>
          </div>
        ),
        opcoes: [{ label: 'Importar', value: true }],
      });
      if (!ok) return;
      const substituir = new Set<string>();
      for (const c of p.conflitos) {
        const r = await escolher({
          titulo: `${c.rotulo} já tem a ficha "${c.ocupante.nome}"`,
          mensagem: `O pacote traz a ficha "${c.ficha.nome}" para esse dia.`,
          opcoes: [
            { label: 'Pular esta ficha', value: 'pular' as const, variante: 'secundaria' },
            { label: `Substituir "${c.ocupante.nome}"`, value: 'substituir' as const, variante: 'perigo' },
          ],
          semCancelar: true,
        });
        if (r === 'substituir') substituir.add(c.ficha.id);
      }
      await importarPacote(pacote, substituir);
      setMsg('Pacote importado.');
    } catch (e) {
      await avisar('Pacote não importado', e instanceof BackupInvalidoError ? e.message : 'Não foi possível ler o arquivo. Nenhum dado foi alterado.');
    } finally {
      setOcupado(false);
    }
  };

  return (
    <div className="space-y-3 border-t border-neutral-800 pt-3" role="group" aria-label="Pacote de exercícios">
      <h3 className="font-semibold">Pacote de exercícios</h3>
      <p className="text-sm text-neutral-400">
        Para outro aparelho: leva os exercícios, as fotos deles e os aparelhos ligados. Nunca leva treinos, cardio, medidas, fotos corporais nem configurações.
      </p>
      <label className="flex min-h-12 items-center gap-3">
        <input type="checkbox" className="h-6 w-6 accent-amber-400" checked={fichas} onChange={(e) => setFichas(e.target.checked)} />
        <span>Incluir fichas de treino</span>
      </label>
      <button type="button" className="btn-secondary w-full" disabled={ocupado} onClick={() => void exportar()}>
        <PackagePlus size={22} /> Exportar pacote de exercícios
      </button>
      <input
        ref={input}
        type="file"
        accept="application/json,.json"
        className="hidden"
        aria-label="Arquivo do pacote de exercícios"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = '';
          if (f) void importar(f);
        }}
      />
      <button type="button" className="btn-secondary w-full" disabled={ocupado} onClick={() => input.current?.click()}>
        <PackageOpen size={22} /> Importar pacote de exercícios
      </button>
      {msg && <p role="status" className="text-primary-400">{msg}</p>}
    </div>
  );
}
