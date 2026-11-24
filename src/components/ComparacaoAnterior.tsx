import type { ExerciseSet, SnapshotItem } from '../db/types';
import { totaisTreino, variacaoPct, type TotaisTreino } from '../evolucao';

const n = (v: number) => v.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const ddmm = (iso: string) => new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

interface Props {
  sets: Pick<ExerciseSet, 'exerciseId' | 'carga' | 'reps'>[];
  itens: Pick<SnapshotItem, 'exerciseId' | 'tipo' | 'unidadeCarga' | 'porLado'>[];
  anterior?: { iniciadaEm: string; totais: TotaisTreino };
  /** Topo da execução: uma linha só, sem barras (não pode empurrar os campos da série). */
  compacto?: boolean;
}

type Linha = { rotulo: string; unidade: string; hoje: number; antes: number | null };

/**
 * Hoje contra o último treino concluído da mesma ficha: carga total (kg), volume (kg) e repetições.
 * As barras enchem a cada série registrada (100% = total do anterior). Sem anterior: só os totais de hoje.
 */
export function ComparacaoAnterior({ sets, itens, anterior, compacto = false }: Props) {
  const hoje = totaisTreino(sets, itens);
  const a = anterior?.totais;
  const linhas: Linha[] = [
    // Carga e volume em kg só aparecem se algum dos dois treinos teve série em kg.
    ...(hoje.cargaKg !== null || a?.cargaKg != null ? [{ rotulo: 'Carga total', unidade: ' kg', hoje: hoje.cargaKg ?? 0, antes: a ? a.cargaKg ?? 0 : null }] : []),
    ...(hoje.volumeKg !== null || a?.volumeKg != null ? [{ rotulo: 'Volume', unidade: ' kg', hoje: hoje.volumeKg ?? 0, antes: a ? a.volumeKg ?? 0 : null }] : []),
    { rotulo: 'Repetições', unidade: '', hoje: hoje.reps, antes: a ? a.reps : null },
  ];

  if (compacto) {
    const vol = linhas.find((l) => l.rotulo === 'Volume') ?? linhas.at(-1)!;
    return (
      <p className="text-xs text-neutral-400" data-testid="comparacao-compacta">
        {vol.rotulo}: {n(vol.hoje)}{vol.unidade}
        {vol.antes !== null ? ` / ${n(vol.antes)}${vol.unidade} no anterior` : ' · primeiro treino desta ficha'}
      </p>
    );
  }

  return (
    <section className="card space-y-2" aria-label="Comparado ao treino anterior" data-testid="comparacao-anterior">
      <h2 className="text-sm font-semibold uppercase text-neutral-400">
        {anterior ? `Hoje / treino de ${ddmm(anterior.iniciadaEm)}` : 'Primeiro treino desta ficha'}
      </h2>
      {linhas.map((l) => {
        const pct = l.antes ? Math.min(100, (l.hoje / l.antes) * 100) : l.hoje > 0 ? 100 : 0;
        const varia = l.antes !== null ? variacaoPct(l.hoje, l.antes) : null;
        return (
          <div key={l.rotulo} data-testid="barra-comparacao">
            <p className="flex items-baseline justify-between gap-2 text-sm">
              <span className="text-neutral-300">{l.rotulo}</span>
              <span className="tabular-nums">
                {n(l.hoje)}
                {l.antes !== null && <span className="text-neutral-400">/{n(l.antes)}</span>}
                {l.unidade}
                {varia && <span className={`ml-2 font-semibold ${varia.startsWith('+') ? 'text-primary-400' : 'text-neutral-300'}`}>{varia}</span>}
              </span>
            </p>
            {l.antes !== null && (
              <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-raised" role="progressbar" aria-label={l.rotulo} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pct)}>
                <div className="h-full rounded-full bg-primary-400 transition-[width]" style={{ width: `${pct}%` }} />
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}
