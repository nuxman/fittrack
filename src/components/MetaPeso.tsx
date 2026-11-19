import { useState } from 'react';
import { useAsync } from '../useAsync';
import { settingsRepository } from '../db/repositories/settings';
import { lerMedida, LIMITES } from '../medidas';
import { num } from './CampoSerie';

/** Configurações → Meta de peso (opcional; vazio remove a meta). Aparece no bloco de peso do Início, sem julgamento. */
export function MetaPeso() {
  const [settings] = useAsync(settingsRepository.get);
  if (!settings) return null;
  return <Campo key={settings.updatedAt} inicial={settings.metaPesoKg != null ? num(settings.metaPesoKg) : ''} />;
}

function Campo({ inicial }: { inicial: string }) {
  const [texto, setTexto] = useState(inicial);
  const [msg, setMsg] = useState<{ erro: boolean; texto: string } | null>(null);
  const salvar = async () => {
    try {
      const meta = lerMedida(texto, 'Meta de peso (kg)', ...LIMITES.peso);
      await settingsRepository.update({ metaPesoKg: meta ?? undefined });
      setMsg({ erro: false, texto: meta === null ? 'Meta removida.' : 'Meta salva.' });
    } catch (e) {
      setMsg({ erro: true, texto: e instanceof Error ? e.message : 'Não foi possível salvar' });
    }
  };
  return (
    <section className="card space-y-2" aria-labelledby="meta-titulo">
      <h2 id="meta-titulo" className="text-lg font-semibold">Meta de peso</h2>
      <label className="block">
        <span className="mb-1 block text-sm text-neutral-300">Meta (kg), opcional</span>
        <input className="input" inputMode="decimal" value={texto} onChange={(e) => { setTexto(e.target.value); setMsg(null); }} />
      </label>
      <button type="button" className="btn-secondary w-full" onClick={() => void salvar()}>Salvar meta</button>
      {msg && <p role={msg.erro ? 'alert' : 'status'} className={msg.erro ? 'text-red-400' : 'text-neutral-300'}>{msg.texto}</p>}
    </section>
  );
}
