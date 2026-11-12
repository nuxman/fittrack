import { Link } from 'react-router-dom';
import { Play, Plus } from 'lucide-react';
import { Page } from '../components/Page';
import { CardFicha } from '../components/CardFicha';
import { CriarFicha, SeletorLocal } from '../components/SeletorLocal';
import { useAsync } from '../useAsync';
import { useIniciar } from '../useIniciar';
import { useLocalHoje } from '../useLocalHoje';
import { carregarPainel } from '../painel';
import { localDe } from '../db/repositories/workoutPlans';
import { DIAS } from '../dias';
import { sugestao } from '../semana';

/**
 * Aba Treinar: fichas do local escolhido (mesmo local do dia do Início), com "Sugerido" conforme a regra.
 * Qualquer ficha pode ser iniciada em qualquer dia.
 */
export function Fichas() {
  const [painel, recarregar] = useAsync(carregarPainel);
  const [local, setLocal] = useLocalHoje(painel, recarregar);
  const { iniciar, iniciando } = useIniciar(painel);
  if (!painel) return <Page title="Treinar">Carregando…</Page>;

  const { ativa } = painel;
  const doLocal = painel.planos.filter((p) => localDe(p) === local);
  const s = sugestao(painel.planos, painel.sessoes, local, new Date());
  const sugeridoId = s.tipo === 'hoje' || s.tipo === 'pendente' ? s.plano.id : undefined;
  const motivo = s.tipo === 'pendente' ? `Sugerido · pendente${s.opcional ? ' (opcional)' : ''}` : 'Sugerido · hoje';
  // Sugerido primeiro; o resto na ordem da semana.
  const ordenados = [...doLocal].sort((a, b) => Number(b.id === sugeridoId) - Number(a.id === sugeridoId));
  const haDiaLivre = doLocal.length < 7;

  return (
    <Page title="Treinar">
      <SeletorLocal valor={local} onMudar={(l) => void setLocal(l)} rotulo="Filtrar por local" />
      {ativa && (
        <Link to="/sessao" className="btn-primary w-full">
          <Play size={22} /> Retomar treino — {ativa.planSnapshot.nome}
        </Link>
      )}
      {ordenados.map((p) => (
        <CardFicha
          key={p.id}
          plano={p}
          painel={painel}
          destaque={p.id === sugeridoId}
          motivo={p.id === sugeridoId ? `${DIAS[p.diaSemana]} · ${motivo}` : undefined}
          iniciando={iniciando}
          onIniciar={() => iniciar(p)}
        />
      ))}
      {doLocal.length === 0 ? (
        <CriarFicha local={local} />
      ) : (
        haDiaLivre && (
          <Link to={`/fichas/nova?local=${local}`} className="btn-secondary w-full">
            <Plus size={22} /> Nova ficha
          </Link>
        )
      )}
    </Page>
  );
}
