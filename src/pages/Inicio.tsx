import { Link } from 'react-router-dom';
import { Check, Moon, Play } from 'lucide-react';
import { Page } from '../components/Page';
import { CardFicha } from '../components/CardFicha';
import { CriarFicha, SeletorLocal } from '../components/SeletorLocal';
import { useAsync } from '../useAsync';
import { textoAviso, useIniciar } from '../useIniciar';
import { useLocalHoje } from '../useLocalHoje';
import { carregarPainel, type Painel } from '../painel';
import { localDe, NOME_LOCAL } from '../db/repositories/workoutPlans';
import type { LocalTreino, WorkoutPlan, WorkoutSession } from '../db/types';
import { DIAS } from '../dias';
import { chaveDia, concluidasNaSemana, contadorSemana, diasDaSemana, sugestao } from '../semana';
import { formatarDuracao, volumeKg } from '../sessao';

const LETRAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const saudacao = (h: number) => (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite');

/** Dashboard. O bloco de peso só entra na Etapa 5. */
export function Inicio() {
  const [painel, recarregar] = useAsync(carregarPainel);
  const [local, setLocal] = useLocalHoje(painel, recarregar);
  const { iniciar, iniciando } = useIniciar(painel);
  const agora = new Date();

  return (
    <Page title="Início">
      <SeletorLocal valor={local} onMudar={(l) => void setLocal(l)} />
      <p className="text-lg text-neutral-300">
        {saudacao(agora.getHours())}! {agora.toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
      </p>
      {!painel ? (
        <p>Carregando…</p>
      ) : (
        <>
          <FaixaSemana painel={painel} agora={agora} />
          <Sugerido painel={painel} local={local} agora={agora} iniciando={iniciando} onIniciar={iniciar} />
          <ResumoSemana painel={painel} agora={agora} />
          <UltimoTreino painel={painel} />
        </>
      )}
    </Page>
  );
}

function FaixaSemana({ painel, agora }: { painel: Painel; agora: Date }) {
  const treinos = new Set(concluidasNaSemana(painel.sessoes, agora).map((s) => chaveDia(new Date(s.iniciadaEm))));
  const cardio = new Set(painel.cardio.map((c) => c.data));
  const descanso = new Set(painel.descansos.map((d) => d.data));
  const hoje = chaveDia(agora);
  const { feitos, planejados } = contadorSemana(painel.planos, painel.sessoes, agora);
  return (
    <section className="card space-y-3" aria-label="Semana">
      <ol className="grid grid-cols-7 gap-1 text-center">
        {diasDaSemana(agora).map(({ data, chave }, k) => {
          const feito = treinos.has(chave) || cardio.has(chave);
          const folga = !feito && descanso.has(chave);
          const eHoje = chave === hoje;
          return (
            <li
              key={chave}
              data-testid="dia-semana"
              aria-label={`${DIAS[data.getDay()]} ${data.getDate()}${feito ? ', treino feito' : ''}${folga ? ', descanso' : ''}${eHoje ? ', hoje' : ''}`}
              className={`flex flex-col items-center gap-1 rounded-xl py-1 ${eHoje ? 'bg-surface-raised ring-2 ring-primary-400' : ''}`}
            >
              <span className="text-xs text-neutral-400">{eHoje ? 'Hoje' : LETRAS[k]}</span>
              <span className="font-semibold">{data.getDate()}</span>
              <span className="flex h-5 items-center">
                {feito ? <Check size={18} className="text-primary-400" /> : folga ? <Moon size={16} className="text-neutral-400" /> : null}
              </span>
            </li>
          );
        })}
      </ol>
      <p className="text-center text-neutral-300" data-testid="contador-semana">
        {feitos} de {planejados} treinos esta semana
      </p>
    </section>
  );
}

function Sugerido({ painel, local, agora, iniciando, onIniciar }: {
  painel: Painel;
  local: LocalTreino;
  agora: Date;
  iniciando: boolean;
  onIniciar: (p: WorkoutPlan) => void;
}) {
  const card = (plano: WorkoutPlan, motivo: string, destaque = true) => (
    <CardFicha
      key={plano.id}
      plano={plano}
      painel={painel}
      motivo={motivo}
      destaque={destaque}
      editar={false}
      retomar={!!painel.ativa}
      aviso={painel.ativa ? null : textoAviso(plano, painel, agora)}
      iniciando={iniciando}
      onIniciar={() => onIniciar(plano)}
    />
  );

  // Sessão ativa: o card mostra o treino em andamento, com "Retomar treino".
  if (painel.ativa) {
    const plano = painel.planos.find((p) => p.id === painel.ativa!.planId);
    if (plano) return card(plano, painel.ativa.status === 'pausada' ? 'Treino pausado' : 'Treino em andamento');
    return (
      <Link to="/sessao" className="btn-primary w-full">
        <Play size={22} /> Retomar treino — {painel.ativa.planSnapshot.nome}
      </Link>
    );
  }

  const doLocal = painel.planos.filter((p) => localDe(p) === local);
  if (doLocal.length === 0) return <CriarFicha local={local} />;

  const s = sugestao(painel.planos, painel.sessoes, local, agora);
  if (s.tipo === 'concluido') return <ConcluidoHoje sessao={s.sessao} />;
  if (s.tipo === 'hoje') return card(s.plano, 'Treino de hoje');
  if (s.tipo === 'pendente') {
    return (
      <>
        {card(s.plano, `Pendente de ${DIAS[s.plano.diaSemana]!.toLowerCase()}${s.opcional ? ' (opcional)' : ''}`)}
        {s.hoje && card(s.hoje, 'Treino de hoje', false)}
      </>
    );
  }
  if (s.tipo === 'descanso') {
    return (
      <section className="card flex items-center gap-3" data-testid="dia-descanso">
        <Moon className="text-primary-400" /> <p className="text-lg font-semibold">Dia de descanso</p>
      </section>
    );
  }
  return (
    <section className="space-y-3" aria-label="Escolha uma ficha">
      <p className="text-neutral-300">Sem treino de {NOME_LOCAL[local].toLowerCase()} sugerido para hoje. Escolha uma ficha:</p>
      {doLocal.map((p) => card(p, DIAS[p.diaSemana]!, false))}
    </section>
  );
}

/** Já treinou hoje: mostra a ficha feita e a duração; outra ficha só pela aba Treinar. */
export function ConcluidoHoje({ sessao, rotulo }: { sessao: Pick<WorkoutSession, 'planSnapshot' | 'duracaoAtivaSeg'>; rotulo?: string }) {
  return (
    <section className="card space-y-1 ring-2 ring-primary-400" data-testid="concluido-hoje">
      {rotulo && <p className="text-sm font-semibold uppercase text-primary-400">{rotulo}</p>}
      <p className="flex items-center gap-2 text-lg font-semibold text-primary-400">
        Treino de hoje concluído <Check size={20} aria-hidden />
      </p>
      <p className="text-neutral-200">
        {sessao.planSnapshot.nome} · {formatarDuracao(sessao.duracaoAtivaSeg)}
      </p>
    </section>
  );
}

function ResumoSemana({ painel, agora }: { painel: Painel; agora: Date }) {
  const musculacao = concluidasNaSemana(painel.sessoes, agora).reduce((t, s) => t + s.duracaoAtivaSeg, 0) / 60;
  const dias = new Set(diasDaSemana(agora).map((d) => d.chave));
  const cardio = painel.cardio.filter((c) => dias.has(c.data)).reduce((t, c) => t + c.duracaoMin, 0);
  return (
    <section className="card grid grid-cols-2 gap-2 text-center" aria-label="Resumo da semana">
      <div>
        <p className="text-3xl font-bold" data-testid="min-musculacao">{Math.round(musculacao)}</p>
        <p className="text-sm text-neutral-400">min de musculação</p>
      </div>
      <div>
        <p className="text-3xl font-bold" data-testid="min-cardio">{Math.round(cardio)}</p>
        <p className="text-sm text-neutral-400">min de cardio</p>
      </div>
    </section>
  );
}

function UltimoTreino({ painel }: { painel: Painel }) {
  if (!painel.ultima) return null;
  const { sessao, sets } = painel.ultima;
  const volume = volumeKg(sets, sessao.planSnapshot.itens);
  return (
    <section className="card" aria-label="Último treino">
      <h2 className="text-sm font-semibold uppercase text-neutral-400">Último treino</h2>
      <p className="text-lg font-semibold">{sessao.planSnapshot.nome}</p>
      <p className="text-neutral-300" data-testid="ultimo-treino">
        {new Date(sessao.iniciadaEm).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short' })} ·{' '}
        {formatarDuracao(sessao.duracaoAtivaSeg)}
        {volume !== null && ` · ${num(volume)} kg de volume`}
      </p>
    </section>
  );
}
