import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDialog } from './ConfirmDialog';
import { workoutSessionsRepository } from '../db/repositories/workoutSessions';
import { exerciseSetsRepository } from '../db/repositories/exerciseSets';
import { exercicioAtual, fimDaUltimaSerie, pulados, sessaoEsquecida, ultimaAtividade } from '../sessao';

type Escolha = 'finalizar' | 'retomar' | 'abandonar';

/** Ao abrir o app: leva à sessão ativa no exercício certo; se esquecida (> 3 h), pergunta o que fazer. */
export function RetomarSessao() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { escolher } = useDialog();
  const feito = useRef(false);
  const inicial = useRef(pathname);

  useEffect(() => {
    if (feito.current) return;
    feito.current = true;
    void (async () => {
      const s = await workoutSessionsRepository.ativa();
      if (!s) return;
      const sets = await exerciseSetsRepository.listarDaSessao(s.id);
      const atual = exercicioAtual(s.planSnapshot.itens, sets, pulados(s));
      const destino = atual ? `/sessao/${atual}` : '/sessao';

      if (sessaoEsquecida(s, sets, Date.now())) {
        const fimSerie = fimDaUltimaSerie(s, sets);
        const escolha = await escolher<Escolha>({
          titulo: 'Treino esquecido aberto',
          mensagem: `"${s.planSnapshot.nome}" está aberto há mais de 3 horas sem atividade.`,
          opcoes: [
            { label: 'Finalizar no horário da última série', value: 'finalizar' },
            { label: 'Retomar', value: 'retomar', variante: 'secundaria' },
            { label: 'Abandonar', value: 'abandonar', variante: 'perigo' },
          ],
          semCancelar: true,
        });
        if (escolha === 'finalizar') return navigate(`/sessao/finalizar?fim=${fimSerie}`, { replace: true });
        if (escolha === 'abandonar') {
          await workoutSessionsRepository.abandonar(s.id, ultimaAtividade(s, sets));
          return;
        }
        if (escolha === 'retomar') {
          // Fecha o tempo na última atividade: as horas paradas não contam.
          await workoutSessionsRepository.retomar(s.id, ultimaAtividade(s, sets));
          return navigate(destino, { replace: true });
        }
        return;
      }
      if (!inicial.current.startsWith('/sessao')) navigate(destino, { replace: true });
    })();
  }, [escolher, navigate]);

  return null;
}
