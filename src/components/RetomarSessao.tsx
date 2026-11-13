import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDialog } from './ConfirmDialog';
import { workoutSessionsRepository } from '../db/repositories/workoutSessions';
import { exerciseSetsRepository } from '../db/repositories/exerciseSets';
import { cardioSessionsRepository } from '../db/repositories/cardioSessions';
import { settingsRepository } from '../db/repositories/settings';
import { cardioEsquecido, rascunhoPadrao, validarCardio } from '../cardio';
import { exercicioAtual, fimDaUltimaSerie, pulados, sessaoEsquecida, ultimaAtividade } from '../sessao';

type Escolha = 'finalizar' | 'retomar' | 'abandonar';
type EscolhaCardio = 'planejada' | 'outra' | 'cancelar';

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
      if (!s) return retomarCardio();
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

    /** Cardio pós-treino em curso: volta para a tela; esquecido (> 3 h), pergunta o que fazer. */
    async function retomarCardio() {
      const t = await workoutSessionsRepository.comCardio();
      if (!t?.cardio) return;
      const destino = `/cardio/${t.id}`;
      if (!cardioEsquecido(t.cardio, Date.now())) {
        if (inicial.current !== destino) navigate(destino, { replace: true });
        return;
      }
      const r = t.cardio.rascunho ?? rascunhoPadrao((await settingsRepository.get()).cardioPadrao);
      const escolha = await escolher<EscolhaCardio>({
        titulo: 'Cardio esquecido aberto',
        mensagem: `O cardio depois de "${t.planSnapshot.nome}" está aberto há mais de 3 horas.`,
        opcoes: [
          { label: 'Concluir com a duração planejada', value: 'planejada' },
          { label: 'Concluir com outra duração', value: 'outra', variante: 'secundaria' },
          { label: 'Cancelar cardio', value: 'cancelar', variante: 'perigo' },
        ],
        semCancelar: true,
      });
      if (escolha === 'cancelar') return void (await workoutSessionsRepository.encerrarCardio(t.id));
      if (escolha === 'planejada') {
        try {
          return void (await cardioSessionsRepository.concluirDoTreino(t.id, { ...validarCardio(r), rpe: null, observacoes: '' }));
        } catch {
          // Rascunho inválido: abre a tela para corrigir.
        }
      }
      // Outra duração: cronômetro parado, campo de duração liberado e em foco.
      await workoutSessionsRepository.setCardio(t.id, { fimEm: null });
      navigate(`${destino}?duracao=1`, { replace: true });
    }
  }, [escolher, navigate]);

  return null;
}
