import { useState } from 'react';
import { Bell, Volume2 } from 'lucide-react';
import { useAsync } from '../useAsync';
import { settingsRepository } from '../db/repositories/settings';
import type { UserSettings } from '../db/types';
import { opcoesSom, testarSom } from '../somDescanso';

const permissaoAtual = () => (typeof Notification === 'undefined' ? null : Notification.permission);

const TEXTO: Record<NotificationPermission, string> = {
  granted: 'Notificações permitidas.',
  denied: 'Notificações bloqueadas. Para permitir, altere nas configurações do site no navegador.',
  default: 'Notificações ainda não permitidas.',
};

/** Seção de Configurações: permissão de notificação e o que esperar do alerta de fim do descanso. */
export function AlertasDescanso() {
  const [permissao, setPermissao] = useState(permissaoAtual);
  const [settings, recarregar] = useAsync(settingsRepository.get);
  const som = settings && opcoesSom(settings);
  const salvar = async (mudanca: Partial<UserSettings['interface']>) => {
    await settingsRepository.update({ interface: { ...settings!.interface, ...mudanca } });
    recarregar();
  };
  return (
    <section className="card space-y-2" aria-labelledby="alertas-titulo">
      <h2 id="alertas-titulo" className="text-lg font-semibold">
        Alertas de descanso
      </h2>
      <p className="text-neutral-300">
        Ao fim do descanso, o app toca bipes (dá para ouvir no fone), vibra e mostra uma notificação. Isso funciona com o app aberto e visível. Com a tela bloqueada ou outro app na frente, o alerta não é garantido.
      </p>
      {som && (
        <div className="space-y-3">
          <label className="flex min-h-11 items-center justify-between gap-3">
            Som
            <input type="checkbox" className="h-6 w-6 accent-primary-400" checked={som.som} onChange={(e) => void salvar({ somDescanso: e.target.checked })} />
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3">
            Aviso antecipado
            <select
              className="input w-auto"
              disabled={!som.som}
              value={som.avisoSeg}
              onChange={(e) => void salvar({ avisoAntecipadoSeg: Number(e.target.value) as 0 | 5 | 10 })}
            >
              <option value={0}>Desligado</option>
              <option value={5}>5 s antes</option>
              <option value={10}>10 s antes</option>
            </select>
          </label>
          <label className="flex min-h-11 items-center justify-between gap-3">
            Contagem 3-2-1
            <input
              type="checkbox"
              className="h-6 w-6 accent-primary-400"
              disabled={!som.som}
              checked={som.contagem}
              onChange={(e) => void salvar({ contagem321: e.target.checked })}
            />
          </label>
          <button type="button" className="btn-secondary w-full" onClick={testarSom}>
            <Volume2 size={20} /> Testar som
          </button>
        </div>
      )}
      <p className="text-neutral-300" data-testid="permissao-notificacao">
        {permissao === null ? 'Este navegador não oferece notificações.' : TEXTO[permissao]}
      </p>
      {permissao === 'default' && (
        <button type="button" className="btn-secondary w-full" onClick={async () => setPermissao(await Notification.requestPermission())}>
          <Bell size={20} /> Permitir notificações
        </button>
      )}
    </section>
  );
}
