import { useState } from 'react';
import { Plus } from 'lucide-react';
import { ZodError } from 'zod';
import { CORES_APARELHO, type CorAparelho, type Equipment, type GrupoMuscular } from '../db/types';
import { corSugerida, equipmentRepository, NOME_COR, textoEtiqueta } from '../db/repositories/equipment';
import { useAsync } from '../useAsync';

const HEX: Record<CorAparelho, string> = { azul: '#3b82f6', laranja: '#f97316', verde: '#22c55e', vermelho: '#ef4444' };

/** Etiqueta "● Azul 12": bolinha na cor + nome da cor + número. */
export function Etiqueta({ aparelho, className = '' }: { aparelho: Pick<Equipment, 'nome' | 'cor' | 'numero'>; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap text-sm text-neutral-200 ${className}`} data-testid="etiqueta-aparelho">
      {aparelho.cor && <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: HEX[aparelho.cor] }} />}
      {textoEtiqueta(aparelho)}
    </span>
  );
}

/**
 * Escolher um aparelho existente ou criar um novo (nome, cor, número, observações). A cor do novo vem
 * sugerida pelo grupo principal do exercício. `onEscolher(null)` = sem aparelho.
 */
export function DialogoAparelho({ grupo, atualId, onEscolher, onFechar }: {
  grupo?: GrupoMuscular;
  atualId?: string;
  onEscolher: (a: Equipment | null) => void;
  onFechar: () => void;
}) {
  const [lista] = useAsync(() => equipmentRepository.list());
  const [criando, setCriando] = useState(false);
  const [nome, setNome] = useState('');
  const [cor, setCor] = useState<CorAparelho | undefined>(grupo && corSugerida(grupo));
  const [numero, setNumero] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState('');

  const criar = async () => {
    try {
      onEscolher(await equipmentRepository.create({ nome, observacoes: obs, cor, numero }));
    } catch (e) {
      setErro(e instanceof ZodError ? e.issues[0]!.message : 'Não foi possível criar o aparelho');
    }
  };

  return (
    <div className="fixed inset-0 z-30 overflow-y-auto bg-surface-base p-4 pb-8 pt-[calc(1rem+var(--sat))]" role="dialog" aria-label="Aparelho">
      <div className="mx-auto max-w-xl space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-xl font-bold text-primary-400">{criando ? 'Novo aparelho' : 'Aparelho'}</h2>
          <button type="button" className="btn text-neutral-300" onClick={onFechar}>Fechar</button>
        </div>
        {criando ? (
          <div className="space-y-3">
            <label className="block">
              <span className="text-lg font-semibold">Nome</span>
              <input autoFocus className="input mt-2" value={nome} onChange={(e) => { setNome(e.target.value); setErro(''); }} />
            </label>
            <fieldset>
              <legend className="text-lg font-semibold">Cor</legend>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {[...CORES_APARELHO, undefined].map((c) => (
                  <button key={c ?? 'sem'} type="button" aria-pressed={cor === c} className={`${cor === c ? 'btn-primary' : 'btn-secondary'} px-2`} onClick={() => setCor(c)}>
                    {c && <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: HEX[c] }} />}
                    {c ? NOME_COR[c] : 'Sem cor'}
                  </button>
                ))}
              </div>
            </fieldset>
            <label className="block">
              <span className="text-lg font-semibold">Número</span>
              <input className="input mt-2" value={numero} maxLength={10} placeholder="Ex.: 12" onChange={(e) => setNumero(e.target.value)} />
            </label>
            <label className="block">
              <span className="text-lg font-semibold">Observações</span>
              <input className="input mt-2" value={obs} onChange={(e) => setObs(e.target.value)} />
            </label>
            {erro && <p role="alert" className="text-red-400">{erro}</p>}
            <button type="button" className="btn-primary w-full" onClick={() => void criar()}>Criar e usar</button>
            <button type="button" className="btn w-full text-neutral-300" onClick={() => setCriando(false)}>Voltar à lista</button>
          </div>
        ) : (
          <>
            <button type="button" className="btn-secondary w-full" onClick={() => setCriando(true)}>
              <Plus size={22} /> Novo aparelho
            </button>
            <ul className="space-y-2">
              {lista?.map((a) => (
                <li key={a.id}>
                  <button type="button" className={`card w-full text-left ${a.id === atualId ? 'ring-2 ring-primary-400' : ''}`} onClick={() => onEscolher(a)}>
                    <span className="block text-lg">{a.nome}</span>
                    {(a.cor || a.numero) && <Etiqueta aparelho={a} />}
                  </button>
                </li>
              ))}
            </ul>
            {atualId && (
              <button type="button" className="btn w-full text-neutral-300" onClick={() => onEscolher(null)}>Sem aparelho</button>
            )}
          </>
        )}
      </div>
    </div>
  );
}
