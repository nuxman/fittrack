import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Trash2 } from 'lucide-react';
import { Page } from '../../components/Page';
import { useDialog } from '../../components/ConfirmDialog';
import { num } from '../../components/CampoSerie';
import { useAsync } from '../../useAsync';
import { useAvisoNaoSalvo } from '../../useAvisoNaoSalvo';
import { bodyMeasurementsRepository } from '../../db/repositories/bodyMeasurements';
import { lerMedida, LIMITES } from '../../medidas';
import { chaveDia } from '../../semana';
import type { BodyMeasurement } from '../../db/types';
import type { MedidaExcluida } from './Medidas';

/** /medidas/nova e /medidas/:id: data, peso, cintura e observações (pelo menos peso ou cintura). */
export function MedidaEditor() {
  const { id = 'nova' } = useParams();
  const [dados] = useAsync(async () => ({ m: id === 'nova' ? undefined : await bodyMeasurementsRepository.get(id) }), [id]);
  if (!dados) return <Page title="Medida" voltar>Carregando…</Page>;
  if (id !== 'nova' && !dados.m) return <Page title="Medida" voltar><p className="card">Medida não encontrada.</p></Page>;
  return <Formulario key={id} m={dados.m} />;
}

function Formulario({ m }: { m?: BodyMeasurement }) {
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
      if (m) await bodyMeasurementsRepository.editar(m.id, d);
      else await bodyMeasurementsRepository.registrar(d);
      liberar();
      navigate(-1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar a medida');
      setGravando(false);
    }
  };

  const excluir = async () => {
    if (!m || !(await confirmar('Excluir medida?', 'A medida sai da lista, do Início e dos gráficos.', 'Excluir medida', true))) return;
    await bodyMeasurementsRepository.remove(m.id);
    liberar();
    navigate('/medidas', { replace: true, state: { medidaExcluida: m.id, em: Date.now() } satisfies MedidaExcluida });
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
      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <button type="button" className="btn-primary w-full" disabled={gravando} onClick={() => void salvar()}>
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
