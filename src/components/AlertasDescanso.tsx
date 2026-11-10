import { useState } from 'react';
import { Bell } from 'lucide-react';

const permissaoAtual = () => (typeof Notification === 'undefined' ? null : Notification.permission);

const TEXTO: Record<NotificationPermission, string> = {
  granted: 'Notificações permitidas.',
  denied: 'Notificações bloqueadas. Para permitir, altere nas configurações do site no navegador.',
  default: 'Notificações ainda não permitidas.',
};

/** Seção de Configurações: permissão de notificação e o que esperar do alerta de fim do descanso. */
export function AlertasDescanso() {
  const [permissao, setPermissao] = useState(permissaoAtual);
  return (
    <section className="card space-y-2" aria-labelledby="alertas-titulo">
      <h2 id="alertas-titulo" className="text-lg font-semibold">
        Alertas de descanso
      </h2>
      <p className="text-neutral-300">
        Ao fim do descanso, o app vibra e mostra uma notificação. Isso funciona com o app aberto. Com a tela bloqueada ou o app em segundo plano, o alerta não é garantido.
      </p>
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
