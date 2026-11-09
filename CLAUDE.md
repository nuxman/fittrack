# FitTrack — Especificação do projeto

## Regras de trabalho
- Implementar UMA etapa por vez, somente a que eu pedir. Não antecipar etapas futuras.
- Ambiente: Windows, PowerShell 7. Não usar comandos interativos (nada que peça confirmação no terminal); criar a estrutura do projeto com arquivos e comandos não interativos.
- Antes de dizer que uma etapa terminou: rodar tsc --noEmit, lint e testes, e corrigir até passar.
- Ao terminar cada etapa: commit local "Etapa N: <resumo>" e listar arquivos criados, como testar manualmente e o que ficou pendente.
- Código real e funcional, sem placeholders de lógica. Sem credenciais no repositório.
- Decisões fora desta spec: perguntar antes ou listar explicitamente no relatório.
- Comandos que eu precisar rodar manualmente: PowerShell 7, cada um em uma única linha.
- Nunca encerrar processos por nome (taskkill /IM, pkill, killall ou similar); só pelo PID de processos que você mesmo iniciou.
- Evitar capturas de tela e leitura de imagens; usar só quando indispensável, porque elas acumulam e travam a sessão.

## Stack (versões fixas)
React 18 + TypeScript 5 (strict), Vite 5, Tailwind CSS 3.4, Lucide React, Dexie 4, Recharts 2, vite-plugin-pwa 0.20, React Router 6 com HashRouter, Zod, Vitest + fake-indexeddb + @testing-library/react, ESLint.
Sem servidor, sem APIs externas, nenhuma imagem ou vídeo carregado da internet dentro do app.

## Decisões fechadas (não reinterpretar)
- Roteamento: HashRouter.
- Base do Vite: '/fittrack/'. Manifest com start_url e scope '/fittrack/'.
- Todo registro tem: id (crypto.randomUUID), createdAt, updatedAt, deletedAt (soft delete). Acesso ao Dexie somente via src/db/repositories (um por entidade); componentes nunca acessam o Dexie diretamente. Não criar camada de abstração para Supabase.
- Soft delete filtrado com filter() (deletedAt === null), sem índice em deletedAt, porque o IndexedDB não indexa null. list, get, update e remove ignoram registros excluídos.
- Seed via db.on('populate'): roda uma única vez, na criação do banco.
- Nomes de exercício normalizados (trim, espaços repetidos, sem diferenciar maiúsculas e acentos); um único Exercise por nome normalizado.
- Ao abrir o app, chamar navigator.storage.persist() e mostrar em Configurações se o armazenamento é persistente.
- Interface em português brasileiro, tema escuro padrão, cor principal amarelo/dourado, mobile-first (Samsung Galaxy S24 Ultra), botões grandes, navegação inferior: Início, Treinar, Histórico, Evolução, Configurações.
- Semana = segunda a domingo em todo o app.
- Grupos musculares: lista fixa em union type (GrupoMuscular): peito, costas, ombros, bíceps, tríceps, antebraço, quadríceps, posterior de coxa, glúteos, adutores, panturrilha, abdômen, core, lombar. Nada de strings soltas.
- Confirmações e escolhas usam o componente ConfirmDialog do app (com suporte a múltiplas opções). Nunca window.confirm/alert/prompt.
- Campos novos: opcionais podem ser adicionados sem migração e devem ser lidos com valor padrão (ex.: exerciciosPulados ?? []). Campo novo obrigatório ou índice novo exige nova versão do schema com upgrade() preenchendo os registros existentes, e teste da migração.

