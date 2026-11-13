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
- Versão (package.json, mostrada em Configurações): a cada etapa concluída, subir para 0.<etapa>.0; a cada correção, subir o último número. Subir a versão só quando o código do app muda; commits só de CI, documentação ou CLAUDE.md não sobem a versão.
- Evitar capturas de tela e leitura de imagens; usar só quando indispensável, porque elas acumulam e travam a sessão.

## Stack (versões fixas)
React 18 + TypeScript 5 (strict), Vite 5, Tailwind CSS 3.4, Lucide React, Dexie 4, Recharts 2, vite-plugin-pwa 0.20, React Router 6 com createHashRouter, Zod, Vitest + fake-indexeddb + @testing-library/react, ESLint.
Sem servidor, sem APIs externas, nenhuma imagem ou vídeo carregado da internet dentro do app.

## Decisões fechadas (não reinterpretar)
- Roteamento: hash (URLs com #), via createHashRouter + RouterProvider (data router, desde a 0.3.5).
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
- Exercise: nome, tipo ('carga' | 'peso_corporal' | 'tempo'), unidadeCarga ('kg' | 'placa'), equipmentId opcional, grupoPrincipal (string, um único valor), gruposSecundarios (string[]), porLado (boolean), videoUrl opcional (Zod: apenas https://, qualquer domínio; seed com link de busca no YouTube: https://www.youtube.com/results?search_query= + encodeURIComponent("como fazer " + nome); bancos antigos recebem o link pela versão 2 do schema, só em exercícios do seed sem link, nunca sobrescrevendo link cadastrado), anotacoes opcional (texto livre).
- ExerciseImage: exerciseId, blob, mimeType, largura, altura. No máximo uma por exercício (substituir ao adicionar nova). Imagem substituída ou removida: soft delete e blob esvaziado (libera espaço).
- WorkoutPlan: nome, diaSemana (0–6), local opcional ('academia' | 'casa', ler com ?? 'academia'; fichas existentes viram academia sem migração), itens: [{ exerciseId, series, repsMin, repsMax, descansoSeg, ordem }].
- WorkoutSession: planId, planSnapshot (cópia completa do plano no início; cada item guarda também nome, tipo, unidadeCarga, grupoPrincipal e porLado do exercício naquele momento, para o histórico sobreviver a renomear ou excluir o exercício; editar a ficha nunca altera sessões passadas), status ('em_andamento' | 'pausada' | 'concluida' | 'abandonada'), iniciadaEm, finalizadaEm, duracaoAtivaSeg, rpe (0–10), observacoes, restTimerEndsAt (timestamp ou null), exerciciosPulados (exerciseId[], opcional: ler com ?? []), ativaDesde (timestamp da última retomada, opcional), pausadaEm (timestamp da pausa atual, opcional). Tempo ativo = duracaoAtivaSeg + (agora − ativaDesde) enquanto 'em_andamento'.
- ExerciseSet: sessionId, exerciseId, numeroSerie, carga (null para peso corporal), reps, lado ('esq' | 'dir' | null), concluidaEm. Salvar cada série imediatamente ao concluir.
- Exercício porLado: um único campo "reps por lado" e um único registro com lado null. Total de reps da série = reps × 2.
- CardioSession: sessionId opcional (liga ao treino no cardio pós-treino, Etapa 3c), modalidade ('esteira' | 'bicicleta' | 'caminhada'), duracaoMin, velocidadeKmh, inclinacaoNivel (número + rótulo livre; "nível 7" NÃO equivale a 7%), distanciaKm, fcMedia opcional, rpe, observacoes, data.
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
- Aviso informativo (nunca bloqueante): mesmo grupoPrincipal em dias consecutivos com RPE da sessão ≥ 8. Grupos secundários não contam. Entra na Etapa 3b. Compara os grupos principais da ficha a iniciar com a sessão concluída de ontem (qualquer local) com RPE ≥ 8. Aparece ao tocar em "Iniciar" (ConfirmDialog informativo: "Ontem você treinou <grupo> com esforço <RPE>. Iniciar mesmo assim?") e como linha pequena no card do treino sugerido no Início. Não aparece na tela Finalizar.
- Consistência: treinos por semana em relação ao planejado. Proibido: contagem acumulada de semanas, ícone de fogo ou qualquer sequência ("streak").
- Sem diagnóstico médico. Orientação para não prender a respiração e lista de sintomas para interromper o treino (dor no peito, tontura, falta de ar desproporcional, dor articular aguda).
- Imagem do exercício: galeria ou câmera (input accept="image/*"). Redimensionar via canvas para no máximo 1024 px no maior lado, WebP qualidade 0.8 (fallback JPEG). Nunca salvar o original.
- Sem recursos sociais, QR code ou renovação de ficha.
- Cada ficha tem exatamente um diaSemana e não pode haver duas fichas do mesmo local no mesmo dia (uma de academia e uma de casa no mesmo dia é permitido). Mover uma ficha para um dia ocupado no mesmo local troca as duas de dia, com confirmação.
- Reordenar exercícios com botões subir/descer. Sem arrastar e soltar e sem bibliotecas novas.
- Exercício usado em alguma ficha não pode ser excluído (mostrar em quais fichas). Criar exercício cujo nome normalizado bate com um excluído oferece "Restaurar 'X'" em vez de criar outro.
- Limites da ficha: séries 1–10; reps 1–100 com repsMin ≤ repsMax; descanso 0–600 s; nome obrigatório. Para tipo 'tempo', repsMin/repsMax são segundos (1–600).

## Local do treino (Etapa 3b)
- Local: 'academia' ou 'casa' (WorkoutPlan.local ?? 'academia'). Sem ficha inicial de casa: o usuário cadastra.
- Início: seletor grande "Academia | Casa" no topo. A escolha vale para o dia: guardar local e data em UserSettings (campos opcionais); em outro dia, volta para Academia.
- Sugestão considera só as fichas do local escolhido. Sem ficha desse local para hoje (e sem pendente), mostrar as fichas desse local para escolher.
- Pendências: um dia em que houve qualquer treino concluído (casa ou academia) não gera pendência para a ficha daquele dia em nenhum local.
- "X de Y treinos esta semana": Y = dias com ficha de academia; X = quantos desses dias estão cobertos na semana. Um dia está coberto se a ficha de academia dele foi concluída nesta semana (em qualquer dia) OU se houve treino em casa concluído naquele dia da semana. X nunca passa de Y (mesma noção das pendências).
- Aviso de mesmo grupoPrincipal em dias seguidos considera sessões dos dois locais.
- Aba Treinar: filtro "Academia | Casa"; "Nova ficha" cria no local selecionado.
- Local escolhido sem nenhuma ficha: mostrar "Criar ficha de <local>" no Início e na aba Treinar (no Início, com treino concluído hoje, vira link pequeno abaixo do card de concluído).
- Editor de ficha: seletor "Academia | Casa". Mudar o local (ou o dia) para um dia já ocupado nesse local pede a mesma confirmação de troca; a outra ficha vai para o dia e o local antigos.

## Regra de sugestão
- Ficha "feita" na semana = existe WorkoutSession 'concluida' daquela ficha nesta semana, em qualquer dia. Sessões abandonadas não contam.
- Pendentes = fichas com diaSemana anterior a hoje, nesta semana, ainda não feitas.
- Sugerido = a pendente mais antiga; sem pendentes, a ficha do dia de hoje (se ainda não feita).
- Já houve treino concluído hoje (qualquer local): o card do Início e o "Sugerido" da aba Treinar mostram "Treino de hoje concluído ✓" (ficha feita e duração) e não sugerem pendentes nesse dia; as pendências voltam a ser sugeridas no dia seguinte. Iniciar outra ficha continua possível pela aba Treinar. Essa regra tem prioridade em qualquer local: com um local sem fichas escolhido, o Início mostra o card de concluído e, abaixo, um link pequeno "Criar ficha de <local>".
- O motivo aparece junto: "Treino de hoje" ou "Pendente de <dia>". Quando o sugerido for pendente, mostrar também a ficha de hoje como segunda opção.
- Sábado e domingo: pendentes aparecem como "opcional"; sem pendentes, "Dia de descanso".
- Pendências não passam para a semana seguinte. Registrar RestDay não altera pendências.

## Tela Início (dashboard)
De cima para baixo:
1. Saudação curta e data de hoje.
2. Faixa da semana S T Q Q S S D (começando na segunda) com o número do dia; check dourado nos dias com treino concluído ou cardio; ícone diferente para RestDay; "Hoje" destacado. Ao lado: "X de Y treinos esta semana" (conforme "Local do treino": Y = dias com ficha de academia, X = dias cobertos).
3. Card do treino sugerido (conforme "Regra de sugestão"): nome, motivo, número de exercícios, duração estimada (média das últimas 3 sessões concluídas válidas da ficha, ignorando as com menos de 50% das séries planejadas ou menos de 10 minutos; sem sessões válidas, por exercício séries × 40 s + (séries − 1) × descanso, mais 60 s de troca entre exercícios), botão grande "Iniciar treino". Com sessão 'em_andamento' ou 'pausada': "Retomar treino" no lugar. Fileira de miniaturas (foto ou ícone do grupo principal) de todos os exercícios da ficha, com rolagem horizontal; tocar numa miniatura abre o detalhe do exercício.
4. Resumo da semana: minutos de musculação e de cardio (cardio lido das CardioSession desde já, porque a 3c vem antes da Etapa 5).
5. Peso atual e variação em relação à medição de cerca de 7 dias antes. Bloco não exibido até a Etapa 5 (nem texto, nem botão).
6. Último treino: data, ficha, duração e volume.

## Aba Treinar (escolha de treino)
- Todas as fichas em cards: nome, grupos principais, número de exercícios, duração estimada.
- Card "Sugerido" conforme a regra. Qualquer ficha pode ser iniciada em qualquer dia.
- Acesso a "Editar ficha" a partir do card (botão com o texto curto "Editar", rótulo acessível "Editar ficha <nome>"; "Iniciar" e "Editar" sem quebrar linha, conferido no test:viewport).
- Cada card tem a mesma fileira de miniaturas do card sugerido do Início.

## Detalhe do exercício (fora da sessão)
Aberto pelas miniaturas do Início e da aba Treinar. Somente leitura: foto grande (toque para ampliar; ver "Foto em tela cheia"), nome, prescrição da ficha, última carga, "Ver execução" (mesmas regras da tela de execução), Minhas anotações (editável direto nesta tela, sem abrir o editor), Grupos trabalhados e botão "Editar exercício". Sem campos de série nem cronômetro.

## Foto em tela cheia
Vale para toda foto ampliável (detalhe do exercício, execução). Zoom com dois dedos (1× a 5×), arrastar quando ampliada, toque duplo volta a 1×. Fecha pelo botão X ou por um toque simples sem zoom. Texto "Use dois dedos para ampliar" enquanto em 1×.

## Visão geral da sessão
Lista dos exercícios da sessão: foto (ou ícone do grupo principal), nome, "séries× repsMin a repsMax | última carga", status (pendente, parcial "2/3", concluído, pulado). Status calculado pelas séries registradas, NUNCA marcado à mão. Tocar abre a tela de execução. Botão "Pular" registra em exerciciosPulados. Progresso geral do treino (X de Y exercícios concluídos). Botão fixo "Finalizar treino" no rodapé. Botão "Editar exercício" (foto, link, anotações) em cada exercício. Card recolhível "Durante o treino": não prender a respiração e sintomas para parar.

## Tela de execução e detalhe do exercício
Layout (S24 Ultra, viewport ~384×832): tudo que se usa a cada série visível sem rolar, com ou sem descanso ativo; conferido por npm run test:viewport (Chrome headless, também no CI).
Ordem: cabeçalho compacto em uma linha (nome da ficha, "X de Y", tempo total; Pausar/Retomar e Abandonar no menu "⋮"); nome + miniatura + prescrição + última carga; linha pequena de alerta de sintomas (sem fundo vermelho; o card completo fica na visão geral); indicador de séries; campos de carga e reps com − e +; linha "Descanso: 90 s · Alterar"; "Ver execução"; seções recolhíveis.
Durante a sessão a navegação inferior some; no lugar, rodapé fixo (respeitando a área de gestos) com "Concluir série" grande (na visão geral: "Finalizar treino").
Sem foto: ícone pequeno do grupo ao lado do nome. Com foto: miniatura de no máximo 120 px de altura (toque para ampliar em tela cheia); botão "Ver execução" só com videoUrl, abrindo com target="_blank" e rel="noopener noreferrer", sem player embutido (offline: avisar que precisa de internet); séries/reps planejadas; última carga; campos de carga e reps; "Concluir série"; indicador de séries (1, 2, 3); cronômetro de descanso grande; cronômetro total; progresso geral do treino (X de Y exercícios concluídos); pausar/abandonar/retomar (sessão 'em_andamento' ou 'pausada' retomada ao abrir o app); "Finalizar treino" com RPE e observações; botão "Desfazer última série" (soft delete); uma linha fixa de alerta de sintomas para parar o treino; botão "Editar exercício" (abre o editor de exercício: foto, link, anotações).
Seções recolhíveis: Evolução de carga (mini gráfico, Etapa 4); Minhas anotações (Exercise.anotacoes, editável a qualquer momento); Grupos trabalhados (texto, sem diagrama do corpo).

## Finalizar treino: explicação do RPE (Etapa 3b)
Ao tocar numa nota, mostrar a descrição abaixo dos botões: 0 = repouso; 1–2 = muito leve; 3–4 = leve, dava para fazer muito mais; 5–6 = moderado, sobravam 4 ou mais repetições; 7 = pesado, sobravam ~3; 8 = difícil, sobravam ~2; 9 = muito difícil, sobrava 1; 10 = máximo, não saía mais nenhuma.

## Cardio pós-treino (Etapa 3c)
- Depois de "Finalizar treino", perguntar "Fazer cardio agora?" (Sim / Hoje não).
- Sim: tela de cardio com os valores de cardioPadrao (esteira, 15 min, "nível 7") editáveis, cronômetro da duração e "Concluir cardio" com RPE e observações. Grava CardioSession com sessionId ligando ao treino.
- O cronômetro do cardio segue as regras do descanso: horário final salvo no banco, Wake Lock e o mesmo alerta sonoro da 3a.5, só com o app visível.
- O módulo completo de cardio (registro avulso, gráficos) continua na Etapa 5.

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
- Sem descanso ativo, o painel não aparece: só a linha "Descanso: <s> s · Alterar".
- Com descanso ativo: contagem grande no rodapé, logo acima de "Concluir série", só com −15 s, Pular e +15 s.
- "Alterar" abre uma folha inferior com 45, 60, 90, 120, 180 s e personalizado (5–600 s); vale para o exercício nesta sessão (planSnapshot), nunca para a ficha.
- Contagem a partir de restTimerEndsAt salvo no banco (sobrevive a tela bloqueada e recarregamento).
- Wake Lock API ativa durante a sessão (reativar ao voltar ao app).
- Vibração e notificação só se o app estiver visível ou o navegador permitir; deixar claro que não há alerta garantido em segundo plano.
- Alerta sonoro (Etapa 3a.5), para ouvir no fone com o app visível: bipes gerados com Web Audio (OscillatorNode), sem arquivos de áudio nem dependência nova. Onda quadrada em 2000–3000 Hz, passando por um DynamicsCompressorNode antes da saída (audível com música no fone). Aviso antecipado como bipe duplo; bipes curtos simples aos 3, 2 e 1 s; bipe final mais agudo e mais longo no zero. Agendados no relógio do AudioContext (currentTime + segundos restantes); −15 s, +15 s, Pular, Alterar, pausar ou sair da execução cancelam e reagendam. AudioContext criado/retomado num gesto ("Concluir série", "Iniciar", "Testar som"). Com o app oculto (visibilitychange), nada toca e não há áudio silencioso para manter a página viva; ao voltar, reagenda o que falta. Com descanso ativo e o AudioContext suspenso (ex.: app reaberto no meio do descanso), mostrar a linha "Toque para ativar o som".
- "Permitir notificações" e a explicação ficam em Configurações → "Alertas de descanso" (o botão só enquanto Notification.permission === 'default'). Na mesma seção: som ligado/desligado (UserSettings.interface.somDescanso ?? true), aviso antecipado desligado/5 s/10 s (avisoAntecipadoSeg ?? 10), contagem 3-2-1 (contagem321 ?? true), "Volume do alerta" Baixo/Médio/Alto (volumeAlerta ?? 'alto'), o texto "O alerta não fica mais alto que o volume de mídia do celular." e "Testar som" (no volume escolhido); campos opcionais, sem migração. Na execução, no máximo um aviso pequeno, uma única vez (UserSettings.interface.avisoNotificacoesVisto, opcional), enquanto a permissão não foi decidida.

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
- Tela de Equipment (cadastro e vínculo opcional ao exercício) — entra na Etapa 5.
- Editar séries antigas — entra na Etapa 4, no Histórico.
- Excluir uma sessão pelo Histórico (para remover sessões de teste), refletindo no contador, na duração estimada e nos gráficos — entra na Etapa 4. Excluir a sessão também exclui (soft delete) as séries dela, para não afetar última carga, recordes e gráficos.
- Fase futura, sem etapa definida: login e sincronização entre aparelhos (Supabase). Não fazer até o usuário pedir.

## Etapas e critérios de aceite
1. CONCLUÍDA (inclui 1.1 e 1.2).
2. CONCLUÍDA (inclui 2.1). Ficha editável. Aceite: criar, editar, reordenar e excluir exercícios e dias; adicionar, trocar e remover foto, link e anotações de cada exercício; foto salva com no máximo 1024 px; sessões antigas inalteradas após editar.
3a. Execução: botão "Iniciar" como ação primária (amarela) em cada card da aba Treinar, com "Nova ficha" como botão secundário no fim da lista; visão geral da sessão; tela de execução; cronômetro; Wake Lock; pular exercício; pausar/abandonar/retomar; finalizar com RPE. Aceite: fechar o app no meio e reabrir retoma na série certa; testes do cronômetro com fake timers.
3a.5. CONCLUÍDA. Alerta sonoro do descanso (ver "Cronômetro de descanso"). Aceite: testes com AudioContext simulado: bipes nos tempos certos, reagendamento com ±15 s e Pular, nenhum bipe com som desligado ou app oculto.
3b. Planejamento: regra de sugestão, aba Treinar completa (com miniaturas), miniaturas no card sugerido do Início, detalhe do exercício fora da sessão (com "Minhas anotações" editável direto nele), botão "Editar exercício" no detalhe e na visão geral da sessão, aviso informativo de mesmo grupoPrincipal em dias consecutivos com RPE ≥ 8, mudanças durante a sessão com "Aplicar também na ficha?", dashboard (cardio e peso com estado vazio até a Etapa 5). Aceite: testes da regra de sugestão: semana sem faltas, falta na terça com sugestão na quarta, duas faltas, treino de sexta feito adiantado, virada de semana zerando pendências, sessão abandonada não contando; local do treino: treino em casa na terça não deixa a ficha de terça da academia pendente, contador soma os dois locais, aviso de dias seguidos cruza locais. Inclui "Local do treino" e a explicação do RPE.
Divisão da 3b, cada parte com git push e versão própria: 3b.1 (regras, local, editor de ficha) = 0.3.4, CONCLUÍDA; refactor do roteador (createHashRouter + RouterProvider, mesmas URLs, para permitir useBlocker) = 0.3.5, CONCLUÍDO; 3b.2 (Início, aba Treinar, miniaturas, detalhe do exercício, alterações não salvas via useBlocker + beforeunload) = 0.3.6, CONCLUÍDA; 3b.3 (Editar exercício na visão geral, mudanças durante a sessão, RPE explicado, "Aplicar também na ficha?") = 0.4.0.
3c. Cardio pós-treino (ver "Cardio pós-treino"), antecipando parte da Etapa 5.
4. Histórico, recordes, gráficos e mini gráfico no detalhe do exercício. Aceite: testes de volume, incluindo peso corporal e placa.
5. Cardio, medidas e fotos corporais.
6. Backup e restauração. Aceite: exportar, apagar banco, importar, dados idênticos (incluindo imagens de exercício).
7. PWA e offline. Aceite: instala no Chrome Android, abre offline, ícones 192 e 512; conferir "Armazenamento persistente" em Configurações com o app instalado no celular.
8. Publicação: CI/deploy ANTECIPADO na Etapa 3a.1 (.github/workflows/deploy.yml: npm ci → tsc --noEmit → lint → vitest run → build → deploy no GitHub Pages, disparado por push no branch master). Repositório público "fittrack" criado pelo usuário com gh CLI; passo manual: Settings → Pages → Source: GitHub Actions. URL final: https://nuxman.github.io/fittrack/. Na Etapa 8 restam só: README com instalação no S24 Ultra e revisão do workflow.
