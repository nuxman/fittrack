import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, Minus, Pencil, Plus, Replace, Undo2 } from 'lucide-react';
import { ExercisePicker } from '../../components/ExercisePicker';
import { EstadoTela, useSessao } from './SessaoLayout';
import { FotoAmpliavel } from '../../components/FotoAmpliavel';
import { Anotacoes } from '../../components/Anotacoes';
import { VerExecucao } from '../../components/VerExecucao';
import { GrupoIcone } from '../../components/GrupoIcone';
import { ContagemDescanso, FolhaDescanso } from '../../components/RestTimer';
import { useDialog } from '../../components/ConfirmDialog';
import { exerciseSetsRepository } from '../../db/repositories/exerciseSets';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { settingsRepository } from '../../db/repositories/settings';
import { opcoesSom, prepararAudio } from '../../somDescanso';
import type { SnapshotItem } from '../../db/types';
import {
  exercicioAtual, formatarSerie, parseNumero, prescricaoSessao, pulados, seriesFeitas, usaCarga, validarSerie,
} from '../../sessao';

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 2 });

export function SessaoExecucao() {
  const { exerciseId } = useParams();
  const { sessao } = useSessao();
  const item = sessao.planSnapshot.itens.find((i) => i.exerciseId === exerciseId);
  if (!item) return <Navigate to="/sessao" replace />;
  // key: troca de exercício reinicia os campos.
  return <Execucao key={item.exerciseId} item={item} />;
}

/**
 * Layout: conteúdo rolável (nome, séries, campos, extras) + rodapé fixo com a contagem do
 * descanso (só quando ativa) e "Concluir série". O que se usa a cada série cabe sem rolar.
 */
