import { Link } from 'react-router-dom';
import { HeartPulse, Trophy } from 'lucide-react';
import { useAsync } from '../../useAsync';
import { cardioSessionsRepository } from '../../db/repositories/cardioSessions';
import { cardioPorModalidade, NOME_MODALIDADE, recordesCardio, rotuloNivel } from '../../cardio';
import { num } from '../../components/CampoSerie';
import { ddmm, seriesCardio } from './dados';
import { Grafico } from './Grafico';

/** Evolução → Cardio: por modalidade, recordes, gráficos (a partir de 2 sessões) e tabela. */
export function EvolucaoCardio() {
  const [grupos] = useAsync(async () => cardioPorModalidade(await cardioSessionsRepository.list()));
  if (!grupos) return <p>Carregando…</p>;
  if (grupos.length === 0) {
    return (
      <div className="card space-y-4">
        <p className="text-lg text-neutral-300">Aqui você vai ver a duração, a distância e os recordes do seu cardio, por modalidade.</p>
        <Link to="/historico/cardio/novo" className="btn-primary w-full">
          <HeartPulse size={22} /> Registrar cardio
        </Link>
      </div>
    );
  }
  return (
    <>
      {grupos.map(([m, lista]) => {
        const series = seriesCardio(m);
        // Cada gráfico precisa de 2 sessões com aquele dado (ex.: velocidade só das sessões com velocidade).
        const graficos = series.filter((s) => lista.filter((c) => s.valor(c) != null).length >= 2);
        return (
          <section key={m} className="card space-y-4" aria-label={NOME_MODALIDADE[m]} data-testid="cardio-modalidade">
            <h2 className="text-lg font-semibold text-primary-400">
              {NOME_MODALIDADE[m]} <span className="text-sm font-normal text-neutral-400">· {lista.length} {lista.length === 1 ? 'sessão' : 'sessões'}</span>
            </h2>

            <ul className="space-y-1" aria-label="Recordes">
              {recordesCardio(m, lista).map((r) => (
                <li key={r.rotulo} className="flex items-center gap-2" data-testid="recorde-cardio">
                  <Trophy size={18} className="shrink-0 text-primary-400" aria-hidden />
                  <span>
                    <span className="text-neutral-300">{r.rotulo}:</span>{' '}
                    <span className="font-semibold">{num(r.valor)} {r.unidade}</span>{' '}
                    <span className="text-sm text-neutral-500">em {ddmm(r.data)}</span>
                  </span>
                </li>
              ))}
            </ul>

            {lista.length < 2 ? (
              <p className="text-sm text-neutral-400">O gráfico aparece a partir da segunda sessão desta modalidade.</p>
            ) : (
              graficos.map((s) => <Grafico key={s.titulo} {...s} pontos={lista} />)
            )}

            <details>
              <summary className="cursor-pointer text-neutral-300">Ver em tabela</summary>
              <table className="mt-2 w-full text-left text-sm">
                <thead className="text-neutral-400">
                  <tr>
                    <th className="py-1 font-normal">Data</th>
                    {series.map((s) => <th key={s.titulo} className="py-1 font-normal">{s.titulo.replace(/ por sessão$/, '').replace(/ média$/, '')}</th>)}
                    <th className="py-1 font-normal">{rotuloNivel(m)}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...lista].reverse().map((c) => (
                    <tr key={c.id} className="border-t border-neutral-800">
                      <td className="py-1">{ddmm(c.data)}</td>
                      {series.map((s) => {
                        const v = s.valor(c);
                        return <td key={s.titulo} className="py-1">{v == null ? '—' : s.formatar(v)}</td>;
                      })}
                      <td className="py-1">{c.inclinacaoNivel?.rotulo ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </details>
          </section>
        );
      })}
    </>
  );
}
