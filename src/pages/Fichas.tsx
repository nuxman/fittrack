import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Pencil, Play, Plus } from 'lucide-react';
import { Page } from '../components/Page';
import { useDialog } from '../components/ConfirmDialog';
import { useAsync } from '../useAsync';
import { workoutPlansRepository } from '../db/repositories/workoutPlans';
import { SessaoAtivaError, workoutSessionsRepository } from '../db/repositories/workoutSessions';
import { DIAS, SEMANA } from '../dias';

/** Aba Treinar: fichas com "Iniciar" (ação primária) e "Editar ficha". Sugestão e duração entram na 3b. */
export function Fichas() {
  const [dados] = useAsync(async () => ({ planos: await workoutPlansRepository.list(), ativa: await workoutSessionsRepository.ativa() }));
  const navigate = useNavigate();
  const { escolher, avisar } = useDialog();
  const [iniciando, setIniciando] = useState(false);
  if (!dados) return <Page title="Treinar">Carregando…</Page>;

  const { planos, ativa } = dados;
  const ordenados = [...planos].sort((a, b) => SEMANA.indexOf(a.diaSemana) - SEMANA.indexOf(b.diaSemana));
  const haDiaLivre = planos.length < 7;

  const iniciar = async (planId: string) => {
    setIniciando(true);
    try {
      await workoutSessionsRepository.iniciar(planId);
      navigate('/sessao');
    } catch (e) {
      if (!(e instanceof SessaoAtivaError)) return void (await avisar('Não foi possível iniciar', e instanceof Error ? e.message : undefined));
      const r = await escolher({
        titulo: 'Treino em andamento',
        mensagem: `Finalize ou abandone "${e.sessao.planSnapshot.nome}" antes de iniciar outro.`,
        opcoes: [{ label: 'Retomar treino', value: true }],
      });
      if (r) navigate('/sessao');
    } finally {
      setIniciando(false);
    }
  };

  return (
    <Page title="Treinar">
      {ativa && (
        <Link to="/sessao" className="btn-primary w-full">
          <Play size={22} /> Retomar treino — {ativa.planSnapshot.nome}
        </Link>
      )}
      {ordenados.map((p) => (
        <section key={p.id} className="card space-y-3">
          <div>
            <p className="text-sm font-semibold uppercase text-primary-400">{DIAS[p.diaSemana]}</p>
            <h2 className="text-lg font-semibold">{p.nome}</h2>
            <p className="text-neutral-400">{p.itens.length} exercícios</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" className="btn-primary" disabled={iniciando || p.itens.length === 0} onClick={() => iniciar(p.id)} aria-label={`Iniciar ${p.nome}`}>
              <Play size={22} /> Iniciar
            </button>
            <Link to={`/fichas/${p.id}`} className="btn-secondary">
              <Pencil size={20} /> Editar ficha
            </Link>
          </div>
        </section>
      ))}
      {ordenados.length === 0 && <p className="card text-neutral-400">Nenhuma ficha cadastrada.</p>}
      {haDiaLivre && (
        <Link to="/fichas/nova" className="btn-secondary w-full">
          <Plus size={22} /> Nova ficha
        </Link>
      )}
    </Page>
  );
}
