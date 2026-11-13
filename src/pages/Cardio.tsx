import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Check, Play } from 'lucide-react';
import { useAsync } from '../useAsync';
import { useAgora } from '../useAgora';
import { useWakeLock } from '../useWakeLock';
import { useDialog } from '../components/ConfirmDialog';
import { ContagemDescanso } from '../components/RestTimer';
import { EscolhaRpe } from '../components/EscolhaRpe';
import { workoutSessionsRepository } from '../db/repositories/workoutSessions';
import { cardioSessionsRepository } from '../db/repositories/cardioSessions';
import { settingsRepository } from '../db/repositories/settings';
import { opcoesSom, prepararAudio } from '../somDescanso';
import { minutosEntre, rascunhoPadrao, validarCardio } from '../cardio';
import type { CardioEmCurso, ModalidadeCardio, RascunhoCardio, UserSettings, WorkoutSession } from '../db/types';

const MODALIDADES: [ModalidadeCardio, string][] = [['esteira', 'Esteira'], ['bicicleta', 'Bicicleta'], ['caminhada', 'Caminhada']];
const AVISO_CARDIO = ['Cardio terminado', 'Tempo concluído.'] as const;

/** Cardio pós-treino: /cardio/:sessionId. ?duracao=1 abre com o campo de duração em foco. */
export function Cardio() {
  const { sessionId = '' } = useParams();
  const [dados, recarregar] = useAsync(
    async () => ({ sessao: await workoutSessionsRepository.get(sessionId), settings: await settingsRepository.get() }),
    [sessionId],
  );
  if (!dados) return <main className="mx-auto max-w-xl px-4 pt-6">Carregando…</main>;
  const { sessao, settings } = dados;
  if (!sessao?.cardio) return <Navigate to="/" replace />;
  return <TelaCardio sessao={sessao} cardio={sessao.cardio} settings={settings} recarregar={recarregar} />;
}

interface Props {
  sessao: WorkoutSession;
  cardio: CardioEmCurso;
  settings: UserSettings;
  recarregar: () => void;
}

