import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Pencil, Trash2 } from 'lucide-react';
import { Page } from '../../components/Page';
import { Campo, ajustarTexto, num } from '../../components/CampoSerie';
import { EscolhaRpe } from '../../components/EscolhaRpe';
import { useDialog } from '../../components/ConfirmDialog';
import { useAsync } from '../../useAsync';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { exerciseSetsRepository } from '../../db/repositories/exerciseSets';
import { cardioSessionsRepository } from '../../db/repositories/cardioSessions';
import type { ExerciseSet, SnapshotItem, WorkoutSession } from '../../db/types';
import {
  ATIVOS, formatarDuracao, formatarSerie, parseNumero, prescricaoSessao, pulados, statusExercicio, textoTrocado, usaCarga, validarSerie, volumeKg,
} from '../../sessao';
import type { Excluido } from './Historico';
import { linhaCardio } from '../../cardio';
import { compararPontos, diferenca, pontoNaSessao, treinoAnterior, type Comparacao } from '../../evolucao';

const erroDe = (e: unknown, padrao: string) => (e instanceof Error ? e.message : padrao);

/** Detalhe de um treino encerrado: corrigir séries, RPE e observações, ou excluir o treino. */
export function HistoricoDetalhe() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { confirmar } = useDialog();
  const [erro, setErro] = useState<string | null>(null);
  const [dados, recarregar] = useAsync(async () => {
    const [sessao, sets, cardio, sessoes] = await Promise.all([
      workoutSessionsRepository.get(id),
      exerciseSetsRepository.listarDaSessao(id),
      cardioSessionsRepository.list(),
      workoutSessionsRepository.list(),
    ]);
    const anterior = sessao && treinoAnterior(sessoes, sessao);
    const setsAnterior = anterior ? await exerciseSetsRepository.listarDaSessao(anterior.id) : [];
    return { sessao, sets, cardio: cardio.filter((c) => c.sessionId === id), anterior, setsAnterior };
  }, [id]);

  if (!dados) return <Page title="Treino" voltar>Carregando…</Page>;
  const { sessao, sets, cardio, anterior, setsAnterior } = dados;
  if (!sessao || ATIVOS.includes(sessao.status)) return <Page title="Treino" voltar><p className="card">Treino não encontrado.</p></Page>;

  const vol = volumeKg(sets, sessao.planSnapshot.itens);
  const itens = [...sessao.planSnapshot.itens].sort((a, b) => a.ordem - b.ordem);
  const volAnterior = anterior ? volumeKg(setsAnterior, anterior.planSnapshot.itens) : null;
  const comparar = (exerciseId: string) =>
    anterior ? compararPontos(pontoNaSessao(exerciseId, sessao, sets), pontoNaSessao(exerciseId, anterior, setsAnterior)) : null;
  const dataAnterior = anterior && new Date(anterior.iniciadaEm).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

  const excluir = async () => {
    const msg = cardio.length ? 'O treino, as séries e o cardio feito depois dele serão excluídos.' : 'O treino e as séries serão excluídos.';
    if (!(await confirmar('Excluir treino?', msg, 'Excluir treino', true))) return;
    try {
      const exclusao = await workoutSessionsRepository.excluir(sessao.id);
      navigate('/historico', { replace: true, state: { ...exclusao, em: Date.now() } satisfies Excluido });
    } catch (e) {
      setErro(erroDe(e, 'Não foi possível excluir'));
    }
  };

  return (
    <Page title={sessao.planSnapshot.nome} voltar>
      <section className="card space-y-1" aria-label="Resumo">
        <p className="text-lg">
          {new Date(sessao.iniciadaEm).toLocaleString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })}
        </p>
        <p className="text-neutral-300" data-testid="resumo-treino">
          {sessao.status === 'abandonada' && 'Abandonado · '}
          {formatarDuracao(sessao.duracaoAtivaSeg)} · {sets.length} séries
          {vol !== null && ` · ${num(vol)} kg de volume`}
        </p>
        {cardio.map((c) => (
          <p key={c.id} className="text-neutral-300">{linhaCardio(c)}</p>
        ))}
        <p className="text-sm text-neutral-400" data-testid="comparacao-treino">
          {!anterior
            ? 'Primeiro treino concluído desta ficha: sem treino anterior para comparar.'
            : `Comparado a ${dataAnterior}${vol !== null && volAnterior !== null ? `: volume ${diferenca(vol - volAnterior, ' kg')}` : ''}`}
        </p>
      </section>

      <Avaliacao key={`${sessao.rpe}-${sessao.observacoes}`} sessao={sessao} onSalvo={recarregar} />

      {itens.map((item) => (
        <ExercicioHistorico key={item.exerciseId} item={item} sessao={sessao} sets={sets} comparacao={comparar(item.exerciseId)} dataAnterior={dataAnterior} onMudou={recarregar} />
      ))}

      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <button type="button" className="btn w-full bg-red-600 text-white active:bg-red-700" onClick={() => void excluir()}>
        <Trash2 size={20} /> Excluir treino
      </button>
    </Page>
  );
}

