import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Check, Trash2 } from 'lucide-react';
import { Page } from '../../components/Page';
import { CamposCardio } from '../../components/CamposCardio';
import { EscolhaRpe } from '../../components/EscolhaRpe';
import { useDialog } from '../../components/ConfirmDialog';
import { useAsync } from '../../useAsync';
import { useAvisoNaoSalvo } from '../../useAvisoNaoSalvo';
import { cardioSessionsRepository } from '../../db/repositories/cardioSessions';
import { settingsRepository } from '../../db/repositories/settings';
import { rascunhoDe, rascunhoPadrao, validarCardio } from '../../cardio';
import { chaveDia } from '../../semana';
import type { CardioSession, RascunhoCardio } from '../../db/types';
import type { EstadoHistorico } from './Historico';

/** /historico/cardio/novo (cardio avulso, sem cronômetro) e /historico/cardio/:id (corrigir ou excluir). */
export function CardioAvulso() {
  const { id = 'novo' } = useParams();
  const [dados] = useAsync(
    async () => ({ cardio: id === 'novo' ? undefined : await cardioSessionsRepository.get(id), padrao: (await settingsRepository.get()).cardioPadrao }),
    [id],
  );
  if (!dados) return <Page title="Cardio" voltar>Carregando…</Page>;
  if (id !== 'novo' && !dados.cardio) return <Page title="Cardio" voltar><p className="card">Cardio não encontrado.</p></Page>;
  return <Formulario key={id} cardio={dados.cardio} inicial={dados.cardio ? rascunhoDe(dados.cardio) : rascunhoPadrao(dados.padrao)} />;
}

function Formulario({ cardio, inicial }: { cardio?: CardioSession; inicial: RascunhoCardio }) {
  const navigate = useNavigate();
  const { confirmar } = useDialog();
  const hoje = chaveDia(new Date());
  const [r, setR] = useState(inicial);
  const [data, setData] = useState(cardio?.data ?? hoje);
  const [rpe, setRpe] = useState(cardio?.rpe ?? null);
  const [obs, setObs] = useState(cardio?.observacoes ?? '');
  const [erro, setErro] = useState<string | null>(null);
  const [gravando, setGravando] = useState(false);
  const [sujo, setSujo] = useState(false);
  const liberar = useAvisoNaoSalvo(sujo);
  const ligado = !!cardio?.sessionId;

  const mexeu = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setSujo(true);
    setErro(null);
  };

  const salvar = async () => {
    setGravando(true);
    try {
      const d = { ...validarCardio(r), rpe, observacoes: obs, data };
      if (cardio) await cardioSessionsRepository.editar(cardio.id, d);
      else await cardioSessionsRepository.registrarAvulso(d);
      liberar();
      navigate(-1);
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'Não foi possível salvar o cardio');
      setGravando(false);
    }
  };

  const excluir = async () => {
    if (!cardio || !(await confirmar('Excluir cardio?', 'Este cardio deixa de contar nos minutos da semana.', 'Excluir cardio', true))) return;
    await cardioSessionsRepository.excluirAvulso(cardio.id);
    liberar();
    navigate('/historico', { replace: true, state: { cardioAvulso: cardio.id, em: Date.now() } satisfies EstadoHistorico });
  };

  return (
    <Page title={cardio ? 'Editar cardio' : 'Registrar cardio'} voltar>
      {ligado ? (
        <p className="text-sm text-neutral-400">Cardio feito depois do treino; a data segue a do treino.</p>
      ) : (
        <label className="block">
          <span className="mb-1 block text-sm text-neutral-300">Data</span>
          <input type="date" className="input" max={hoje} value={data} onChange={(e) => mexeu(setData)(e.target.value)} />
        </label>
      )}
      <CamposCardio r={r} mudar={(m) => mexeu(setR)({ ...r, ...m })} />
      <EscolhaRpe valor={rpe} onChange={mexeu(setRpe)} />
      <label className="card block">
        <span className="text-lg font-semibold">Observações</span>
        <textarea className="input mt-2 min-h-24 py-3" value={obs} onChange={(e) => mexeu(setObs)(e.target.value)} />
      </label>
      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <button type="button" className="btn-primary w-full" disabled={gravando} onClick={() => void salvar()}>
        <Check size={22} /> {cardio ? 'Salvar' : 'Registrar cardio'}
      </button>
      {cardio && !ligado && (
        <button type="button" className="btn w-full bg-red-600 text-white active:bg-red-700" onClick={() => void excluir()}>
          <Trash2 size={20} /> Excluir cardio
        </button>
      )}
    </Page>
  );
}
