import { useEffect, useRef, useState } from 'react';
import { ajustarDescanso, formatarDuracao, restanteSeg } from '../sessao';
import { useAgora } from '../useAgora';
import { agendarBipes, audioSuspenso, cancelarBipes, prepararAudio, type OpcoesSom } from '../somDescanso';

const OPCOES = [45, 60, 90, 120, 180];

async function notificar() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  try {
    // No Android, só o service worker mostra notificação; sem ele (dev), tenta a API direta.
    const reg = await navigator.serviceWorker?.getRegistration();
    if (reg) await reg.showNotification('Descanso terminado', { body: 'Hora da próxima série.' });
    else new Notification('Descanso terminado', { body: 'Hora da próxima série.' });
  } catch {
    // Sem alerta garantido: Configurações → Alertas de descanso explica.
  }
}

interface ContagemProps {
  /** restTimerEndsAt salvo no banco: a contagem sobrevive a tela bloqueada e recarregamento. */
  endsAt: number | null;
  vibrar: boolean;
  /** Bipes do descanso; sem isso, não toca nada. */
  som?: OpcoesSom;
  desabilitado?: boolean;
  onDefinir: (endsAt: number | null) => void;
}

/**
 * Contagem do descanso em curso, com −15 s / Pular / +15 s. Não renderiza nada sem descanso ativo.
 * Vibra e notifica uma vez ao chegar a zero (só se o app estiver visível), depois limpa o descanso.
 */
export function ContagemDescanso({ endsAt, vibrar, som, desabilitado, onDefinir }: ContagemProps) {
  const agora = useAgora(250);
  const restante = restanteSeg(endsAt, agora);
  // endsAt que vimos contando: o alerta dispara uma vez, e não dispara se o descanso acabou com o app fechado.
  const contando = useRef<number | null>(null);

  // Bipes agendados no relógio do AudioContext; reagenda a cada mudança de endsAt (±15 s, Pular, pausa)
  // e ao voltar ao app; oculto ou ao sair da execução, cancela.
  const { som: ligado = false, avisoSeg = 0, contagem = false } = som ?? {};
  useEffect(() => {
    if (endsAt == null || !ligado) return;
    const agendar = () => agendarBipes(endsAt, { som: ligado, avisoSeg, contagem });
    const mudou = () => (document.visibilityState === 'visible' ? agendar() : cancelarBipes());
    agendar();
    document.addEventListener('visibilitychange', mudou);
    return () => {
      document.removeEventListener('visibilitychange', mudou);
      cancelarBipes();
    };
  }, [endsAt, ligado, avisoSeg, contagem]);

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

  if (endsAt == null || restante <= 0) return null;
  // Lido a cada render (useAgora re-renderiza a cada 250 ms).
  const semSom = ligado && audioSuspenso();
  return (
    <>
      {semSom && (
        <button
          type="button"
          className="w-full text-center text-sm font-semibold text-primary-400 underline"
          onClick={() => {
            prepararAudio();
            agendarBipes(endsAt, { som: ligado, avisoSeg, contagem });
          }}
        >
          Toque para ativar o som
        </button>
      )}
      <section aria-label="Cronômetro de descanso" className="flex items-center gap-2">
        <button type="button" className="btn-secondary px-3" disabled={desabilitado} onClick={() => onDefinir(ajustarDescanso(endsAt, Date.now(), -15))}>
          −15 s
        </button>
        <p className="flex-1 text-center text-5xl font-bold tabular-nums text-primary-400" data-testid="descanso">
          {formatarDuracao(restante)}
        </p>
        <button type="button" className="btn-secondary px-3" disabled={desabilitado} onClick={() => onDefinir(null)}>
          Pular
        </button>
        <button type="button" className="btn-secondary px-3" disabled={desabilitado} onClick={() => onDefinir(ajustarDescanso(endsAt, Date.now(), 15))}>
          +15 s
        </button>
      </section>
    </>
  );
}

interface FolhaProps {
  atualSeg: number;
  onEscolher: (seg: number) => void;
  onFechar: () => void;
}

/** Folha inferior para escolher o descanso do exercício: 45–180 s ou personalizado (5–600 s). */
export function FolhaDescanso({ atualSeg, onEscolher, onFechar }: FolhaProps) {
  const [personalizado, setPersonalizado] = useState('');
  const seg = Number(personalizado);
  const valido = personalizado.trim() !== '' && Number.isInteger(seg) && seg >= 5 && seg <= 600;
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/60" onClick={(e) => e.target === e.currentTarget && onFechar()}>
      <div role="dialog" aria-label="Tempo de descanso" className="safe-bottom w-full space-y-3 rounded-t-2xl bg-surface p-4">
        <h2 className="text-lg font-bold text-primary-400">Descanso deste exercício</h2>
        <p className="text-sm text-neutral-400">Vale só para este treino; a ficha não muda.</p>
        <div className="grid grid-cols-5 gap-2">
          {OPCOES.map((s) => (
            <button key={s} type="button" aria-pressed={s === atualSeg} className={`${s === atualSeg ? 'btn-primary' : 'btn-secondary'} px-0 text-base`} onClick={() => onEscolher(s)}>
              {s}s
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <input
            className="input"
            inputMode="numeric"
            aria-label="Descanso personalizado (segundos)"
            placeholder="Personalizado (5 a 600 s)"
            value={personalizado}
            onChange={(e) => setPersonalizado(e.target.value)}
          />
          <button type="button" className="btn-secondary shrink-0" disabled={!valido} onClick={() => onEscolher(seg)}>
            Usar
          </button>
        </div>
        <button type="button" className="btn w-full text-neutral-400" onClick={onFechar}>
          Cancelar
        </button>
      </div>
    </div>
  );
}
