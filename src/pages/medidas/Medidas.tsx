import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ChevronRight, Columns2, Plus } from 'lucide-react';
import { AvisoFotos, FotoCorporal, MostrarFotos } from '../../components/FotosCorporais';
import { Page } from '../../components/Page';
import { Desfazer } from '../../components/Desfazer';
import { useAsync } from '../../useAsync';
import { bodyMeasurementsRepository, type ExclusaoMedida } from '../../db/repositories/bodyMeasurements';
import { bodyPhotosRepository } from '../../db/repositories/bodyPhotos';
import { DESFAZER_MS, maisRecentesPrimeiro } from '../../medidas';
import { deChave } from '../../semana';
import { num } from '../../components/CampoSerie';

/** Estado da navegação depois de excluir uma medição (para o "Desfazer"). */
export interface MedidaExcluida {
  medidaExcluida: ExclusaoMedida;
  em: number;
}

/** /medidas: medições da mais recente para a mais antiga. */
export function Medidas() {
  const [dados, recarregar] = useAsync(async () => ({
    lista: maisRecentesPrimeiro(await bodyMeasurementsRepository.list()),
    fotos: await bodyPhotosRepository.porMedicao(),
  }));
  const lista = dados?.lista;
  // "Mostrar fotos" vale só enquanto a tela estiver aberta.
  const [fotosVisiveis, setFotosVisiveis] = useState(false);
  const comFoto = lista?.filter((m) => dados!.fotos.has(m.id)).length ?? 0;
  const excluida = useLocation().state as MedidaExcluida | null;
  // Fim do prazo do "Desfazer": esvazia as fotos da medição excluída (libera espaço). Saiu da tela antes: fica para a próxima abertura do app.
  useEffect(() => {
    if (!excluida?.medidaExcluida) return;
    const t = setTimeout(() => void bodyPhotosRepository.esvaziarExcluidas(), Math.max(0, excluida.em + DESFAZER_MS - Date.now()) + 50);
    return () => clearTimeout(t);
  }, [excluida]);
  return (
    <Page title="Medidas" voltar>
      <Link to="/medidas/nova" className="btn-primary w-full">
        <Plus size={22} /> Registrar medida
      </Link>
      {comFoto > 0 && (
        <>
          <AvisoFotos />
          <MostrarFotos visiveis={fotosVisiveis} onMostrar={() => setFotosVisiveis(true)} />
          {comFoto >= 2 && (
            <Link to="/medidas/comparar" className="btn-secondary w-full">
              <Columns2 size={22} /> Comparar fotos
            </Link>
          )}
        </>
      )}
      {!lista ? (
        <p>Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="card text-neutral-300">Registre seu peso e a cintura de tempos em tempos para acompanhar a evolução.</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((m) => {
            const fotos = dados!.fotos.get(m.id) ?? [];
            return (
            <li key={m.id}>
              <Link to={`/medidas/${m.id}`} className="card flex items-center gap-3" data-testid="item-medida">
                {fotos[0] && (
                  // Na lista a miniatura não amplia (o toque abre a medição); ampliar fica no editor e na comparação.
                  <div className="pointer-events-none shrink-0">
                    <FotoCorporal foto={fotos[0]} visivel={fotosVisiveis} className="h-14 w-11" rotulo="Foto da medição" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">
                    {[m.pesoKg !== null && `${num(m.pesoKg)} kg`, m.cinturaCm !== null && `cintura ${num(m.cinturaCm)} cm`].filter(Boolean).join(' · ')}
                  </p>
                  <p className="text-sm text-neutral-400">
                    {deChave(m.data).toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
                    {fotos.length > 0 && ` · ${fotos.length} ${fotos.length === 1 ? 'foto' : 'fotos'}`}
                  </p>
                </div>
                <ChevronRight size={22} className="shrink-0 text-neutral-500" />
              </Link>
            </li>
            );
          })}
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