function Execucao({ item }: { item: SnapshotItem }) {
  const { sessao, sets, exercicios, imagens, ultimas, vibrar, settings, agir, recarregar } = useSessao();
  const { confirmar } = useDialog();
  const exercicio = exercicios.get(item.exerciseId);
  const ultima = ultimas.get(item.exerciseId);
  const comCarga = usaCarga(item.tipo);
  const passo = item.unidadeCarga === 'kg' ? 0.5 : 1;

  const [carga, setCarga] = useState(() => (comCarga && ultima?.carga != null ? num(ultima.carga) : ''));
  const [reps, setReps] = useState(() => String(ultima?.reps ?? item.repsMin));
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  // O estado só desabilita o botão no próximo render; o ref barra o segundo toque no mesmo instante.
  const gravandoRef = useRef(false);
  const [folha, setFolha] = useState(false);

  const sessionId = sessao.id;
  const definirDescanso = useCallback(
    (t: number | null) => void workoutSessionsRepository.setDescanso(sessionId, t).then(() => recarregar()),
    [sessionId, recarregar],
  );

  // Aviso de notificações: uma única vez, enquanto a permissão não foi decidida.
  const mostrarAviso =
    typeof Notification !== 'undefined' && Notification.permission === 'default' && !(settings.interface.avisoNotificacoesVisto ?? false);
  useEffect(() => {
    if (mostrarAviso) void settingsRepository.update({ interface: { ...settings.interface, avisoNotificacoesVisto: true } });
  }, [mostrarAviso, settings.interface]);

  const daSessao = sets.filter((s) => s.exerciseId === item.exerciseId);
  const feitas = seriesFeitas(sets, item.exerciseId);
  const pausada = sessao.status === 'pausada';
  const foto = imagens.get(item.exerciseId);
  const proximo = exercicioAtual(sessao.planSnapshot.itens, sets, pulados(sessao));
  const proximoItem = proximo && proximo !== item.exerciseId ? sessao.planSnapshot.itens.find((i) => i.exerciseId === proximo) : undefined;

  const ajustar = (texto: string, delta: number, min: number) => {
    const v = parseNumero(texto);
    return num(Math.max(min, (Number.isNaN(v) ? 0 : v) + delta));
  };

  const concluir = async () => {
    if (gravandoRef.current) return;
    prepararAudio(); // gesto do usuário: libera o som do descanso
    const c = comCarga ? parseNumero(carga) : null;
    const r = parseNumero(reps);
    const msg = validarSerie(item, c, r);
    setErro(msg);
    if (msg) return;
    gravandoRef.current = true;
    setGravando(true);
    try {
      await exerciseSetsRepository.registrar({ sessionId: sessao.id, exerciseId: item.exerciseId, carga: c, reps: r });
      await workoutSessionsRepository.setDescanso(sessao.id, item.descansoSeg > 0 ? Date.now() + item.descansoSeg * 1000 : null);
      await recarregar();
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a série');
    } finally {
      gravandoRef.current = false;
      setGravando(false);
    }
  };

  const desfazer = async () => {
    const ult = daSessao.at(-1);
    if (!ult) return;
    if (!(await confirmar('Desfazer última série?', `Série ${ult.numeroSerie}: ${formatarSerie(ult, item)}`, 'Desfazer'))) return;
    await agir((s) => exerciseSetsRepository.desfazerUltima(s.id, item.exerciseId));
  };

  const escolherDescanso = async (seg: number) => {
    setFolha(false);
    await agir((s) => workoutSessionsRepository.setDescansoItem(s.id, item.exerciseId, seg));
  };

  const rotuloReps = item.tipo === 'tempo' ? 'Segundos' : item.porLado ? 'Reps por lado' : 'Repetições';

  return (
    <>
      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-3" data-testid="conteudo-execucao">
        <Link to="/sessao" className="inline-flex items-center gap-1 text-sm text-neutral-300">
          <ChevronLeft size={18} /> Visão geral
        </Link>

        <section className="flex items-start gap-3">
          {foto ? (
            <FotoAmpliavel blob={foto} grupo={item.grupoPrincipal} className="h-[120px] w-[120px]" />
          ) : (
            <span className="mt-1 shrink-0">
              <GrupoIcone grupo={item.grupoPrincipal} size={28} />
            </span>
          )}
          <div className="min-w-0">
            <h2 className="text-xl font-bold leading-tight">{item.nome}</h2>
            <p className="text-neutral-300">{prescricaoSessao(item)}</p>
            <p className="text-sm text-neutral-400">Última carga: {ultima ? formatarSerie(ultima, item) : 'sem registro'}</p>
          </div>
        </section>

        <p role="note" className="text-xs text-red-300">
          Pare se sentir dor no peito, tontura, falta de ar desproporcional ou dor articular aguda.
        </p>

        <div className="flex items-center gap-2">
          <ol className="flex gap-2" aria-label="Séries">
            {Array.from({ length: Math.max(item.series, feitas) }, (_, k) => (
              <li
                key={k}
                aria-label={`Série ${k + 1}${k < feitas ? ' concluída' : ''}`}
                className={`flex h-9 w-9 items-center justify-center rounded-full font-bold ${
                  k < feitas ? 'bg-primary-400 text-neutral-950' : 'bg-surface-raised text-neutral-300'
                }`}
              >
                {k + 1}
              </li>
            ))}
          </ol>
          {daSessao.length > 0 && (
            <button type="button" className="ml-auto inline-flex min-h-11 items-center gap-1 px-2 text-sm text-neutral-300" disabled={gravando} onClick={desfazer}>
              <Undo2 size={16} /> Desfazer última série
            </button>
          )}
        </div>

        {comCarga && (
          <Campo
            rotulo={`Carga (${item.unidadeCarga === 'kg' ? 'kg' : 'placa'})`}
            valor={carga}
            inputMode="decimal"
            onChange={setCarga}
            onMenos={() => setCarga((v) => ajustar(v, -passo, 0))}
            onMais={() => setCarga((v) => ajustar(v, passo, 0))}
          />
        )}
        <Campo
          rotulo={rotuloReps}
          valor={reps}
          inputMode="numeric"
          onChange={setReps}
          onMenos={() => setReps((v) => ajustar(v, -1, 1))}
          onMais={() => setReps((v) => ajustar(v, 1, 1))}
        />
        {erro && (
          <p role="alert" className="text-red-400">
            {erro}
          </p>
        )}

        <p className="text-sm text-neutral-400" data-testid="linha-descanso">
          Descanso: {item.descansoSeg} s ·{' '}
          <button type="button" className="min-h-11 px-1 font-semibold text-primary-400 underline" disabled={pausada} onClick={() => setFolha(true)}>
            Alterar
          </button>
        </p>
        {mostrarAviso && (
          <p className="text-xs text-neutral-500" data-testid="aviso-notificacao">
            Para ser avisado no fim do descanso, permita notificações em Configurações → Alertas de descanso.
          </p>
        )}

        {proximoItem && feitas >= item.series && (
          <Link to={`/sessao/${proximoItem.exerciseId}`} className="btn-secondary w-full">
            Próximo: {proximoItem.nome}
          </Link>
        )}

        <VerExecucao url={exercicio?.videoUrl} />

        {exercicio && (
          <Link to={`/exercicios/${exercicio.id}`} className="btn-secondary w-full">
            <Pencil size={20} /> Editar exercício
          </Link>
        )}

        <AjustarNoTreino key={`${item.series}-${item.repsMin}-${item.repsMax}`} item={item} temSeries={daSessao.length > 0} />

        {exercicio && <Anotacoes exerciseId={exercicio.id} inicial={exercicio.anotacoes ?? ''} onSalvo={() => void recarregar()} />}

        <details className="card">
          <summary className="cursor-pointer text-lg font-semibold">Grupos trabalhados</summary>
          <p className="mt-2 text-neutral-300">Principal: {item.grupoPrincipal}</p>
          {exercicio && exercicio.gruposSecundarios.length > 0 && (
            <p className="text-neutral-300">Secundários: {exercicio.gruposSecundarios.join(', ')}</p>
          )}
        </details>
        <EstadoTela />
      </div>

      <footer className="safe-bottom shrink-0 space-y-2 border-t border-neutral-800 bg-surface px-4 pt-2" data-testid="rodape-execucao">
        <ContagemDescanso endsAt={sessao.restTimerEndsAt} desabilitado={pausada} vibrar={vibrar} som={opcoesSom(settings)} onDefinir={definirDescanso} />
        {pausada && <p className="text-center text-sm text-primary-400">Treino pausado. Retome para registrar séries.</p>}
        <button type="button" className="btn-primary min-h-16 w-full text-xl" disabled={gravando || pausada} onClick={concluir}>
          <Check size={24} /> Concluir série
        </button>
      </footer>

      {folha && <FolhaDescanso atualSeg={item.descansoSeg} onEscolher={escolherDescanso} onFechar={() => setFolha(false)} />}
    </>
  );
}

