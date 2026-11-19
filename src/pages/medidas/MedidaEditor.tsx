import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Trash2 } from 'lucide-react';
import { Page } from '../../components/Page';
import { useDialog } from '../../components/ConfirmDialog';
import { CampoFotos } from '../../components/FotosCorporais';
import { num } from '../../components/CampoSerie';
import { useAsync } from '../../useAsync';
import { useAvisoNaoSalvo } from '../../useAvisoNaoSalvo';
import { bodyMeasurementsRepository } from '../../db/repositories/bodyMeasurements';
import { bodyPhotosRepository } from '../../db/repositories/bodyPhotos';
import { resizeImage } from '../../image';
import { lerMedida, LIMITES } from '../../medidas';
import { chaveDia } from '../../semana';
import type { BodyMeasurement, BodyPhoto } from '../../db/types';
import type { MedidaExcluida } from './Medidas';

/** /medidas/nova e /medidas/:id: data, peso, cintura e observações (pelo menos peso ou cintura). */
export function MedidaEditor() {
  const { id = 'nova' } = useParams();
  const [dados] = useAsync(
    async () => (id === 'nova' ? { m: undefined, fotos: [] } : { m: await bodyMeasurementsRepository.get(id), fotos: await bodyPhotosRepository.daMedicao(id) }),
    [id],
  );
  if (!dados) return <Page title="Medida" voltar>Carregando…</Page>;
  if (id !== 'nova' && !dados.m) return <Page title="Medida" voltar><p className="card">Medida não encontrada.</p></Page>;
  return <Formulario key={id} m={dados.m} fotosSalvas={dados.fotos} />;
}

function Formulario({ m, fotosSalvas }: { m?: BodyMeasurement; fotosSalvas: BodyPhoto[] }) {
  const navigate = useNavigate();
  const { confirmar } = useDialog();
  const hoje = chaveDia(new Date());
  const [data, setData] = useState(m?.data ?? hoje);
  const [peso, setPeso] = useState(m?.pesoKg != null ? num(m.pesoKg) : '');
  const [cintura, setCintura] = useState(m?.cinturaCm != null ? num(m.cinturaCm) : '');
  const [obs, setObs] = useState(m?.observacoes ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const liberar = useAvisoNaoSalvo(sujo);
  // Fotos: adicionadas (já redimensionadas) e removidas só valem ao salvar, como os outros campos.
  const [novas, setNovas] = useState<Blob[]>([]);
  const [removidas, setRemovidas] = useState<string[]>([]);
  const [processando, setProcessando] = useState(false);
  // "Mostrar fotos" vale só enquanto a tela estiver aberta.
  const [fotosVisiveis, setFotosVisiveis] = useState(false);
  const fotos = useMemo(() => {
    const ts = new Date().toISOString();
    return [
      ...fotosSalvas.filter((f) => !removidas.includes(f.id)),
      ...novas.map((blob, k): BodyPhoto => ({ id: `nova-${k}`, measurementId: m?.id ?? '', blob, createdAt: ts, updatedAt: ts, deletedAt: null })),
    ];
  }, [fotosSalvas, removidas, novas, m]);

  const adicionarFoto = async (file: File) => {
    setProcessando(true);
    try {
      const { blob } = await resizeImage(file); // nunca o original
      setNovas((l) => [...l, blob]);
      setSujo(true);
      // Quem acabou de escolher a foto já a viu.
      setFotosVisiveis(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Erro ao processar a imagem');
    } finally {
      setProcessando(false);
    }
  };
  const removerFoto = (f: BodyPhoto) => {
    if (f.id.startsWith('nova-')) setNovas((l) => l.filter((_, k) => `nova-${k}` !== f.id));
    else setRemovidas((l) => [...l, f.id]);
    setSujo(true);
  };

  const mexeu = (set: (v: string) => void) => (v: string) => {
    set(v);
    setSujo(true);
    setErro(null);
  };

  const salvar = async () => {
    setGravando(true);
    try {
      const d = {
        data,
        pesoKg: lerMedida(peso, 'Peso (kg)', ...LIMITES.peso),
        cinturaCm: lerMedida(cintura, 'Cintura (cm)', ...LIMITES.cintura),
        observacoes: obs,
      };
      await bodyMeasurementsRepository.salvar(m?.id ?? null, d, { novas, removidas });
      liberar();
      navigate(-1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a medida');
      setGravando(false);
    }
  };

  const excluir = async () => {
    const msg = fotosSalvas.length ? 'A medida e as fotos dela saem da lista, do Início e dos gráficos.' : 'A medida sai da lista, do Início e dos gráficos.';
    if (!m || !(await confirmar('Excluir medida?', msg, 'Excluir medida', true))) return;
    const exclusao = await bodyMeasurementsRepository.excluir(m.id);
    liberar();
    navigate('/medidas', { replace: true, state: { medidaExcluida: exclusao, em: Date.now() } satisfies MedidaExcluida });
  };

  return (
    <Page title={m ? 'Editar medida' : 'Registrar medida'} voltar>
      <label className="block">
        <span className="mb-1 block text-sm text-neutral-300">Data</span>
        <input type="date" className="input" max={hoje} value={data} onChange={(e) => mexeu(setData)(e.target.value)} />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Peso (kg)</span>
          <input className="input" inputMode="decimal" value={peso} onChange={(e) => mexeu(setPeso)(e.target.value)} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Cintura (cm)</span>
          <input className="input" inputMode="decimal" value={cintura} onChange={(e) => mexeu(setCintura)(e.target.value)} />
        </label>
      </div>
      <p className="text-sm text-neutral-400">Preencha o peso, a cintura ou os dois.</p>
      <label className="card block">
        <span className="text-lg font-semibold">Observações</span>
        <textarea className="input mt-2 min-h-24 py-3" value={obs} onChange={(e) => mexeu(setObs)(e.target.value)} />
      </label>
      <CampoFotos
        fotos={fotos}
        visiveis={fotosVisiveis}
        ocupado={processando || gravando}
        onMostrar={() => setFotosVisiveis(true)}
        onAdicionar={(f) => void adicionarFoto(f)}
        onRemover={removerFoto}
      />
      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <button type="button" className="btn-primary w-full" disabled={gravando || processando} onClick={() => void salvar()}>
        <Check size={22} /> {m ? 'Salvar' : 'Registrar medida'}
      </button>
      {m && (
        <button type="button" className="btn w-full bg-red-600 text-white active:bg-red-700" onClick={() => void excluir()}>
          <Trash2 size={20} /> Excluir medida
        </button>
      )}
    </Page>
  );
}
