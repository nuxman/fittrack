import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { useSessao } from './SessaoLayout';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { formatarDuracao, progresso, pulados, tempoAtivoEm } from '../../sessao';

/** Finalizar com RPE (0–10) e observações. ?fim=<timestamp> encerra no horário da última série. */
export function SessaoFinalizar() {
  const { sessao, sets } = useSessao();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const fim = Number(params.get('fim')) || undefined;
  const [rpe, setRpe] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);

  const { feitos, total } = progresso(sessao.planSnapshot.itens, sets, pulados(sessao));
  const duracao = tempoAtivoEm(sessao, fim ?? Date.now());

  const finalizar = async () => {
    if (rpe === null) return setErro('Escolha o RPE do treino (0 a 10).');
    setGravando(true);
    try {
      await workoutSessionsRepository.finalizar(sessao.id, { rpe, observacoes: obs }, fim);
      navigate('/', { replace: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível finalizar');
      setGravando(false);
    }
  };

  return (
    <section className="space-y-4">
      <h1 className="text-3xl font-bold text-primary-400">Finalizar treino</h1>
      <div className="card text-neutral-300">
        <p className="text-lg font-semibold text-neutral-100">{sessao.planSnapshot.nome}</p>
        <p>
          {feitos} de {total} exercícios concluídos · {sets.length} séries · {formatarDuracao(duracao)}
        </p>
        {fim && <p className="text-sm text-neutral-400">Encerrado no horário da última série.</p>}
      </div>

      <fieldset className="card space-y-2">
        <legend className="text-lg font-semibold">Esforço percebido (RPE)</legend>
        <p className="text-sm text-neutral-400">0 = nenhum esforço · 10 = esforço máximo</p>
        <div className="grid grid-cols-6 gap-2">
          {Array.from({ length: 11 }, (_, n) => (
            <button
              key={n}
              type="button"
              aria-pressed={rpe === n}
              className={rpe === n ? 'btn-primary px-0' : 'btn-secondary px-0'}
              onClick={() => {
                setRpe(n);
                setErro(null);
              }}
            >
              {n}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="card block">
        <span className="text-lg font-semibold">Observações</span>
        <textarea className="input mt-2 min-h-28 py-3" value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>

      {erro && (
        <p role="alert" className="text-red-400">
          {erro}
        </p>
      )}
      <button type="button" className="btn-primary w-full" disabled={gravando} onClick={finalizar}>
        <Flag size={22} /> Finalizar treino
      </button>
      <Link to="/sessao" className="btn-secondary w-full">
        Voltar ao treino
      </Link>
    </section>
  );
}
