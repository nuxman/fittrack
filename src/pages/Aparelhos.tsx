import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronRight, Plus, Trash2 } from 'lucide-react';
import { ZodError } from 'zod';
import { Page } from '../components/Page';
import { useDialog } from '../components/ConfirmDialog';
import { useAsync } from '../useAsync';
import { useAvisoNaoSalvo } from '../useAvisoNaoSalvo';
import { AparelhoEmUsoError, equipmentRepository } from '../db/repositories/equipment';
import type { Equipment } from '../db/types';

/** /aparelhos: aparelhos cadastrados, em ordem alfabética. */
export function Aparelhos() {
  const [lista] = useAsync(() => equipmentRepository.list());
  return (
    <Page title="Aparelhos" voltar>
      <Link to="/aparelhos/novo" className="btn-primary w-full">
        <Plus size={22} /> Novo aparelho
      </Link>
      {!lista ? (
        <p>Carregando…</p>
      ) : lista.length === 0 ? (
        <p className="card text-neutral-300">Cadastre os aparelhos da academia para ligá-los aos exercícios (ex.: número ou marca da máquina).</p>
      ) : (
        <ul className="space-y-2">
          {lista.map((a) => (
            <li key={a.id}>
              <Link to={`/aparelhos/${a.id}`} className="card flex items-center gap-3" data-testid="item-aparelho">
                <div className="min-w-0 flex-1">
                  <p className="text-lg font-semibold">{a.nome}</p>
                  {a.observacoes && <p className="truncate text-sm text-neutral-400">{a.observacoes}</p>}
                </div>
                <ChevronRight size={22} className="shrink-0 text-neutral-500" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Page>
  );
}

/** /aparelhos/novo e /aparelhos/:id. */
export function AparelhoEditor() {
  const { id = 'novo' } = useParams();
  const [dados] = useAsync(async () => ({ a: id === 'novo' ? undefined : await equipmentRepository.get(id) }), [id]);
  if (!dados) return <Page title="Aparelho" voltar>Carregando…</Page>;
  if (id !== 'novo' && !dados.a) return <Page title="Aparelho" voltar><p className="card">Aparelho não encontrado.</p></Page>;
  return <FormAparelho key={id} a={dados.a} />;
}

function FormAparelho({ a }: { a?: Equipment }) {
  const navigate = useNavigate();
  const { confirmar, avisar } = useDialog();
  const [nome, setNome] = useState(a?.nome ?? '');
  const [obs, setObs] = useState(a?.observacoes ?? '');
  const [erro, setErro] = useState('');
  const [sujo, setSujo] = useState(false);
  const liberar = useAvisoNaoSalvo(sujo);
  const mexeu = (set: (v: string) => void) => (v: string) => {
    set(v);
    setSujo(true);
    setErro('');
  };

  const salvar = async () => {
    try {
      const d = { nome, observacoes: obs };
      if (a) await equipmentRepository.update(a.id, d);
      else await equipmentRepository.create(d);
      liberar();
      navigate(-1);
    } catch (e) {
      setErro(e instanceof ZodError ? e.issues[0]!.message : e instanceof Error ? e.message : 'Erro ao salvar');
    }
  };

  const excluir = async () => {
    if (!a || !(await confirmar('Excluir aparelho?', `"${a.nome}" sai da lista de aparelhos.`, 'Excluir aparelho', true))) return;
    try {
      await equipmentRepository.remove(a.id);
      liberar();
      navigate(-1);
    } catch (e) {
      if (e instanceof AparelhoEmUsoError) await avisar('Aparelho em uso', e.message);
      else throw e;
    }
  };

  return (
    <Page title={a ? 'Editar aparelho' : 'Novo aparelho'} voltar>
      <label className="block">
        <span className="text-lg font-semibold">Nome</span>
        <input className="input mt-2" value={nome} onChange={(e) => mexeu(setNome)(e.target.value)} />
      </label>
      <label className="block">
        <span className="text-lg font-semibold">Observações</span>
        <textarea className="input mt-2 min-h-24 py-3" value={obs} onChange={(e) => mexeu(setObs)(e.target.value)} />
      </label>
      {erro && <p role="alert" className="text-red-400">{erro}</p>}
      <button type="button" className="btn-primary w-full" onClick={() => void salvar()}>Salvar</button>
      {a && (
        <button type="button" className="btn w-full text-red-400" onClick={() => void excluir()}>
          <Trash2 size={22} /> Excluir aparelho
        </button>
      )}
    </Page>
  );
}
