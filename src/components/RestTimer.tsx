import { useEffect, useRef, useState } from 'react';
import { Bell } from 'lucide-react';
import { ajustarDescanso, formatarDuracao, restanteSeg } from '../sessao';
import { useAgora } from '../useAgora';

const OPCOES = [45, 60, 90, 120, 180];

interface Props {
  /** restTimerEndsAt salvo no banco: a contagem sobrevive a tela bloqueada e recarregamento. */
  endsAt: number | null;
  desabilitado?: boolean;
  vibrar: boolean;
  onDefinir: (endsAt: number | null) => void;
}

async function notificar() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // No Android, só o service worker mostra notificação; sem ele (dev), tenta a API direta.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification('Descanso terminado', { body: 'Hora da próxima série.' });
    else new Notification('Descanso terminado', { body: 'Hora da próxima série.' });
  } catch {
    // Sem alerta garantido: o aviso na tela já explica.
  }
}

export function RestTimer({ endsAt, desabilitado, vibrar, onDefinir }: Props) {
  const agora = useAgora(250);
  const restante = restanteSeg(endsAt, agora);
  const [personalizado, setPersonalizado] = useState('');
  const [permissao, setPermissao] = useState(() => (typeof Notification === 'undefined' ? null : Notification.permission));
  // endsAt que vimos contando: o alerta dispara uma vez, e não dispara se o descanso acabou com o app fechado.
  const contando = useRef<number | null>(null);

  useEffect(() => {
    if (endsAt == null) return;
    if (restante > 0) {
      contando.current = endsAt;
      return;
    }
    if (contando.current !== endsAt) return;
    contando.current = null;
    if (vibrar && document.visibilityState === 'visible') navigator.vibrate?.([300, 150, 300]);
    void notificar();
    onDefinir(null);
  }, [restante, endsAt, vibrar, onDefinir]);

  const iniciar = (seg: number) => onDefinir(Date.now() + seg * 1000);
  const seg = Number(personalizado);
  const personalizadoValido = Number.isInteger(seg) && seg >= 5 && seg <= 600;

  return (
    <section className="card space-y-3" aria-label="Cronômetro de descanso">
      <p className="text-sm font-semibold uppercase text-neutral-400">Descanso</p>
      <p className="text-center text-6xl font-bold tabular-nums text-primary-400" data-testid="descanso">
        {endsAt == null ? '—' : formatarDuracao(restante)}
      </p>
      <div className="grid grid-cols-3 gap-2">
        <button type="button" className="btn-secondary" disabled={desabilitado || endsAt == null} onClick={() => onDefinir(ajustarDescanso(endsAt, Date.now(), -15))}>
          −15 s
        </button>
        <button type="button" className="btn-secondary" disabled={desabilitado || endsAt == null} onClick={() => onDefinir(null)}>
          Pular
        </button>
        <button type="button" className="btn-secondary" disabled={desabilitado} onClick={() => onDefinir(ajustarDescanso(endsAt, Date.now(), 15))}>
          +15 s
        </button>
      </div>
      <div className="grid grid-cols-5 gap-2">
        {OPCOES.map((s) => (
          <button key={s} type="button" className="btn-secondary px-0 text-base" disabled={desabilitado} onClick={() => iniciar(s)}>
            {s}s
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          className="input"
          inputMode="numeric"
          aria-label="Descanso personalizado (segundos)"
          placeholder="Personalizado (s)"
          value={personalizado}
          onChange={(e) => setPersonalizado(e.target.value)}
        />
        <button type="button" className="btn-secondary shrink-0" disabled={desabilitado || !personalizadoValido} onClick={() => iniciar(seg)}>
          Iniciar
        </button>
      </div>
      {permissao === 'default' && (
        <button
          type="button"
          className="btn-secondary w-full"
          onClick={async () => setPermissao(await Notification.requestPermission())}
        >
          <Bell size={20} /> Permitir notificações
        </button>
      )}
      <p className="text-sm text-neutral-400">
        Vibração e notificação funcionam com o app aberto. Com a tela bloqueada ou o app em segundo plano, o alerta não é garantido.
      </p>
    </section>
  );
}
