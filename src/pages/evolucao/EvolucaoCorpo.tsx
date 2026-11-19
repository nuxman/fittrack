import { Link } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import { useAsync } from '../../useAsync';
import { bodyMeasurementsRepository } from '../../db/repositories/bodyMeasurements';
import { maisRecentesPrimeiro } from '../../medidas';
import { num } from '../../components/CampoSerie';
import type { BodyMeasurement } from '../../db/types';
import { ddmm, type Serie } from './dados';
import { Grafico } from './Grafico';

const SERIES: Serie<BodyMeasurement>[] = [
  { titulo: 'Peso', valor: (m) => m.pesoKg, formatar: (v) => `${num(v)} kg` },
  { titulo: 'Cintura', valor: (m) => m.cinturaCm, formatar: (v) => `${num(v)} cm` },
];

/** Evolução → Corpo: gráficos de peso e cintura (cada um a partir de 2 medições com o dado) e acesso à lista de medidas. */
export function EvolucaoCorpo() {
  const [lista] = useAsync(async () => maisRecentesPrimeiro(await bodyMeasurementsRepository.list()).reverse());
  if (!lista) return <p>Carregando…</p>;
  if (lista.length === 0) {
    return (
      <div className="card space-y-4">
        <p className="text-lg text-neutral-300">Aqui você vai ver a evolução do seu peso e da cintura.</p>
        <Link to="/medidas/nova" className="btn-primary w-full">
          <Plus size={22} /> Registrar medida
        </Link>
      </div>
    );
  }
  return (
    <>
      <Link to="/medidas" className="card flex min-h-16 items-center justify-between text-lg font-semibold">
        Medidas ({lista.length}) <ChevronRight className="text-neutral-500" />
      </Link>
      {SERIES.map((s) => {
        const pontos = lista.filter((m) => s.valor(m) !== null);
        if (pontos.length === 0) return null;
        return (
          <section key={s.titulo} className="card space-y-2" aria-label={s.titulo}>
            {pontos.length < 2 ? (
              <>
                <h2 className="font-semibold text-neutral-200">{s.titulo}</h2>
                <p className="text-sm text-neutral-400">
                  {s.formatar(s.valor(pontos[0]!)!)} em {ddmm(pontos[0]!.data)}. O gráfico aparece a partir da segunda medição.
                </p>
              </>
            ) : (
              <Grafico {...s} pontos={pontos} />
            )}
          </section>
        );
      })}
    </>
  );
}
