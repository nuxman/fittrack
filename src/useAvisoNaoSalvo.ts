import { useCallback, useEffect, useRef } from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';
import { useDialog } from './components/ConfirmDialog';

/**
 * Alterações não salvas: bloqueia qualquer saída da tela (Voltar da página, navegação inferior,
 * voltar do navegador / gesto do Android) e pergunta no ConfirmDialog; recarregar ou fechar a aba
 * usa o aviso nativo do navegador (beforeunload).
 * `liberar()` antes de navegar depois de salvar, excluir ou de o usuário já ter escolhido descartar.
 */
export function useAvisoNaoSalvo(sujo: boolean) {
  const { escolher } = useDialog();
  const liberado = useRef(false);
  const sujoRef = useRef(sujo);
  sujoRef.current = sujo;

  const blocker = useBlocker(
    useCallback<BlockerFunction>(
      ({ currentLocation, nextLocation }) =>
        sujoRef.current && !liberado.current && currentLocation.pathname !== nextLocation.pathname,
      [],
    ),
  );

  // Um diálogo por bloqueio (o objeto blocker muda de identidade entre renders).
  const perguntando = useRef(false);
  useEffect(() => {
    if (blocker.state !== 'blocked' || perguntando.current) return;
    perguntando.current = true;
    void escolher({
      titulo: 'Alterações não salvas',
      mensagem: 'Sair sem salvar? As alterações desta tela serão perdidas.',
      opcoes: [{ label: 'Sair sem salvar', value: true, variante: 'perigo' }],
      cancelarLabel: 'Ficar',
    }).then((sair) => {
      perguntando.current = false;
      if (sair) {
        liberado.current = true;
        blocker.proceed();
      } else blocker.reset();
    });
  }, [blocker, escolher]);

  useEffect(() => {
    if (!sujo) return;
    const aviso = (e: BeforeUnloadEvent) => {
      if (liberado.current) return;
      e.preventDefault();
      e.returnValue = ''; // Chrome antigo exige returnValue
    };
    window.addEventListener('beforeunload', aviso);
    return () => window.removeEventListener('beforeunload', aviso);
  }, [sujo]);

  return useCallback(() => {
    liberado.current = true;
  }, []);
}
