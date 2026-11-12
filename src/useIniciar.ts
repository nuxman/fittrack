import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDialog } from './components/ConfirmDialog';
import { SessaoAtivaError, workoutSessionsRepository } from './db/repositories/workoutSessions';
import type { GrupoMuscular, WorkoutPlan } from './db/types';
import { avisoGrupoSeguido, gruposDaFicha } from './semana';
import { prepararAudio } from './somDescanso';
import type { Painel } from './painel';

/** Texto do aviso informativo de mesmo grupo em dias seguidos, ou null. */
export function textoAviso(plano: WorkoutPlan, p: Pick<Painel, 'exercicios' | 'sessoes'>, agora = new Date()): string | null {
  const grupos = gruposDaFicha(plano.itens, (id) => p.exercicios.get(id)?.grupoPrincipal);
  const a = avisoGrupoSeguido(grupos, p.sessoes, agora);
  return a && `Ontem você treinou ${juntar(a.grupos)} com esforço ${a.rpe}.`;
}
const juntar = (g: GrupoMuscular[]) => (g.length < 2 ? g.join('') : `${g.slice(0, -1).join(', ')} e ${g.at(-1)}`);

/** "Iniciar": aviso informativo (nunca bloqueante) de grupo seguido, sessão ativa, e abre a sessão. */
export function useIniciar(painel: Painel | undefined) {
  const navigate = useNavigate();
  const { escolher, confirmar, avisar } = useDialog();
  const [iniciando, setIniciando] = useState(false);

  const iniciar = async (plano: WorkoutPlan) => {
    prepararAudio(); // gesto do usuário: libera o som do descanso
    if (!painel) return;
    const aviso = textoAviso(plano, painel);
    if (aviso && !(await confirmar('Mesmo grupo de ontem', `${aviso} Iniciar mesmo assim?`, 'Iniciar mesmo assim'))) return;
    setIniciando(true);
    try {
      await workoutSessionsRepository.iniciar(plano.id);
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
  return { iniciar, iniciando };
}
