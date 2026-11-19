import { useState } from 'react';
import { Page } from '../../components/Page';
import { AvisoFotos, FotoCorporal, MostrarFotos } from '../../components/FotosCorporais';
import { useAsync } from '../../useAsync';
import { bodyMeasurementsRepository } from '../../db/repositories/bodyMeasurements';
import { bodyPhotosRepository } from '../../db/repositories/bodyPhotos';
import { maisRecentesPrimeiro } from '../../medidas';
import { deChave } from '../../semana';
import type { BodyMeasurement } from '../../db/types';

const rotulo = (m: BodyMeasurement) => deChave(m.data).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

/** /medidas/comparar: duas medições com foto, lado a lado (padrão: a mais antiga e a mais recente). */
export function CompararFotos() {
  const [dados] = useAsync(async () => {
    const fotos = await bodyPhotosRepository.porMedicao();
    return { lista: maisRecentesPrimeiro(await bodyMeasurementsRepository.list()).filter((m) => fotos.has(m.id)), fotos };
  });
  const [escolha, setEscolha] = useState<[string?, string?]>([]);
  // "Mostrar fotos" vale só enquanto a tela estiver aberta.
  const [visiveis, setVisiveis] = useState(false);
  if (!dados) return <Page title="Comparar fotos" voltar>Carregando…</Page>;
  const { lista, fotos } = dados;
  if (lista.length < 2) return <Page title="Comparar fotos" voltar><p className="card">Registre fotos em pelo menos duas medições para comparar.</p></Page>;
  const ids = [escolha[0] ?? lista[lista.length - 1]!.id, escolha[1] ?? lista[0]!.id];

  return (
    <Page title="Comparar fotos" voltar>
      <AvisoFotos />
      <MostrarFotos visiveis={visiveis} onMostrar={() => setVisiveis(true)} />
      <div className="grid grid-cols-2 gap-2">
        {ids.map((id, lado) => (
          <section key={lado} className="space-y-2" aria-label={lado === 0 ? 'Antes' : 'Depois'}>
            <select
              className="input px-2"
              aria-label={lado === 0 ? 'Medição da esquerda' : 'Medição da direita'}
              value={id}
              onChange={(e) => setEscolha((l) => (lado === 0 ? [e.target.value, l[1]] : [l[0], e.target.value]))}
            >
              {lista.map((m) => <option key={m.id} value={m.id}>{rotulo(m)}</option>)}
            </select>
            {(fotos.get(id) ?? []).map((f, k) => (
              <FotoCorporal key={f.id} foto={f} visivel={visiveis} className="aspect-[3/4] w-full" rotulo={`Ampliar foto ${k + 1} de ${rotulo(lista.find((m) => m.id === id)!)}`} />
            ))}
          </section>
        ))}
      </div>
    </Page>
  );
}
