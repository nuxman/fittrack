# FitTrack — Especificação do projeto

## Regras de trabalho
- Implementar UMA etapa por vez, somente a que eu pedir. Não antecipar etapas futuras.
- Ambiente: Windows, PowerShell 7. Não usar comandos interativos (nada que peça confirmação no terminal); criar a estrutura do projeto com arquivos e comandos não interativos.
- Antes de dizer que uma etapa terminou: rodar tsc --noEmit, lint e testes, e corrigir até passar.
- Ao terminar cada etapa: fazer commit local com a mensagem "Etapa N: <resumo>" e listar arquivos criados, como testar manualmente e o que ficou pendente.
- Código real e funcional, sem placeholders de lógica. Sem credenciais no repositório.
- Comandos que eu precisar rodar manualmente: PowerShell 7, cada um em uma única linha.

## Stack (versões fixas)
React 18 + TypeScript 5 (strict), Vite 5, Tailwind CSS 3.4, Lucide React, Dexie 4, Recharts 2, vite-plugin-pwa 0.20, React Router 6 com HashRouter, Zod, Vitest + fake-indexeddb + @testing-library/react, ESLint.
Sem servidor, sem APIs externas, nenhuma imagem ou vídeo carregado da internet dentro do app.

## Decisões fechadas (não reinterpretar)
- Roteamento: HashRouter.
- Base do Vite: '/fittrack/'. Manifest com start_url e scope '/fittrack/'.
- Todo registro tem: id (crypto.randomUUID), createdAt, updatedAt, deletedAt (soft delete). Acesso ao Dexie somente via src/db/repositories (um por entidade); componentes nunca acessam o Dexie diretamente. Não criar camada de abstração para Supabase.
- deletedAt não é indexado (IndexedDB ignora null em índices); repositories filtram `deletedAt === null` em memória.
- Seed da ficha inicial via `db.on('populate')` (roda uma única vez, na criação do banco).
- Ao abrir o app, chamar navigator.storage.persist() e mostrar em Configurações se o armazenamento é persistente.
- Interface em português brasileiro, tema escuro padrão, cor principal amarelo/dourado, mobile-first (Samsung Galaxy S24 Ultra), botões grandes, navegação inferior: Início, Treinar, Histórico, Evolução, Configurações.

