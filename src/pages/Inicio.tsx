import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Check, ChevronRight, Moon, Play, Plus, Scale } from 'lucide-react';
import { Page } from '../components/Page';
import { CardFicha } from '../components/CardFicha';
import { CriarFicha, SeletorLocal } from '../components/SeletorLocal';
import { useAsync } from '../useAsync';
import { textoAviso, useIniciar } from '../useIniciar';
import { useLocalHoje } from '../useLocalHoje';
import { carregarPainel, type Painel } from '../painel';
import { localDe, NOME_LOCAL } from '../db/repositories/workoutPlans';
import { restDaysRepository } from '../db/repositories/restDays';
import type { LocalTreino, WorkoutPlan, WorkoutSession } from '../db/types';
import { DIAS } from '../dias';
import { chaveDia, concluidasNaSemana, contadorSemana, diasDaSemana, sugestao } from '../semana';
import { formatarDuracao, volumeKg } from '../sessao';
import { lembrarBackup } from '../backup';
import { direcaoMeta, resumoPeso, textoMeta, textoVariacao } from '../medidas';

const LETRAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];
const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const saudacao = (h: number) => (h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite');

/** Dashboard. */
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
          <DescansoHoje painel={painel} agora={agora} onMudou={recarregar} />
          <ResumoSemana painel={painel} agora={agora} />
          <BlocoPeso painel={painel} />
          <UltimoTreino painel={painel} />
          {lembrarBackup(painel.settings.ultimoBackupEm, painel.sessoes.some((s) => s.status === 'concluida'), agora) && (
            <Link to="/configuracoes#backup" className="block text-center text-sm text-primary-400 underline" data-testid="lembrete-backup">
              Faça um backup dos seus dados
            </Link>
          )}
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

/** "Marcar hoje como descanso" (só sem treino concluído nem cardio hoje); marcado: observação opcional e "Desmarcar". Não mexe nas pendências. */
function DescansoHoje({ painel, agora, onMudou }: { painel: Painel; agora: Date; onMudou: () => void }) {
  const hoje = chaveDia(agora);
  const marcado = painel.descansos.find((d) => d.data === hoje);
  const [obs, setObs] = useState(marcado?.observacoes ?? '');
  const treinou = painel.sessoes.some((s) => s.status === 'concluida' && chaveDia(new Date(s.iniciadaEm)) === hoje) || painel.cardio.some((c) => c.data === hoje);
  if (treinou || painel.ativa) return null;
  const alternar = async () => {
    await restDaysRepository.alternar(hoje);
    setObs('');
    onMudou();
  };
  if (!marcado) {
    return (
      <button type="button" className="mx-auto block min-h-11 text-sm text-primary-400 underline" onClick={() => void alternar()}>
        Marcar hoje como descanso
      </button>
    );
  }
  return (
    <section className="card space-y-2" aria-label="Descanso de hoje" data-testid="descanso-hoje">
      <p className="flex items-center gap-2 font-semibold">
        <Moon size={18} className="text-neutral-400" aria-hidden /> Hoje marcado como descanso
      </p>
      <input
        className="input"
        aria-label="Observação do descanso (opcional)"
        placeholder="Observação (opcional)"
        value={obs}
        onChange={(e) => setObs(e.target.value)}
        onBlur={() => obs.trim() !== marcado.observacoes && void restDaysRepository.update(marcado.id, { observacoes: obs.trim() })}
      />
      <button type="button" className="min-h-11 text-sm text-primary-400 underline" onClick={() => void alternar()}>
        Desmarcar descanso
      </button>
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
  const s = sugestao(painel.planos, painel.sessoes, local, agora);
  // Concluído hoje tem prioridade em qualquer local; sem fichas do local, só um link pequeno para criar.
  if (s.tipo === 'concluido') {
    return (
      <>
        <ConcluidoHoje sessao={s.sessao} />
        {doLocal.length === 0 && (
          <Link to={`/fichas/nova?local=${local}`} className="block text-center text-sm text-primary-400 underline">
            Criar ficha de {NOME_LOCAL[local].toLowerCase()}
          </Link>
        )}
      </>
    );
  }
  if (doLocal.length === 0) return <CriarFicha local={local} />;
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

/** Peso atual, variação de cerca de 7 dias e meta (sem julgamento). Abre a lista de medidas. */
function BlocoPeso({ painel }: { painel: Painel }) {
  const r = resumoPeso(painel.medidas);
  if (!r) {
    return (
      <Link to="/medidas/nova" className="card flex min-h-16 items-center gap-3 text-lg font-semibold" data-testid="bloco-peso">
        <Plus className="text-primary-400" /> Registrar peso
      </Link>
    );
  }
  const meta = painel.settings.metaPesoKg;
  return (
    <Link to="/medidas" className="card flex items-center gap-3" aria-label="Peso" data-testid="bloco-peso">
      <Scale className="shrink-0 text-primary-400" aria-hidden />
      <div className="min-w-0 flex-1">
        <p className="text-2xl font-bold" data-testid="peso-atual">{num(r.atual.pesoKg)} kg</p>
        {r.variacao && <p className="text-neutral-300" data-testid="variacao-peso">{textoVariacao(r.variacao)}</p>}
        {meta != null && <p className="text-sm text-neutral-400" data-testid="meta-peso">{textoMeta(r.atual.pesoKg, meta, direcaoMeta(painel.settings, painel.medidas))}</p>}
      </div>
      <ChevronRight size={22} className="shrink-0 text-neutral-500" />
    </Link>
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