function Avaliacao({ sessao, onSalvo }: { sessao: WorkoutSession; onSalvo: () => void }) {
  const [editando, setEditando] = useState(false);
  const [rpe, setRpe] = useState(sessao.rpe);
  const [obs, setObs] = useState(sessao.observacoes);
  const [erro, setErro] = useState<string | null>(null);

  if (!editando) {
    return (
      <section className="card space-y-1" aria-label="Avaliação">
        <p className="text-lg" data-testid="rpe-treino">RPE: {sessao.rpe ?? '—'}</p>
        {sessao.observacoes && <p className="whitespace-pre-line text-neutral-300">{sessao.observacoes}</p>}
        <button type="button" className="btn-secondary w-full" onClick={() => setEditando(true)}>
          <Pencil size={20} /> Editar RPE e observações
        </button>
      </section>
    );
  }
  const salvar = async () => {
    try {
      await workoutSessionsRepository.editarAvaliacao(sessao.id, { rpe, observacoes: obs });
      onSalvo();
    } catch (e) {
      setErro(erroDe(e, 'Não foi possível salvar'));
    }
  };
  return (
    <section className="space-y-2" aria-label="Avaliação">
      <EscolhaRpe valor={rpe} onChange={setRpe} />
      <label className="card block">
        <span className="text-lg font-semibold">Observações</span>
        <textarea className="input mt-2 min-h-28 py-3" value={obs} onChange={(e) => setObs(e.target.value)} />
      </label>
      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <button type="button" className="btn-primary w-full" onClick={() => void salvar()}>Salvar</button>
      <button type="button" className="btn text-neutral-400 w-full" onClick={() => setEditando(false)}>Cancelar</button>
    </section>
  );
}

function ExercicioHistorico({ item, sessao, sets, comparacao, dataAnterior, onMudou }: {
  item: SnapshotItem;
  sessao: WorkoutSession;
  sets: ExerciseSet[];
  comparacao: Comparacao | null;
  dataAnterior: string | undefined;
  onMudou: () => void;
}) {
  const [editando, setEditando] = useState<string | null>(null);
  const daqui = sets.filter((s) => s.exerciseId === item.exerciseId);
  const status = statusExercicio(item, sets, pulados(sessao));
  return (
    <section className="card space-y-2" aria-label={item.nome} data-testid="exercicio-historico">
      <div>
        <h2 className="text-lg font-semibold">{item.nome}</h2>
        <p className="text-sm text-neutral-400">
          {prescricaoSessao(item)}
          {item.trocadoApos != null && ` · ${textoTrocado(item.trocadoApos)}`}
          {status === 'pulado' && ' · pulado'}
          {item.substituiu && ` · no lugar de ${item.substituiu.nome}`}
        </p>
      </div>
      {daqui.length === 0 && <p className="text-neutral-400">Nenhuma série registrada.</p>}
      {comparacao && (
        <p className="text-sm text-neutral-300" data-testid="comparacao-exercicio">
          Em {dataAnterior}: {comparacao.anterior}
          {comparacao.mudanca ? ` → ${comparacao.mudanca}` : ' (outra unidade)'}
        </p>
      )}
      <ol className="space-y-1">
        {daqui.map((s) =>
          editando === s.id ? (
            <li key={s.id}>
              <EditarSerie set={s} item={item} onFim={() => { setEditando(null); onMudou(); }} onCancelar={() => setEditando(null)} />
            </li>
          ) : (
            <li key={s.id}>
              <button
                type="button"
                className="flex min-h-11 w-full items-center justify-between rounded-xl bg-surface-raised px-3 text-left"
                aria-label={`Editar série ${s.numeroSerie}: ${formatarSerie(s, item)}`}
                onClick={() => setEditando(s.id)}
              >
                <span>Série {s.numeroSerie}</span>
                <span>{formatarSerie(s, item)}</span>
              </button>
            </li>
          ),
        )}
      </ol>
    </section>
  );
}

function EditarSerie({ set, item, onFim, onCancelar }: { set: ExerciseSet; item: SnapshotItem; onFim: () => void; onCancelar: () => void }) {
  const { confirmar } = useDialog();
  const comCarga = usaCarga(item.tipo);
  const passo = item.unidadeCarga === 'kg' ? 0.5 : 1;
  const [carga, setCarga] = useState(set.carga != null ? num(set.carga) : '');
  const [reps, setReps] = useState(String(set.reps));
  const [erro, setErro] = useState<string | null>(null);
  const rotuloReps = item.tipo === 'tempo' ? 'Segundos' : item.porLado ? 'Reps por lado' : 'Repetições';

  const salvar = async () => {
    const c = comCarga ? parseNumero(carga) : null;
    const r = parseNumero(reps);
    const msg = validarSerie(item, c, r);
    if (msg) return setErro(msg);
    try {
      await exerciseSetsRepository.editar(set.id, c, r);
      onFim();
    } catch (e) {
      setErro(erroDe(e, 'Não foi possível salvar'));
    }
  };
  const excluir = async () => {
    if (!(await confirmar('Excluir série?', `Série ${set.numeroSerie}: ${formatarSerie(set, item)}. As séries seguintes são renumeradas.`, 'Excluir série', true))) return;
    await exerciseSetsRepository.excluir(set.id);
    onFim();
  };

  return (
    <div className="space-y-2 rounded-xl border border-neutral-700 p-3">
      <p className="font-semibold">Série {set.numeroSerie}</p>
      {comCarga && (
        <Campo
          rotulo={`Carga (${item.unidadeCarga === 'kg' ? 'kg' : 'placa'})`}
          valor={carga}
          inputMode="decimal"
          onChange={setCarga}
          onMenos={() => setCarga((v) => ajustarTexto(v, -passo, 0))}
          onMais={() => setCarga((v) => ajustarTexto(v, passo, 0))}
        />
      )}
      <Campo
        rotulo={rotuloReps}
        valor={reps}
        inputMode="numeric"
        onChange={setReps}
        onMenos={() => setReps((v) => ajustarTexto(v, -1, 1))}
        onMais={() => setReps((v) => ajustarTexto(v, 1, 1))}
      />
      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="btn-primary" onClick={() => void salvar()}>Salvar</button>
        <button type="button" className="btn-secondary" onClick={onCancelar}>Cancelar</button>
      </div>
      <button type="button" className="btn w-full text-red-400" onClick={() => void excluir()}>
        <Trash2 size={18} /> Excluir série
      </button>
    </div>
  );
}