## Modelos de dados
- Equipment: nome, observacoes.
- Exercise: nome, tipo ('carga' | 'peso_corporal' | 'tempo'), unidadeCarga ('kg' | 'placa'), equipmentId opcional, grupoPrincipal (string, um único valor), gruposSecundarios (string[]), porLado (boolean), videoUrl opcional (validar com Zod: apenas https://, qualquer domínio; seed sem links).
- ExerciseImage: exerciseId, blob, mimeType, largura, altura. No máximo uma por exercício (substituir ao adicionar nova).
- WorkoutPlan: nome, diaSemana (0–6), itens: [{ exerciseId, series, repsMin, repsMax, descansoSeg, ordem }].
- WorkoutSession: planId, planSnapshot (cópia completa do plano no início da sessão; editar a ficha nunca altera sessões passadas), status ('em_andamento' | 'pausada' | 'concluida' | 'abandonada'), iniciadaEm, finalizadaEm, duracaoAtivaSeg, rpe (0–10), observacoes, restTimerEndsAt (timestamp ou null).
- ExerciseSet: sessionId, exerciseId, numeroSerie, carga (null para peso corporal), reps, lado ('esq' | 'dir' | null), concluidaEm. Salvar cada série no banco imediatamente ao concluir.
- CardioSession: modalidade ('esteira' | 'bicicleta' | 'caminhada'), duracaoMin, velocidadeKmh, inclinacaoNivel (número + rótulo livre; "nível 7" NÃO equivale a 7%), distanciaKm, fcMedia opcional, rpe, observacoes, data.
- BodyMeasurement: data, pesoKg, cinturaCm, observacoes.
- BodyPhoto: measurementId, blob (tabela separada).
- RestDay: data, observacoes.
- UserSettings: descansoPadraoSeg, metaPesoKg opcional, cardioPadrao, preferências de interface.
Schema Dexie versionado desde a versão 1.

## Regras de negócio
- Exercícios com o mesmo nome em dias diferentes usam o MESMO Exercise (histórico compartilhado). "Remada com apoio no peito" é um único exercício. Comparação de nomes: trim, espaços colapsados, sem diferenciar maiúsculas nem acentos.
- Carga sugerida = última carga e reps registradas para aquele exercício. Nunca sugerir aumento automático.
- Volume = soma(carga × reps) apenas para tipo 'carga' com unidade 'kg'. Exercícios em 'placa' mostram progressão de placa, sem volume em kg. Peso corporal: total de reps.
- Recordes pessoais: maior carga e maior volume por exercício, separados por unidade.
- Aviso informativo (nunca bloqueante): mesmo grupo muscular em dias consecutivos com RPE da sessão ≥ 8. Considera APENAS o grupoPrincipal dos exercícios (gruposSecundarios são ignorados).
- Consistência: treinos por semana em relação ao planejado. Nada de sequências ("streaks") que incentivem treinar sem descanso.
- Sem diagnóstico médico. Exibir orientação para não prender a respiração e lista de sintomas para interromper o treino (dor no peito, tontura, falta de ar desproporcional, dor articular aguda).
- Imagem do exercício: galeria ou câmera (input accept="image/*"). Antes de salvar, redimensionar via canvas para no máximo 1024 px no maior lado, WebP qualidade 0.8 (fallback JPEG). Nunca salvar o arquivo original.

## Cronômetro de descanso
- Opções: 45, 60, 90, 120, 180 s e personalizado; botões -15 s e +15 s.
- Contagem calculada a partir de restTimerEndsAt salvo no banco (sobrevive a tela bloqueada e recarregamento).
- Wake Lock API ativa durante a sessão (reativar ao voltar para o app).
- Vibração e notificação somente se o app estiver visível ou o navegador permitir; a interface deve deixar claro que não há alerta garantido em segundo plano.

## Tela de execução
Nome do exercício; foto do exercício se houver (toque para ampliar em tela cheia), senão ícone genérico por grupo muscular; botão "Ver execução" visível só quando houver videoUrl, abrindo com target="_blank" e rel="noopener noreferrer", sem player embutido (se navigator.onLine for false, avisar que o vídeo precisa de internet); séries/reps planejadas; última carga; campos de carga e reps; "Concluir série"; cronômetro de descanso grande; cronômetro total; progresso; pausar/abandonar/retomar (sessão 'em_andamento' ou 'pausada' é retomada automaticamente ao abrir o app); "Finalizar treino" com RPE e observações.

## Ficha inicial (seed, totalmente editável)
Segunda — Peito e tríceps: Supino máquina 3×10–12; Supino inclinado articulado 3×10–12; Crucifixo máquina 2×12–15; Tríceps polia barra reta 3×10–15; Tríceps corda 2×12–15.
Terça — Pernas A e abdômen: Leg press 3×10–12; Cadeira extensora 3×12–15; Cadeira flexora 3×10–15; Panturrilha máquina 3×12–15; Abdominal máquina 2×12–15.
Quarta — Costas e bíceps: Puxada frontal 3×10–12; Remada baixa 3×10–12; Remada com apoio no peito 2×12; Rosca martelo 3×10–12; Rosca barra W 2×12.
Quinta — Ombros e core: Desenvolvimento máquina 3×10–12; Elevação lateral 3×12–15; Crucifixo inverso 3×12–15; Bird dog 2×10 por lado (peso corporal); Dead bug 2×10 por lado (peso corporal).
Sexta — Pernas B e corpo inteiro: Cadeira flexora 3×10–12; Leg press 3×12; Cadeira abdutora 2×12–15; Supino máquina 2×12; Remada com apoio no peito 2×12.
Cardio padrão: esteira, 15 min, inclinação "nível 7".

## Backup
- Exportar JSON com schemaVersion; importar com validação Zod, pré-visualização dos totais e confirmação antes de substituir.
- Imagens de exercício ENTRAM no JSON em base64. Fotos corporais NÃO entram; avisar isso explicitamente.
- Exportar CSV de séries e de medidas.
- Aviso permanente em Configurações: dados locais se perdem ao limpar o navegador ou trocar de aparelho sem backup.

## Etapas e critérios de aceite
1. Estrutura, design system, banco e repositórios. Aceite: testes de CRUD e soft delete passando com fake-indexeddb; seed carrega a ficha; app abre com a navegação inferior.
2. Ficha editável. Aceite: criar, editar, reordenar e excluir exercícios e dias; adicionar, trocar e remover foto e link de cada exercício; foto salva com no máximo 1024 px; sessões antigas inalteradas após editar.
3. Execução do treino e cronômetro. Aceite: fechar o app no meio da sessão e reabrir retoma na série certa; testes do cronômetro com fake timers.
4. Histórico, recordes e gráficos. Aceite: testes de cálculo de volume, incluindo peso corporal e placa.
5. Cardio, medidas e fotos corporais.
6. Backup e restauração. Aceite: exportar, apagar banco, importar, dados idênticos (incluindo imagens de exercício).
7. PWA e offline. Aceite: instala no Chrome Android, abre offline, ícones 192 e 512.
8. Publicação. Workflow .github/workflows/deploy.yml: npm ci → tsc --noEmit → lint → vitest run → build → deploy no GitHub Pages. README com instalação no S24 Ultra. Comandos PowerShell 7 em linha única para criar o repositório "fittrack" com gh CLI, commit e push, mais o passo manual: Settings → Pages → Source: GitHub Actions. URL final: https://nuxman.github.io/fittrack/