## Modelos de dados
- Equipment: nome, observacoes.
- Exercise: nome, tipo ('carga' | 'peso_corporal' | 'tempo'), unidadeCarga ('kg' | 'placa'), equipmentId opcional, grupoPrincipal (string, um único valor), gruposSecundarios (string[]), porLado (boolean), videoUrl opcional (Zod: apenas https://, qualquer domínio; seed sem links), anotacoes opcional (texto livre).
- ExerciseImage: exerciseId, blob, mimeType, largura, altura. No máximo uma por exercício (substituir ao adicionar nova). Imagem substituída ou removida: soft delete e blob esvaziado (libera espaço).
- WorkoutPlan: nome, diaSemana (0–6), itens: [{ exerciseId, series, repsMin, repsMax, descansoSeg, ordem }].
- WorkoutSession: planId, planSnapshot (cópia completa do plano no início; cada item guarda também nome, tipo, unidadeCarga, grupoPrincipal e porLado do exercício naquele momento, para o histórico sobreviver a renomear ou excluir o exercício; editar a ficha nunca altera sessões passadas), status ('em_andamento' | 'pausada' | 'concluida' | 'abandonada'), iniciadaEm, finalizadaEm, duracaoAtivaSeg, rpe (0–10), observacoes, restTimerEndsAt (timestamp ou null), exerciciosPulados (exerciseId[], opcional: ler com ?? []), ativaDesde (timestamp da última retomada, opcional), pausadaEm (timestamp da pausa atual, opcional). Tempo ativo = duracaoAtivaSeg + (agora − ativaDesde) enquanto 'em_andamento'.
- ExerciseSet: sessionId, exerciseId, numeroSerie, carga (null para peso corporal), reps, lado ('esq' | 'dir' | null), concluidaEm. Salvar cada série imediatamente ao concluir.
- Exercício porLado: um único campo "reps por lado" e um único registro com lado null. Total de reps da série = reps × 2.
- CardioSession: modalidade ('esteira' | 'bicicleta' | 'caminhada'), duracaoMin, velocidadeKmh, inclinacaoNivel (número + rótulo livre; "nível 7" NÃO equivale a 7%), distanciaKm, fcMedia opcional, rpe, observacoes, data.
- BodyMeasurement: data, pesoKg, cinturaCm, observacoes.
- BodyPhoto: measurementId, blob (tabela separada).
- RestDay: data, observacoes.
- UserSettings: descansoPadraoSeg, metaPesoKg opcional, cardioPadrao, preferências de interface.
Schema Dexie versionado desde a versão 1.

## Regras de negócio
- Exercícios com o mesmo nome em dias diferentes usam o MESMO Exercise. "Remada com apoio no peito" é um único exercício.
- Carga sugerida = última carga e reps registradas para aquele exercício. Nunca sugerir aumento automático. A carga nunca é editada na ficha; é registrada por série.
- Volume = soma(carga × reps) apenas para tipo 'carga' com unidade 'kg'. 'placa' mostra progressão de placa, sem volume em kg. Peso corporal: total de reps.
- Recordes pessoais: maior carga e maior volume por exercício, separados por unidade.
- Aviso informativo (nunca bloqueante): mesmo grupoPrincipal em dias consecutivos com RPE da sessão ≥ 8. Grupos secundários não contam. Entra na Etapa 3b.
- Consistência: treinos por semana em relação ao planejado. Proibido: contagem acumulada de semanas, ícone de fogo ou qualquer sequência ("streak").
- Sem diagnóstico médico. Orientação para não prender a respiração e lista de sintomas para interromper o treino (dor no peito, tontura, falta de ar desproporcional, dor articular aguda).
- Imagem do exercício: galeria ou câmera (input accept="image/*"). Redimensionar via canvas para no máximo 1024 px no maior lado, WebP qualidade 0.8 (fallback JPEG). Nunca salvar o original.
- Sem recursos sociais, QR code ou renovação de ficha.
- Cada ficha tem exatamente um diaSemana e não pode haver duas fichas no mesmo dia. Mover uma ficha para um dia ocupado troca as duas de dia, com confirmação.
- Reordenar exercícios com botões subir/descer. Sem arrastar e soltar e sem bibliotecas novas.
- Exercício usado em alguma ficha não pode ser excluído (mostrar em quais fichas). Criar exercício cujo nome normalizado bate com um excluído oferece "Restaurar 'X'" em vez de criar outro.
- Limites da ficha: séries 1–10; reps 1–100 com repsMin ≤ repsMax; descanso 0–600 s; nome obrigatório. Para tipo 'tempo', repsMin/repsMax são segundos (1–600).

## Regra de sugestão
- Ficha "feita" na semana = existe WorkoutSession 'concluida' daquela ficha nesta semana, em qualquer dia. Sessões abandonadas não contam.
- Pendentes = fichas com diaSemana anterior a hoje, nesta semana, ainda não feitas.
- Sugerido = a pendente mais antiga; sem pendentes, a ficha do dia de hoje (se ainda não feita).
- O motivo aparece junto: "Treino de hoje" ou "Pendente de <dia>". Quando o sugerido for pendente, mostrar também a ficha de hoje como segunda opção.
- Sábado e domingo: pendentes aparecem como "opcional"; sem pendentes, "Dia de descanso".
- Pendências não passam para a semana seguinte. Registrar RestDay não altera pendências.

## Tela Início (dashboard)
De cima para baixo:
1. Saudação curta e data de hoje.
2. Faixa da semana S T Q Q S S D (começando na segunda) com o número do dia; check dourado nos dias com treino concluído ou cardio; ícone diferente para RestDay; "Hoje" destacado. Ao lado: "X de Y treinos esta semana" (Y = número de fichas).
3. Card do treino sugerido (conforme "Regra de sugestão"): nome, motivo, número de exercícios, duração estimada (média das últimas 3 sessões concluídas da ficha; sem histórico, séries × 40 s + descansos planejados), botão grande "Iniciar treino". Com sessão 'em_andamento' ou 'pausada': "Retomar treino" no lugar.
4. Resumo da semana: minutos de musculação e de cardio.
5. Peso atual e variação em relação à medição de cerca de 7 dias antes (estado vazio com "Registrar peso").
6. Último treino: data, ficha, duração e volume.

## Aba Treinar (escolha de treino)
- Todas as fichas em cards: nome, grupos principais, número de exercícios, duração estimada.
- Card "Sugerido" conforme a regra. Qualquer ficha pode ser iniciada em qualquer dia.
- Acesso a "Editar ficha" a partir do card.

## Visão geral da sessão
Lista dos exercícios da sessão: foto (ou ícone do grupo principal), nome, "séries× repsMin a repsMax | última carga", status (pendente, parcial "2/3", concluído, pulado). Status calculado pelas séries registradas, NUNCA marcado à mão. Tocar abre a tela de execução. Botão "Pular" registra em exerciciosPulados. Progresso geral do treino (X de Y exercícios concluídos). Botão fixo "Finalizar treino" no rodapé. Card recolhível "Durante o treino": não prender a respiração e sintomas para parar.

## Tela de execução e detalhe do exercício
Foto grande (toque para ampliar em tela cheia) ou ícone genérico pelo grupo principal; nome; botão "Ver execução" só com videoUrl, abrindo com target="_blank" e rel="noopener noreferrer", sem player embutido (offline: avisar que precisa de internet); séries/reps planejadas; última carga; campos de carga e reps; "Concluir série"; indicador de séries (1, 2, 3); cronômetro de descanso grande; cronômetro total; progresso geral do treino (X de Y exercícios concluídos); pausar/abandonar/retomar (sessão 'em_andamento' ou 'pausada' retomada ao abrir o app); "Finalizar treino" com RPE e observações; botão "Desfazer última série" (soft delete); uma linha fixa de alerta de sintomas para parar o treino.
Seções recolhíveis: Evolução de carga (mini gráfico, Etapa 4); Minhas anotações (Exercise.anotacoes, editável a qualquer momento); Grupos trabalhados (texto, sem diagrama do corpo).

## Pausa
Pausar congela o tempo ativo e zera o descanso em curso (restTimerEndsAt = null).

## Sessão esquecida
Ao abrir o app, se a sessão ativa ('em_andamento' ou 'pausada') tiver a última atividade (série registrada ou retomada) há mais de 3 horas, perguntar: "Finalizar no horário da última série", "Retomar" ou "Abandonar". Em "Finalizar no horário da última série", finalizadaEm e a duração terminam na última série.

## Campos da série
- Carga com inputMode="decimal" (não type="number"), aceitando vírgula e ponto. Botões grandes − e + ao lado da carga (passo 0,5 em kg, 1 em placa) e das reps (passo 1).
- "Concluir série" fica desabilitado enquanto grava (sem registro duplo com toque duplo).

## Mudanças durante a sessão
- Alterar séries, reps ou descanso durante a sessão muda SOMENTE o planSnapshot daquela sessão.
- "Substituir exercício": troca por outro cadastrado ou por um novo criado na hora, só para a sessão.
- Ao finalizar, se houve mudanças, listar e perguntar "Aplicar também na ficha?", com escolha por mudança.

## Cronômetro de descanso
- Opções: 45, 60, 90, 120, 180 s e personalizado; botões -15 s e +15 s.
- Contagem a partir de restTimerEndsAt salvo no banco (sobrevive a tela bloqueada e recarregamento).
- Wake Lock API ativa durante a sessão (reativar ao voltar ao app).
- Vibração e notificação só se o app estiver visível ou o navegador permitir; deixar claro que não há alerta garantido em segundo plano.
- Botão "Permitir notificações" dentro do cronômetro, só enquanto a permissão não foi decidida (Notification.permission === 'default').

## Ficha inicial (seed, totalmente editável)
Segunda — Peito e tríceps: Supino máquina 3×10–12; Supino inclinado articulado 3×10–12; Crucifixo máquina 2×12–15; Tríceps polia barra reta 3×10–15; Tríceps corda 2×12–15.
Terça — Pernas A e abdômen: Leg press 3×10–12; Cadeira extensora 3×12–15; Cadeira flexora 3×10–15; Panturrilha máquina 3×12–15; Abdominal máquina 2×12–15.
Quarta — Costas e bíceps: Puxada frontal 3×10–12; Remada baixa 3×10–12; Remada com apoio no peito 2×12; Rosca martelo 3×10–12; Rosca barra W 2×12.
Quinta — Ombros e core: Desenvolvimento máquina 3×10–12; Elevação lateral 3×12–15; Crucifixo inverso 3×12–15; Bird dog 2×10 por lado (peso corporal); Dead bug 2×10 por lado (peso corporal).
Sexta — Pernas B e corpo inteiro: Cadeira flexora 3×10–12; Leg press 3×12; Cadeira abdutora 2×12–15; Supino máquina 2×12; Remada com apoio no peito 2×12.
Grupos principais conforme a tabela aprovada na Etapa 1.1 (Crucifixo inverso = ombros).
Cardio padrão: esteira, 15 min, inclinação "nível 7".

## Backup
- JSON com schemaVersion; importação com validação Zod, pré-visualização dos totais e confirmação antes de substituir.
- Imagens de exercício ENTRAM no JSON em base64. Fotos corporais NÃO entram; avisar explicitamente.
- CSV de séries e de medidas.
- Aviso permanente em Configurações: dados locais se perdem ao limpar o navegador ou trocar de aparelho sem backup.

## Pendências
- Aviso de alterações não salvas nos editores de ficha e de exercício (botão Voltar e navegação inferior) — entra na Etapa 3b, junto com a revisão da aba Treinar.
- Tela de Equipment (cadastro e vínculo opcional ao exercício) — entra na Etapa 5.
- Editar séries antigas — entra na Etapa 4, no Histórico.

## Etapas e critérios de aceite
1. CONCLUÍDA (inclui 1.1 e 1.2).
2. CONCLUÍDA (inclui 2.1). Ficha editável. Aceite: criar, editar, reordenar e excluir exercícios e dias; adicionar, trocar e remover foto, link e anotações de cada exercício; foto salva com no máximo 1024 px; sessões antigas inalteradas após editar.
3a. Execução: botão "Iniciar" como ação primária (amarela) em cada card da aba Treinar, com "Nova ficha" como botão secundário no fim da lista; visão geral da sessão; tela de execução; cronômetro; Wake Lock; pular exercício; pausar/abandonar/retomar; finalizar com RPE. Aceite: fechar o app no meio e reabrir retoma na série certa; testes do cronômetro com fake timers.
3b. Planejamento: regra de sugestão, aba Treinar completa, aviso informativo de mesmo grupoPrincipal em dias consecutivos com RPE ≥ 8, mudanças durante a sessão com "Aplicar também na ficha?", dashboard (cardio e peso com estado vazio até a Etapa 5). Aceite: testes da regra de sugestão: semana sem faltas, falta na terça com sugestão na quarta, duas faltas, treino de sexta feito adiantado, virada de semana zerando pendências, sessão abandonada não contando.
4. Histórico, recordes, gráficos e mini gráfico no detalhe do exercício. Aceite: testes de volume, incluindo peso corporal e placa.
5. Cardio, medidas e fotos corporais.
6. Backup e restauração. Aceite: exportar, apagar banco, importar, dados idênticos (incluindo imagens de exercício).
7. PWA e offline. Aceite: instala no Chrome Android, abre offline, ícones 192 e 512; conferir "Armazenamento persistente" em Configurações com o app instalado no celular.
8. Publicação: CI/deploy ANTECIPADO na Etapa 3a.1 (.github/workflows/deploy.yml: npm ci → tsc --noEmit → lint → vitest run → build → deploy no GitHub Pages, disparado por push no branch master). Repositório público "fittrack" criado pelo usuário com gh CLI; passo manual: Settings → Pages → Source: GitHub Actions. URL final: https://nuxman.github.io/fittrack/. Na Etapa 8 restam só: README com instalação no S24 Ultra e revisão do workflow.
