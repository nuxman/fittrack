import { descricaoRpe } from '../sessao';

/** Botões 0–10 com a explicação da nota escolhida (Finalizar treino e Concluir cardio). */
export function EscolhaRpe({ valor, onChange }: { valor: number | null; onChange: (n: number) => void }) {
  return (
    <fieldset className="card space-y-2">
      <legend className="text-lg font-semibold">Esforço percebido (RPE)</legend>
      <p className="text-sm text-neutral-400">0 = nenhum esforço · 10 = esforço máximo</p>
      <div className="grid grid-cols-6 gap-2">
        {Array.from({ length: 11 }, (_, n) => (
          <button key={n} type="button" aria-pressed={valor === n} className={valor === n ? 'btn-primary px-0' : 'btn-secondary px-0'} onClick={() => onChange(n)}>
            {n}
          </button>
        ))}
      </div>
      {valor !== null && (
        <p className="text-neutral-200" data-testid="descricao-rpe">
          {valor}: {descricaoRpe(valor)}
        </p>
      )}
    </fieldset>
  );
}