function TelaCardio({ sessao, cardio, settings, recarregar }: Props) {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { confirmar } = useDialog();
  const agora = useAgora(250);
  const [r, setR] = useState<RascunhoCardio>(() => cardio.rascunho ?? rascunhoPadrao(settings.cardioPadrao));
  const [rpe, setRpe] = useState<number | null>(null);
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const duracaoRef = useRef<HTMLInputElement>(null);

  const id = sessao.id;
  const { fimEm, iniciouEm } = cardio;
  const contando = fimEm != null && agora < fimEm;
  const concluido = fimEm != null && agora >= fimEm;
  useWakeLock(contando);

  useEffect(() => {
    if (params.get('duracao')) duracaoRef.current?.focus();
  }, [params]);

  const mudar = (m: Partial<RascunhoCardio>) => {
    const novo = { ...r, ...m };
    setR(novo);
    setErro(null);
    // Rascunho no banco: os campos sobrevivem a fechar o app.
    void workoutSessionsRepository.setCardio(id, { rascunho: novo });
  };

  const iniciar = async () => {
    prepararAudio(); // gesto do usuário: libera o som
    const min = Number(r.duracaoMin);
    if (!Number.isInteger(min) || min < 1 || min > 300) return setErro('Duração (min): de 1 a 300');
    const t = Date.now();
    await workoutSessionsRepository.setCardio(id, { iniciouEm: t, fimEm: t + min * 60_000, rascunho: r });
    recarregar();
  };

  // −15 s / +15 s mudam o fim; Parar (ou −15 s até zerar) para e a duração vira os minutos feitos.
  const definir = useCallback(
    (t: number | null) => {
      void (async () => {
        if (t === null && iniciouEm != null) {
          const novo = { ...r, duracaoMin: String(minutosEntre(iniciouEm, Date.now())) };
          setR(novo);
          await workoutSessionsRepository.setCardio(id, { fimEm: null, rascunho: novo });
        } else await workoutSessionsRepository.setCardio(id, { fimEm: t });
        recarregar();
      })();
    },
    [id, iniciouEm, r, recarregar],
  );
  // No zero o horário final fica salvo: a tela mostra "Tempo concluído".
  const aoTerminar = useCallback(() => recarregar(), [recarregar]);

  const concluir = async () => {
    setGravando(true);
    try {
      // Concluir com a contagem ainda correndo = parou antes: vale o tempo feito.
      const d = validarCardio(contando && iniciouEm != null ? { ...r, duracaoMin: String(minutosEntre(iniciouEm, Date.now())) } : r);
      await cardioSessionsRepository.concluirDoTreino(id, { ...d, rpe, observacoes: obs });
      navigate('/', { replace: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o cardio');
      setGravando(false);
    }
  };

  const cancelar = async () => {
    if (!(await confirmar('Cancelar cardio?', 'Nada do cardio é salvo. O treino continua concluído.', 'Cancelar cardio', true))) return;
    await workoutSessionsRepository.encerrarCardio(id);
    navigate('/', { replace: true });
  };

  return (
    <main className="mx-auto flex h-dvh max-w-xl flex-col" data-testid="tela-cardio">
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-4">
        <h1 className="text-3xl font-bold text-primary-400">Cardio</h1>
        <p className="text-sm text-neutral-400">Depois de {sessao.planSnapshot.nome}</p>

        <fieldset className="space-y-1">
          <legend className="text-sm text-neutral-400">Modalidade</legend>
          <div className="grid grid-cols-3 gap-2">
            {MODALIDADES.map(([v, rotulo]) => (
              <button key={v} type="button" aria-pressed={r.modalidade === v} className={r.modalidade === v ? 'btn-primary px-1' : 'btn-secondary px-1'} onClick={() => mudar({ modalidade: v })}>
                {rotulo}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="grid grid-cols-2 gap-3">
          <Campo rotulo="Duração (min)" valor={r.duracaoMin} inputMode="numeric" desabilitado={contando} entrada={duracaoRef} onChange={(v) => mudar({ duracaoMin: v })} />
          <Campo rotulo="Inclinação" valor={r.inclinacao} placeholder='ex.: "nível 7"' onChange={(v) => mudar({ inclinacao: v })} />
          <Campo rotulo="Velocidade (km/h)" valor={r.velocidade} inputMode="decimal" onChange={(v) => mudar({ velocidade: v })} />
          <Campo rotulo="Distância (km)" valor={r.distancia} inputMode="decimal" onChange={(v) => mudar({ distancia: v })} />
          <Campo rotulo="FC média (bpm)" valor={r.fc} inputMode="numeric" onChange={(v) => mudar({ fc: v })} />
        </div>
        <p className="text-xs text-neutral-500">"Nível 7" é o nível do aparelho, não 7% de inclinação.</p>

        {concluido && (
          <p role="status" className="card text-center text-2xl font-bold text-primary-400">
            Tempo concluído
          </p>
        )}
        {!contando && !concluido && (
          <button type="button" className="btn-secondary w-full" onClick={iniciar}>
            <Play size={22} /> Iniciar cronômetro
          </button>
        )}

        <EscolhaRpe valor={rpe} onChange={setRpe} />
        <label className="card block">
          <span className="text-lg font-semibold">Observações</span>
          <textarea className="input mt-2 min-h-24 py-3" value={obs} onChange={(e) => setObs(e.target.value)} />
        </label>
        {erro && (
          <p role="alert" className="text-red-400">
            {erro}
          </p>
        )}
        <button type="button" className="btn w-full text-red-400" onClick={cancelar}>
          Cancelar cardio
        </button>
      </div>

      <footer className="safe-bottom shrink-0 space-y-2 border-t border-neutral-800 bg-surface px-4 pt-2">
        <ContagemDescanso
          endsAt={fimEm}
          vibrar={settings.interface.vibrar}
          som={opcoesSom(settings)}
          onDefinir={definir}
          onFim={aoTerminar}
          rotulo="Cronômetro do cardio"
          pularLabel="Parar"
          aviso={AVISO_CARDIO}
        />
        <button
          type="button"
          className={`btn-primary min-h-16 w-full text-xl ${concluido ? 'ring-4 ring-primary-200' : ''}`}
          data-destaque={concluido || undefined}
          disabled={gravando}
          onClick={concluir}
        >
          <Check size={24} /> Concluir cardio
        </button>
      </footer>
    </main>
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
