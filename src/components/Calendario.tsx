import { Link } from 'react-router-dom';
import { Check, HeartPulse, Moon } from 'lucide-react';
import type { Painel } from '../painel';
import { DIAS } from '../dias';
import { chaveDia, destinoDoDia, inicioSemana, marcasPorDia } from '../semana';

const LETRAS = ['S', 'T', 'Q', 'Q', 'S', 'S', 'D'];

/** Calendário do Início: últimas 5 semanas (segunda a domingo), com treino, cardio e descanso; hoje em destaque. */
export function Calendario({ painel, agora }: { painel: Painel; agora: Date }) {
  const marcas = marcasPorDia(painel);
  const hoje = chaveDia(agora);
  const ini = inicioSemana(agora);
  const dias = Array.from({ length: 35 }, (_, k) => new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() - 28 + k));
  return (
    <section className="card space-y-2" aria-label="Calendário das últimas 5 semanas" data-testid="calendario">
      <div className="grid grid-cols-7 gap-1 text-center text-xs text-neutral-500" aria-hidden>
        {LETRAS.map((l, k) => <span key={k}>{l}</span>)}
      </div>
      <ol className="grid grid-cols-7 gap-1 text-center">
        {dias.map((data) => {
          const chave = chaveDia(data);
          const d = marcas.get(chave);
          const treino = !!d?.treinos.length;
          const eHoje = chave === hoje;
          const destino = destinoDoDia(marcas, chave);
          const rotulo = [
            `${DIAS[data.getDay()]} ${data.toLocaleDateString('pt-BR', { day: 'numeric', month: 'long' })}`,
            treino && 'treino', d?.cardio && 'cardio', d?.descanso && 'descanso', eHoje && 'hoje',
          ].filter(Boolean).join(', ');
          const conteudo = (
            <>
              <span className={`text-sm ${chave > hoje ? 'text-neutral-600' : treino ? 'font-bold text-neutral-950' : 'text-neutral-300'}`}>{data.getDate()}</span>
              <span className="flex h-3 items-center gap-0.5">
                {treino && <Check size={11} className="text-neutral-950" aria-hidden />}
                {d?.cardio && <HeartPulse size={11} className={treino ? 'text-neutral-950' : 'text-primary-400'} aria-hidden />}
                {d?.descanso && !treino && <Moon size={10} className="text-neutral-400" aria-hidden />}
              </span>
            </>
          );
          const classe = `flex h-11 flex-col items-center justify-center rounded-lg ${treino ? 'bg-primary-400' : 'bg-surface-raised'} ${eHoje ? 'ring-2 ring-neutral-100' : ''}`;
          return (
            <li key={chave} data-testid="dia-calendario">
              {destino ? (
                <Link to={destino} aria-label={rotulo} className={classe}>{conteudo}</Link>
              ) : (
                <span aria-label={rotulo} className={classe}>{conteudo}</span>
              )}
            </li>
          );
        })}
      </ol>
      <p className="flex flex-wrap justify-center gap-x-4 text-xs text-neutral-400">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-3 rounded bg-primary-400" aria-hidden /> treino</span>
        <span className="flex items-center gap-1"><HeartPulse size={12} className="text-primary-400" aria-hidden /> cardio</span>
        <span className="flex items-center gap-1"><Moon size={12} aria-hidden /> descanso</span>
      </p>
    </section>
  );
}
