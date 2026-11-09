import { useId, useRef, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, ExternalLink, Minus, Plus, Undo2, X } from 'lucide-react';
import { useSessao } from './SessaoLayout';
import { FotoExercicio } from '../../components/FotoExercicio';
import { RestTimer } from '../../components/RestTimer';
import { useDialog } from '../../components/ConfirmDialog';
import { exerciseSetsRepository } from '../../db/repositories/exerciseSets';
import { workoutSessionsRepository } from '../../db/repositories/workoutSessions';
import { exercisesRepository } from '../../db/repositories/exercises';
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

function Execucao({ item }: { item: SnapshotItem }) {
  const { sessao, sets, exercicios, imagens, ultimas, vibrar, agir, recarregar } = useSessao();
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
  const [ampliada, setAmpliada] = useState(false);

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
      recarregar();
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

  const rotuloReps = item.tipo === 'tempo' ? 'Segundos' : item.porLado ? 'Reps por lado' : 'Repetições';

  return (
    <>
      <p role="note" className="rounded-xl bg-red-950/60 px-3 py-2 text-sm text-red-200">
        Pare se sentir dor no peito, tontura, falta de ar desproporcional ou dor articular aguda.
      </p>

      <Link to="/sessao" className="inline-flex items-center gap-1 text-neutral-300">
        <ChevronLeft size={22} /> Visão geral
      </Link>

      <button type="button" className="block w-full" aria-label="Ampliar foto" disabled={!foto} onClick={() => setAmpliada(true)}>
        <FotoExercicio blob={foto} grupo={item.grupoPrincipal} className="aspect-video w-full" iconeSize={72} />
      </button>
      {ampliada && foto && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black" role="dialog" aria-label="Foto ampliada" onClick={() => setAmpliada(false)}>
          <FotoExercicio blob={foto} grupo={item.grupoPrincipal} className="h-full w-full bg-black" />
          <button type="button" aria-label="Fechar foto" className="absolute right-4 top-4 rounded-full bg-neutral-800 p-3">
            <X size={28} />
          </button>
        </div>
      )}

      <section className="space-y-1">
        <h2 className="text-2xl font-bold">{item.nome}</h2>
        <p className="text-lg text-neutral-300">{prescricaoSessao(item)}</p>
        <p className="text-neutral-400">Última carga: {ultima ? formatarSerie(ultima, item) : 'sem registro'}</p>
        {exercicio?.videoUrl && (
          <>
            <a href={exercicio.videoUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary mt-2 w-full">
              <ExternalLink size={20} /> Ver execução
            </a>
            {!navigator.onLine && <p className="text-sm text-neutral-400">Sem conexão: o vídeo precisa de internet.</p>}
          </>
        )}
      </section>

      <ol className="flex gap-2" aria-label="Séries">
        {Array.from({ length: Math.max(item.series, feitas) }, (_, k) => (
          <li
            key={k}
            aria-label={`Série ${k + 1}${k < feitas ? ' concluída' : ''}`}
            className={`flex h-11 w-11 items-center justify-center rounded-full text-lg font-bold ${
              k < feitas ? 'bg-primary-400 text-neutral-950' : 'bg-surface-raised text-neutral-300'
            }`}
          >
            {k + 1}
          </li>
        ))}
      </ol>
      {daSessao.length > 0 && (
        <ul className="text-neutral-300">
          {daSessao.map((s) => (
            <li key={s.id}>
              Série {s.numeroSerie}: {formatarSerie(s, item)}
            </li>
          ))}
        </ul>
      )}

      <section className="card space-y-3">
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
        {pausada && <p className="text-primary-400">Retome o treino para registrar séries.</p>}
        <button type="button" className="btn-primary w-full" disabled={gravando || pausada} onClick={concluir}>
          <Check size={22} /> Concluir série
        </button>
        {daSessao.length > 0 && (
          <button type="button" className="btn-secondary w-full" disabled={gravando} onClick={desfazer}>
            <Undo2 size={20} /> Desfazer última série
          </button>
        )}
        {proximoItem && feitas >= item.series && (
          <Link to={`/sessao/${proximoItem.exerciseId}`} className="btn-secondary w-full">
            Próximo: {proximoItem.nome}
          </Link>
        )}
      </section>

      <RestTimer
        endsAt={sessao.restTimerEndsAt}
        desabilitado={pausada}
        vibrar={vibrar}
        onDefinir={(t) => void agir((s) => workoutSessionsRepository.setDescanso(s.id, t))}
      />

      {exercicio && <Anotacoes exerciseId={exercicio.id} inicial={exercicio.anotacoes ?? ''} onSalvo={recarregar} />}

      <details className="card">
        <summary className="cursor-pointer text-lg font-semibold">Grupos trabalhados</summary>
        <p className="mt-2 text-neutral-300">Principal: {item.grupoPrincipal}</p>
        {exercicio && exercicio.gruposSecundarios.length > 0 && (
          <p className="text-neutral-300">Secundários: {exercicio.gruposSecundarios.join(', ')}</p>
        )}
      </details>
    </>
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
      <label htmlFor={id} className="mb-1 block text-neutral-300">
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

function Anotacoes({ exerciseId, inicial, onSalvo }: { exerciseId: string; inicial: string; onSalvo: () => void }) {
  const [texto, setTexto] = useState(inicial);
  const [estado, setEstado] = useState<'' | 'salvando' | 'salvo' | 'erro'>('');
  const salvar = async () => {
    setEstado('salvando');
    try {
      await exercisesRepository.update(exerciseId, { anotacoes: texto.trim() || undefined });
      setEstado('salvo');
      onSalvo();
    } catch {
      setEstado('erro');
    }
  };
  return (
    <details className="card">
      <summary className="cursor-pointer text-lg font-semibold">Minhas anotações</summary>
      <textarea
        className="input mt-3 min-h-28 py-3"
        aria-label="Minhas anotações"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          setEstado('');
        }}
      />
      <button type="button" className="btn-secondary mt-2 w-full" disabled={estado === 'salvando' || texto === inicial} onClick={salvar}>
        Salvar anotações
      </button>
      {estado === 'salvo' && <p className="mt-1 text-sm text-primary-400">Anotações salvas.</p>}
      {estado === 'erro' && <p role="alert" className="mt-1 text-sm text-red-400">Não foi possível salvar.</p>}
    </details>
  );
}