/** Séries, reps e substituição só nesta sessão (planSnapshot); a ficha muda só se aplicado ao finalizar. */
function AjustarNoTreino({ item, temSeries }: { item: SnapshotItem; temSeries: boolean }) {
  const { sessao, agir } = useSessao();
  const navigate = useNavigate();
  const [series, setSeries] = useState(String(item.series));
  const [min, setMin] = useState(String(item.repsMin));
  const [max, setMax] = useState(String(item.repsMax));
  const [erro, setErro] = useState<string | null>(null);
  const [picker, setPicker] = useState(false);
  const un = item.tipo === 'tempo' ? 's' : 'reps';
  const mudou = series !== String(item.series) || min !== String(item.repsMin) || max !== String(item.repsMax);

  const salvar = async () => {
    try {
      setErro(null);
      await agir((s) =>
        workoutSessionsRepository.setPrescricaoItem(s.id, item.exerciseId, { series: parseNumero(series), repsMin: parseNumero(min), repsMax: parseNumero(max) }),
      );
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar');
    }
  };

  const substituir = async (novoId: string) => {
    setPicker(false);
    try {
      await agir((s) => workoutSessionsRepository.substituir(s.id, item.exerciseId, novoId));
      navigate(`/sessao/${novoId}`, { replace: true });
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível substituir');
    }
  };

  const campo = (rotulo: string, v: string, set: (v: string) => void) => (
    <label className="block min-w-0 flex-1 text-sm text-neutral-300">
      {rotulo}
      <input className="input mt-1 text-center" inputMode="numeric" value={v} onChange={(e) => set(e.target.value)} />
    </label>
  );

  return (
    <details className="card">
      <summary className="cursor-pointer text-lg font-semibold">Ajustar neste treino</summary>
      <div className="mt-3 space-y-3">
        <p className="text-sm text-neutral-400">Vale só para este treino. Ao finalizar, você escolhe se aplica também na ficha.</p>
        <div className="flex gap-2">
          {campo('Nº de séries', series, setSeries)}
          {campo(`Mín. (${un})`, min, setMin)}
          {campo(`Máx. (${un})`, max, setMax)}
        </div>
        <button type="button" className="btn-secondary w-full" disabled={!mudou} onClick={salvar}>
          Salvar ajuste
        </button>
        <button type="button" className="btn-secondary w-full" disabled={temSeries} onClick={() => setPicker(true)}>
          <Replace size={20} /> Substituir exercício
        </button>
        {temSeries && <p className="text-sm text-neutral-400">Para substituir, desfaça antes as séries deste exercício.</p>}
        {erro && (
          <p role="alert" className="text-red-400">
            {erro}
          </p>
        )}
      </div>
      {picker && (
        <ExercisePicker excluirIds={sessao.planSnapshot.itens.map((i) => i.exerciseId)} onEscolher={(e) => void substituir(e.id)} onFechar={() => setPicker(false)} />
      )}
    </details>
  );
}

interface CampoProps {
  rotulo: string;
  valor: string;
  inputMode: 'decimal' | 'numeric';
  onChange: (v: string) => void;
  onMenos: () => void;
  onMais: () => void;
}

function Campo({ rotulo, valor, inputMode, onChange, onMenos, onMais }: CampoProps) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm text-neutral-300">
        {rotulo}
      </label>
      <div className="flex gap-2">
        <button type="button" className="btn-secondary w-16 shrink-0 px-0" aria-label={`Diminuir ${rotulo}`} onClick={onMenos}>
          <Minus size={24} />
        </button>
        <input id={id} className="input text-center text-2xl" inputMode={inputMode} value={valor} onChange={(e) => onChange(e.target.value)} />
        <button type="button" className="btn-secondary w-16 shrink-0 px-0" aria-label={`Aumentar ${rotulo}`} onClick={onMais}>
          <Plus size={24} />
        </button>
      </div>
    </div>
  );
}
