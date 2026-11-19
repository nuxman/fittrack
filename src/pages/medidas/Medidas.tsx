import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { Page } from '../../components/Page';
import { Desfazer } from '../../components/Desfazer';
import { useAsync } from '../../useAsync';
import { bodyMeasurementsRepository } from '../../db/repositories/bodyMeasurements';
import { maisRecentesPrimeiro } from '../../medidas';
import { deChave } from '../../semana';
import { num } from '../../components/CampoSerie';

/** Estado da navegação depois de excluir uma medição (para o "Desfazer"). */
export interface MedidaExcluida {
  medidaExcluida: string;
  em: number;
}

/** /medidas: medições da mais recente para a mais antiga. */
export function Medidas() {
  const [lista, recarregar] = useAsync(async () => maisRecentesPrimeiro(await bodyMeasurementsRepository.list()));
  const excluida = useLocation().state as MedidaExcluida | null;
  return (
    <Page title="Medidas" voltar>
      <Link to="/medidas/nova" className="btn-primary w-full">
        <Plus size={22} /> Registrar medida
      </Link>
      {!lista ? (
        <p>Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="card text-neutral-300">Registre seu peso e a cintura de tempos em tempos para acompanhar a evolução.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((m) => (
            <li key={m.id}>
              <Link to={`/medidas/${m.id}`} className="card flex items-center gap-3" data-testid="item-medida">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">
                    {[m.pesoKg !== null && `${num(m.pesoKg)} kg`, m.cinturaCm !== null && `cintura ${num(m.cinturaCm)} cm`].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-sm text-neutral-400">
                    {deChave(m.data).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <ChevronRight size={22} className="shrink-0 text-neutral-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
      {excluida?.medidaExcluida && (
        <Desfazer
          key={excluida.em}
          em={excluida.em}
          texto="Medida excluída"
          onDesfazer={async () => {
            await bodyMeasurementsRepository.restaurar(excluida.medidaExcluida);
            recarregar();
          }}
        />
      )}
    </Page>
  );
}
