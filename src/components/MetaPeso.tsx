import { useState } from 'react';
import { useAsync } from '../useAsync';
import { settingsRepository } from '../db/repositories/settings';
import { bodyMeasurementsRepository } from '../db/repositories/bodyMeasurements';
import { direcaoMeta, direcaoPorPeso, lerMedida, LIMITES, resumoPeso } from '../medidas';
import type { DirecaoMeta } from '../db/types';
import { num } from './CampoSerie';

/**
 * Configurações → Meta de peso (opcional; vazio remove a meta). Aparece no bloco de peso do Início, sem julgamento.
 * Ao salvar, grava a direção: meta abaixo do peso atual = perder, acima = ganhar; sem peso (ou meta igual ao peso), pergunta.
 */
export function MetaPeso() {
  const [dados] = useAsync(async () => {
    const [settings, medicoes] = await Promise.all([settingsRepository.get(), bodyMeasurementsRepository.list()]);
    return { settings, medicoes, pesoAtual: resumoPeso(medicoes)?.atual.pesoKg ?? null };
  });
  if (!dados) return null;
  const { settings, medicoes, pesoAtual } = dados;
  return (
    <Campo
      key={settings.updatedAt}
      inicial={settings.metaPesoKg != null ? num(settings.metaPesoKg) : ''}
      direcaoInicial={direcaoMeta(settings, medicoes)}
      pesoAtual={pesoAtual}
    />
  );
}

const ROTULO: Record<DirecaoMeta, string> = { perder: 'Quero perder', ganhar: 'Quero ganhar' };

function Campo({ inicial, direcaoInicial, pesoAtual }: { inicial: string; direcaoInicial: DirecaoMeta | null; pesoAtual: number | null }) {
  const [texto, setTexto] = useState(inicial);
  const [direcao, setDirecao] = useState(direcaoInicial);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);

  // Meta digitada (ou null se vazia/inválida), para decidir se a pergunta aparece.
  let digitada: number | null = null;
  try {
    digitada = lerMedida(texto, '', ...LIMITES.peso);
  } catch {
    digitada = null;
  }
  const deduzida = digitada !== null && pesoAtual !== null ? direcaoPorPeso(digitada, pesoAtual) : null;
  const perguntar = digitada !== null && deduzida === null;

  const salvar = async () => {
    try {
      const meta = lerMedida(texto, 'Meta de peso (kg)', ...LIMITES.peso);
      if (meta === null) {
        await settingsRepository.update({ metaPesoKg: undefined, metaDirecao: undefined });
        return setMsg({ erro: false, texto: 'Meta removida.' });
      }
      const d = deduzida ?? direcao;
      if (!d) return setMsg({ erro: true, texto: 'Escolha se quer perder ou ganhar peso.' });
      await settingsRepository.update({ metaPesoKg: meta, metaDirecao: d });
      setDirecao(d);
      setMsg({ erro: false, texto: 'Meta salva.' });
    } catch (e) {
      setMsg({ erro: true, texto: e instanceof Error ? e.message : 'Não foi possível salvar' });
    }
  };
  return (
    <section className="card space-y-2" aria-labelledby="meta-titulo">
      <h2 id="meta-titulo" className="text-lg font-semibold">Meta de peso</h2>
      <label className="block">
        <span className="mb-1 block text-sm text-neutral-300">Meta (kg), opcional</span>
        <input className="input" inputMode="decimal" value={texto} onChange={(e) => { setTexto(e.target.value); setMsg(null); }} />
      </label>
      {perguntar && (
        <div role="group" aria-label="Direção da meta" className="grid grid-cols-2 gap-2">
          {(['perder', 'ganhar'] as const).map((d) => (
            <button key={d} type="button" aria-pressed={direcao === d} className={direcao === d ? 'btn-primary px-1' : 'btn-secondary px-1'} onClick={() => { setDirecao(d); setMsg(null); }}>
              {ROTULO[d]}
            </button>
          ))}
        </div>
      )}
      <button type="button" className="btn-secondary w-full" onClick={() => void salvar()}>Salvar meta</button>
      {msg && <p role={msg.erro ? 'alert' : 'status'} className={msg.erro ? 'text-red-400' : 'text-neutral-300'}>{msg.texto}</p>}
    </section>
  );
}
