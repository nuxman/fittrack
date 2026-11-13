import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Flag } from 'lucide-react';
import { useSessao } from './SessaoLayout';
import { EscolhaRpe } from '../../components/EscolhaRpe';
import { useDialog } from '../../components/ConfirmDialog';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { workoutPlansRepository } from '../../db/repositories/workoutPlans';
import { useAsync } from '../../useAsync';
import { formatarDuracao, mudancasNaSessao, progresso, pulados, tempoAtivoEm } from '../../sessao';

/** Finalizar com RPE (0–10) e observações. ?fim=<timestamp> encerra no horário da última série. */
export function SessaoFinalizar() {
  const { sessao, sets } = useSessao();
  const navigate = useNavigate();
  const { escolher } = useDialog();
  const [params] = useSearchParams();
  const fim = Number(params.get('fim')) || undefined;
  const [rpe, setRpe] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [ficha] = useAsync(() => workoutPlansRepository.get(sessao.planId), [sessao.planId]);
  // Base: os itens do início da sessão (edições da ficha durante o treino não contam); sessões antigas, a ficha.
  const iniciais = sessao.itensIniciais ?? ficha?.itens;
  const mudancas = iniciais ? mudancasNaSessao(iniciais, sessao.planSnapshot.itens) : [];
  // "Aplicar também na ficha?": escolha por mudança, nenhuma marcada por padrão.
  const [aplicar, setAplicar] = useState<string[]>([]);

  const { feitos, total } = progresso(sessao.planSnapshot.itens, sets, pulados(sessao));
  const duracao = tempoAtivoEm(sessao, fim ?? Date.now());

  const finalizar = async () => {
    if (rpe === null) return setErro('Escolha o RPE do treino (0 a 10).');
    setGravando(true);
    try {
      const escolhidas = mudancas.filter((m) => aplicar.includes(m.exerciseId));
      if (ficha && escolhidas.length) {
        // Item removido da ficha durante o treino: a mudança dele é ignorada.
        const itens = ficha.itens.map((i) => {
          const m = escolhidas.find((x) => x.exerciseId === i.exerciseId);
          return m ? { ...i, ...m.novo } : i;
        });
        if (new Set(itens.map((i) => i.exerciseId)).size < itens.length) throw new Error('A ficha já tem o exercício substituto; desmarque essa substituição.');
        await workoutPlansRepository.update(ficha.id, { itens });
      }
      await workoutSessionsRepository.finalizar(sessao.id, { rpe, observacoes: obs }, fim);
      const cardio = await escolher({
        titulo: 'Fazer cardio agora?',
        opcoes: [
          { label: 'Sim', value: true },
          { label: 'Hoje não', value: false, variante: 'secundaria' },
        ],
        semCancelar: true,
      });
      if (cardio) {
        await workoutSessionsRepository.iniciarCardio(sessao.id);
        navigate(`/cardio/${sessao.id}`, { replace: true });
      } else navigate('/', { replace: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível finalizar');
      setGravando(false);
    }
  };

  return (
    <section className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 pb-6 pt-4 safe-bottom">
      <h1 className="text-3xl font-bold text-primary-400">Finalizar treino</h1>
      <div className="card text-neutral-300">
        <p className="text-lg font-semibold text-neutral-100">{sessao.planSnapshot.nome}</p>
        <p>
          {feitos} de {total} exercícios concluídos · {sets.length} séries · {formatarDuracao(duracao)}
        </p>
        {fim && <p className="text-sm text-neutral-400">Encerrado no horário da última série.</p>}
      </div>

      <EscolhaRpe
        valor={rpe}
        onChange={(n) => {
          setRpe(n);
          setErro(null);
        }}
      />

      {mudancas.length > 0 && (
        <fieldset className="card space-y-2">
          <legend className="text-lg font-semibold">Aplicar também na ficha?</legend>
          <p className="text-sm text-neutral-400">Mudanças feitas neste treino. Marque as que devem valer nos próximos.</p>
          {mudancas.map((m) => (
            <label key={m.exerciseId} className="flex min-h-11 items-center gap-3">
              <input
                type="checkbox"
                className="h-6 w-6 shrink-0 accent-primary-400"
                checked={aplicar.includes(m.exerciseId)}
                onChange={(e) => setAplicar((a) => (e.target.checked ? [...a, m.exerciseId] : a.filter((x) => x !== m.exerciseId)))}
              />
              <span>{m.descricao}</span>
            </label>
          ))}
        </fieldset>
      )}

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
