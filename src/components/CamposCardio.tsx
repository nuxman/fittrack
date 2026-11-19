import { useId } from 'react';
import { ehEscada, NOME_MODALIDADE, trocarModalidade } from '../cardio';
import type { ModalidadeCardio, RascunhoCardio } from '../db/types';

const MODALIDADES = Object.entries(NOME_MODALIDADE) as [ModalidadeCardio, string][];

/** Modalidade e campos do cardio (pós-treino e avulso). Escada: nível e andares; as outras: inclinação, velocidade e distância. */
export function CamposCardio({ r, mudar, duracaoRef, duracaoDesabilitada }: {
  r: RascunhoCardio;
  mudar: (m: Partial<RascunhoCardio>) => void;
  duracaoRef?: React.Ref<HTMLInputElement>;
  duracaoDesabilitada?: boolean;
}) {
  const escada = ehEscada(r.modalidade);
  return (
    <>
      <fieldset className="space-y-1">
        <legend className="text-sm text-neutral-400">Modalidade</legend>
        <div className="grid grid-cols-2 gap-2">
          {MODALIDADES.map(([v, rotulo]) => (
            <button key={v} type="button" aria-pressed={r.modalidade === v} className={r.modalidade === v ? 'btn-primary px-1' : 'btn-secondary px-1'} onClick={() => mudar(trocarModalidade(r, v))}>
              {rotulo}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <Campo rotulo="Duração (min)" valor={r.duracaoMin} inputMode="numeric" desabilitado={duracaoDesabilitada} entrada={duracaoRef} onChange={(v) => mudar({ duracaoMin: v })} />
        {escada ? (
          <>
            <Campo rotulo="Nível" valor={r.inclinacao} placeholder='ex.: "nível 8"' onChange={(v) => mudar({ inclinacao: v })} />
            <Campo rotulo="Andares" valor={r.andares ?? ''} inputMode="numeric" onChange={(v) => mudar({ andares: v })} />
          </>
        ) : (
          <>
            <Campo rotulo="Inclinação" valor={r.inclinacao} placeholder='ex.: "nível 7"' onChange={(v) => mudar({ inclinacao: v })} />
            <Campo rotulo="Velocidade (km/h)" valor={r.velocidade} inputMode="decimal" onChange={(v) => mudar({ velocidade: v })} />
            <Campo rotulo="Distância (km)" valor={r.distancia} inputMode="decimal" onChange={(v) => mudar({ distancia: v })} />
          </>
        )}
        <Campo rotulo="FC média (bpm)" valor={r.fc} inputMode="numeric" onChange={(v) => mudar({ fc: v })} />
      </div>
      {!escada && <p className="text-xs text-neutral-500">"Nível 7" é o nível do aparelho, não 7% de inclinação.</p>}
    </>
  );
}

interface CampoProps {
  rotulo: string;
  valor: string;
  inputMode?: 'decimal' | 'numeric';
  placeholder?: string;
  desabilitado?: boolean;
  entrada?: React.Ref<HTMLInputElement>;
  onChange: (v: string) => void;
}

function Campo({ rotulo, valor, inputMode, placeholder, desabilitado, entrada, onChange }: CampoProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-neutral-300">
        {rotulo}
      </label>
      <input id={id} ref={entrada} className="input" inputMode={inputMode} placeholder={placeholder} value={valor} disabled={desabilitado} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
