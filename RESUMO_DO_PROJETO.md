# FitTrack — Resumo do projeto (passagem de contexto)

> Documento para quem vai continuar o trabalho sem acesso às conversas anteriores.
> A **especificação completa e oficial** está em `CLAUDE.md` (raiz). Em caso de conflito, o `CLAUDE.md` vale.
> Situação em 26/11/2026: versão **1.0.1** (as 8 etapas concluídas; 1.0.1 = conteúdo abaixo da barra de status do iPhone), deploy confirmado com sucesso no GitHub Actions.

---

## 1. Objetivo do aplicativo

FitTrack é um app pessoal de **controle de musculação**, feito para uso de uma pessoa só (o dono do repositório), no celular **Samsung Galaxy S24 Ultra** (viewport ~384×832), como PWA no Chrome Android. Também funciona instalado pelo Safari do iPhone.

Ele permite:
- montar fichas de treino por dia da semana (academia ou casa);
- executar o treino na academia, registrando carga e repetições de cada série, com cronômetro de descanso e alerta sonoro;
- saber qual treino fazer hoje (incluindo treinos pendentes da semana);
- registrar cardio depois do treino ou avulso (esteira, bicicleta, caminhada, escada);
- consultar e corrigir o histórico de treinos;
- ver a evolução (gráficos e recordes de exercícios, cardio e corpo);
- registrar medidas (peso, cintura) e fotos corporais;
- cadastrar aparelhos (cor e número, padrão de academia), perfil e dias de descanso;
- fazer backup completo (JSON), exportar CSV e levar exercícios para outro aparelho (pacote);
- instalar como app e usar offline.

Funciona **100% offline e local**: sem servidor, sem login, sem APIs externas. Todos os dados ficam no IndexedDB do navegador. Interface em português do Brasil, tema escuro, cor principal amarelo/dourado, botões grandes.

---

## 2. Tecnologias

| Item | Tecnologia |
|---|---|
| Linguagem | TypeScript 5 (modo strict) |
| UI | React 18 |
| Build / dev server | Vite 5 (`base: '/fittrack/'`) |
| Estilo | Tailwind CSS 3.4 |
| Ícones | lucide-react |
| Roteamento | React Router 6 com `createHashRouter` + `RouterProvider` (URLs com `#`) |
| Banco de dados | IndexedDB via **Dexie 4** (schema versionado, hoje na versão 3) |
| Validação | Zod |
| Gráficos | Recharts 2 (aba Evolução, carregado sob demanda) |
| PWA | vite-plugin-pwa 0.20 (manifest, service worker com precache de todo o build, aviso de nova versão) |
| Testes | Vitest + jsdom + fake-indexeddb + @testing-library/react; teste de layout em Chrome headless (`scripts/viewport.mjs`) |
| Lint | ESLint 9 (typescript-eslint, react-hooks, react-refresh) |
| Hospedagem | GitHub Pages, publicado por GitHub Actions a cada push no `master` |
| Repositório | `git@github.com:nuxman/fittrack.git` (público) |
| URL publicada | https://nuxman.github.io/fittrack/ |

Node usado no desenvolvimento e no CI: **22**.
Não adicionar bibliotecas novas sem perguntar (as versões da stack são fixas na spec).

---

## 3. Estrutura de pastas e arquivos principais

```
.github/workflows/deploy.yml   CI/CD: npm ci → tsc → lint → vitest → build → test:viewport → deploy no Pages
.claude/settings.json          Permissões do Claude Code (só regras de bloqueio)
CLAUDE.md                      Especificação completa, regras de trabalho e etapas (LEIA PRIMEIRO)
RESUMO_DO_PROJETO.md           Este arquivo
index.html                     HTML de entrada do Vite
vite.config.ts                 Base /fittrack/, versão/commit/data do build injetados, config do Vitest, HTTPS no modo phone
tailwind.config.js             Tema (cores do app)
eslint.config.js               Regras de lint
tsconfig.json                  TypeScript strict
README.md                      Instalação no S24 Ultra e no iPhone, dados e backup, comandos
scripts/viewport.mjs           Teste de layout num Chrome headless real (DevTools Protocol): S24 Ultra 384×832 e iPhone 390×844
scripts/icones.mjs             Gera os ícones PNG do PWA a partir do desenho do favicon (sem dependência)
public/                        favicon.svg, pwa-192.png, pwa-512.png, pwa-maskable-512.png, apple-touch-icon

src/main.tsx                   Ponto de entrada React; registra o service worker (virtual:pwa-register)
src/atualizacao.ts             Ponte entre o service worker e o aviso "Nova versão disponível — atualizar"
src/App.tsx                    Cria o data router (createHashRouter) e o RouterProvider
src/rotas.tsx                  Tabela de rotas e o layout raiz (ConfirmDialog, RetomarSessao, BottomNav)
src/index.css                  Tailwind + estilos globais; variáveis de área segura (--sat, --topo, --sat-livre, --faixa) e --demo-h

src/db/db.ts                   Classe Dexie: tabelas, versões do schema (v1, v2 com upgrade dos links, v3 com a tabela profile), SCHEMA_VERSAO e seed via on('populate')
src/db/types.ts                Tipos de todas as entidades (Exercise, WorkoutPlan, WorkoutSession, GrupoMuscular etc.)
src/db/seed.ts                 Ficha inicial (segunda a sexta), configurações padrão e links de busca no YouTube
src/db/normalize.ts            Normalização de nomes de exercício (trim, espaços, sem acento, minúsculas)
src/db/repositories/base.ts    CRUD genérico com id/createdAt/updatedAt/deletedAt e filtro de soft delete
src/db/repositories/*.ts       Um repository por entidade (único acesso permitido ao Dexie):
                               equipment, exercises, exerciseImages, workoutPlans, workoutSessions,
                               exerciseSets, cardioSessions, bodyMeasurements, bodyPhotos, restDays, settings,
                               profile, demo; backup.ts (backup completo e CSV) e pacote.ts (pacote de exercícios)

src/semana.ts                  Regras da semana: ficha feita, pendências, sugestão, contador "X de Y", aviso de grupo seguido
src/sessao.ts                  Regras puras da sessão: status do exercício, tempo ativo, mudanças para "Aplicar na ficha"
src/cardio.ts                  Regras puras do cardio (pós-treino e avulso, modalidades)
src/medidas.ts                 Regras das medidas: peso atual, variação de ~7 dias (janela 4–10), meta com direção
src/csv.ts                     CSV com ';', vírgula decimal e BOM (séries e medidas)
src/backup.ts                  Lembrete de backup e entrega do arquivo (navigator.share ou download)
src/painel.ts                  Carrega numa leitura só os dados do Início e da aba Treinar
src/somDescanso.ts             Bipes do descanso com Web Audio (OscillatorNode + DynamicsCompressor)
src/image.ts                   Redimensiona foto para ≤1024 px, WebP 0.8 (fallback JPEG)
src/format.ts                  Formatação de prescrição ("3×10–12"), duração etc.
src/dias.ts                    Nomes dos dias e ordem da semana (segunda primeiro)
src/modo.ts                    Modo demonstração: nome do banco (fittrack ou fittrack-demo) escolhido na abertura via sessionStorage
src/db/demo.ts                 Treinos fictícios do banco de demonstração (populate)
src/storage.ts                 navigator.storage.persist() e consulta de persistência
src/useAgora.ts                Hook de relógio para cronômetros
src/useAsync.ts                Hook para carregar dados de repositories com reload()
src/useAvisoNaoSalvo.ts        Aviso de alterações não salvas (useBlocker + beforeunload)
src/useIniciar.ts              Ação "Iniciar treino" com aviso de grupo seguido e sessão ativa
src/useLocalHoje.ts            Local do dia (Academia/Casa) salvo em UserSettings com a data
src/useWakeLock.ts             Mantém a tela ligada durante a sessão

src/components/ConfirmDialog.tsx    Diálogo de confirmação/escolha do app (substitui window.confirm/alert/prompt)
src/components/FaixaDemo.tsx        Faixa fixa "Modo demonstração · Sair" no topo (só no modo)
src/components/BottomNav.tsx        Navegação inferior (some durante a sessão)
src/components/RetomarSessao.tsx    Ao abrir o app: retoma sessão/cardio ativo; pergunta se esquecida (> 3 h)
src/components/RestTimer.tsx        Cronômetro de descanso (restTimerEndsAt salvo no banco), notificação, vibração
src/components/CampoSerie.tsx       Campos de carga/reps com − e + (inputMode decimal, vírgula ou ponto)
src/components/CardFicha.tsx        Card de ficha (Início e aba Treinar) com miniaturas e ações
src/components/Miniaturas.tsx       Fileira horizontal de fotos/ícones dos exercícios
src/components/FotoExercicio.tsx    Foto do exercício ou ícone do grupo
src/components/FotoAmpliavel.tsx    Foto em tela cheia com zoom de dois dedos (1× a 5×)
src/components/ImageField.tsx       Adicionar/trocar/remover foto (galeria ou câmera)
src/components/ExercisePicker.tsx   Busca de exercício; "Criar 'X'" ou "Restaurar 'X'"
src/components/EscolhaRpe.tsx       Botões de RPE 0–10 com explicação
src/components/Anotacoes.tsx        "Minhas anotações" editável na hora
src/components/VerExecucao.tsx      Link "Ver execução" (abre fora do app; offline avisa)
src/components/AlertasDescanso.tsx  Seção de Configurações: notificações e som do descanso
src/components/SeletorLocal.tsx     Seletor "Academia | Casa"
src/components/GrupoIcone.tsx       Ícone por grupo muscular
src/components/Page.tsx             Layout de página com voltar
src/components/Aparelho.tsx         Etiqueta do aparelho ("● Azul 12") e diálogo para escolher/criar aparelho
src/components/AvisoAtualizacao.tsx "Nova versão disponível — atualizar" (fixo no topo)
src/components/Backup.tsx           Seção Backup de Configurações (exportar/importar, CSV, lembrete)
src/components/PacoteExercicios.tsx Exportar/importar pacote de exercícios
src/components/Calendario.tsx       Calendário das últimas 5 semanas no Início
src/components/FichasDaSemana.tsx   Card "Fichas da semana" (feita/em casa/faltando)
src/components/ComparacaoAnterior.tsx Barras de comparação com o treino anterior da ficha
src/components/CamposCardio.tsx     Campos do cardio por modalidade (pós-treino e avulso)
src/components/FotosCorporais.tsx   Fotos da medição (desfocadas até "Mostrar fotos")
src/components/MetaPeso.tsx         Meta de peso com direção (Configurações)
src/components/Desfazer.tsx         Aviso "… excluído · Desfazer" por 8 s
src/components/ErroTela.tsx         Tela de erro em português (errorElement)

src/pages/Inicio.tsx                    Dashboard (semana, treino sugerido, resumo, último treino)
src/pages/Fichas.tsx                    Aba Treinar (/treinar): fichas por local, sugerido, iniciar/editar
src/pages/FichaEditor.tsx               Criar/editar ficha (dia, local, exercícios, ordem, troca de dia)
src/pages/Exercicios.tsx                Catálogo de exercícios
src/pages/ExercicioEditor.tsx           Editar exercício (foto, link, anotações, grupos, tipo)
src/pages/ExercicioDetalhe.tsx          Detalhe do exercício fora da sessão (/exercicio/:id)
src/pages/sessao/SessaoLayout.tsx       Layout da sessão (carrega a sessão, Wake Lock, rodapé)
src/pages/sessao/SessaoVisao.tsx        Visão geral da sessão (lista, status, pular, substituir)
src/pages/sessao/SessaoExecucao.tsx     Tela de execução de um exercício (séries, descanso)
src/pages/sessao/SessaoFinalizar.tsx    Finalizar: RPE, observações, "Aplicar também na ficha?"
src/pages/Cardio.tsx                    Cardio pós-treino (/cardio/:sessionId)
src/pages/historico/Historico.tsx       Lista do histórico agrupada por semana
src/pages/historico/HistoricoDetalhe.tsx Detalhe do treino: editar/excluir séries, RPE, excluir treino com desfazer
src/pages/Configuracoes.tsx             Versão, armazenamento persistente, alertas de descanso, meta de peso, backup, aparelhos, perfil, modo demonstração
src/pages/historico/CardioAvulso.tsx    Registrar/editar cardio (/historico/cardio/novo e /:id)
src/pages/medidas/                      Medidas (lista, editor com fotos, comparar fotos)
src/pages/Aparelhos.tsx                 Lista e editor de aparelhos (cor, número, observações)
src/pages/Perfil.tsx                    Meu perfil (foto, nome, nascimento, altura, sexo, objetivo)
src/pages/sessao/AparelhoNaSessao.tsx   Etiqueta/definir aparelho sem sair da sessão
src/evolucao.ts                         Regras puras da Evolução: pontos por sessão, medidas por unidade, recordes, comparação com o treino anterior
src/pages/evolucao/                     Aba Evolução (lista, detalhe com gráficos e tabela) e MiniGrafico, carregados com React.lazy
src/components/EvolucaoCarga.tsx        Seção recolhível "Evolução de carga" (execução e detalhe do exercício); carrega o mini gráfico só ao abrir

src/test/setup.ts, src/test/abrir.tsx   Configuração dos testes e helper para montar o app numa rota
src/**/*.test.ts(x)                     308 testes (regras da semana, sessão, banco, cardio, medidas, backup, pacote, telas, som, imagem)
```

Rotas (com `#`): `/`, `/treinar`, `/sessao`, `/sessao/:exerciseId`, `/sessao/finalizar`, `/cardio/:sessionId`, `/fichas/nova`, `/fichas/:id`, `/exercicios`, `/exercicios/novo`, `/exercicios/:id`, `/exercicio/:id`, `/historico`, `/historico/cardio/novo`, `/historico/cardio/:id`, `/historico/:id`, `/medidas`, `/medidas/nova`, `/medidas/comparar`, `/medidas/:id`, `/evolucao` (`?ver=cardio|corpo`), `/evolucao/:id`, `/aparelhos`, `/aparelhos/novo`, `/aparelhos/:id`, `/perfil`, `/configuracoes`.

---

## 4. Como instalar e rodar localmente

Pré-requisitos: Node 22, Git, GitHub CLI (`gh`) autenticado para ver o deploy. Ambiente usado: Windows com PowerShell 7.

```powershell
git clone git@github.com:nuxman/fittrack.git
cd fittrack
npm ci
npm run dev
```
Abrir http://localhost:5173/fittrack/

Outros comandos:
```powershell
npm run dev:phone        # HTTPS na rede local (certificado autoassinado) para testar no celular pelo IP
npm run typecheck        # tsc --noEmit
npm run lint             # eslint .
npm test                 # vitest run
npm run build            # tsc + vite build (gera dist/)
npm run preview          # serve o dist/
npm run test:viewport    # layout em Chrome headless: 384×832 (normal, --com-foto, --demo) e 390×844 (--iphone --com-foto, --iphone --demo, com a barra de status forçada em 47 px); precisa do build e de Chrome (CHROME_PATH se necessário)
gh run list --limit 3    # conferir o deploy depois do push
gh run watch             # acompanhar o deploy em andamento
```

Publicação: `git push` no `master` dispara `.github/workflows/deploy.yml`. No GitHub, Settings → Pages → Source está em "GitHub Actions" (já configurado).

---

## 5. Funcionalidades prontas e funcionando

- **Etapa 1**: estrutura, banco Dexie com soft delete, repositories, seed da ficha inicial (segunda a sexta), normalização de nomes, navegação inferior, tema escuro, armazenamento persistente em Configurações.
- **Etapa 2**: fichas editáveis (criar, editar, reordenar com subir/descer, excluir, trocar dia com confirmação), catálogo de exercícios, foto do exercício (redimensionada, uma por exercício), link de vídeo (só https), anotações, restaurar exercício excluído, bloqueio de exclusão de exercício usado em ficha.
- **Etapa 3a**: execução do treino — visão geral da sessão, tela de execução, séries salvas na hora, desfazer última série, cronômetro de descanso persistido no banco, Wake Lock, pular exercício, pausar/retomar/abandonar, finalizar com RPE, retomada ao reabrir o app, sessão esquecida (> 3 h), versão em Configurações, layout conferido no viewport do S24 Ultra.
- **Etapa 3a.5**: alerta sonoro do descanso (Web Audio), configurações de som/aviso antecipado/3-2-1/volume, "Testar som", permissão de notificações.
- **Etapa 3b** (0.3.4 a 0.4.1): regra de sugestão e pendências, local do treino (Academia/Casa), contador "X de Y treinos esta semana", aviso informativo de mesmo grupo em dias seguidos com RPE ≥ 8, Início (dashboard), aba Treinar completa com miniaturas, detalhe do exercício, aviso de alterações não salvas, mudanças durante a sessão (séries/reps/descanso/substituir exercício) com "Aplicar também na ficha?", explicação do RPE.
- **Etapa 3c** (0.5.0): cardio pós-treino com cronômetro persistido, rascunho no banco, cardio esquecido, cancelar.
- **Etapa 4c** (0.9.0): no detalhe do Histórico, comparação com o treino concluído anterior da mesma ficha (volume total e, por exercício, carga/volume, placa, reps ou tempo); seção recolhível "Evolução de carga" com mini gráfico na execução e no detalhe do exercício, carregada só ao abrir.
- **Modo demonstração** (0.8.0, fora das etapas): Configurações → "Entrar no modo demonstração" abre o app num banco separado (`fittrack-demo`) com ~4 semanas de treinos fictícios; faixa "Modo demonstração · Sair" no topo; "Recomeçar demonstração". O banco real não é tocado.
- **Correção 0.8.1**: o modo demonstração termina ao fechar o app (marca em sessionStorage; reabrir volta ao banco real) e "Entrar" sempre recria os dados de exemplo com datas atuais.
- **Etapa 4b** (0.7.0): aba Evolução com lista de exercícios, recordes por unidade, gráficos de carga máxima e volume (Recharts, carregado sob demanda) e tabela.
- **Correção 0.6.1**: botão de vídeo ao lado do nome na execução e ícone de vídeo em cada exercício da visão geral; sem link salvo, usa a busca no YouTube pelo nome.
- **Etapa 4a** (0.6.0): Histórico agrupado por semana, detalhe do treino, editar/excluir série, editar RPE e observações, excluir treino (sessão + séries + cardio ligado, em transação) com "Desfazer" por 8 segundos.
- **Correção 0.9.1**: falha ao carregar as partes sob demanda (sem internet ou depois de deploy novo) não derruba a tela: mini gráfico com "Tentar de novo" na própria seção; telas de erro em português nas rotas da Evolução e no layout raiz.
- **Etapa 5a** (0.10.0): cardio avulso ("Registrar cardio" na aba Treinar e no Histórico, sem cronômetro), card próprio no Histórico, editar e excluir com "Desfazer"; o cardio pós-treino também fica editável pelo detalhe do treino. Cardio avulso conta nos minutos e no check da faixa da semana, mas não no "X de Y" nem nas pendências.
- **Etapa 5a.1** (0.11.0): modalidade "escada" (nível e andares, sem velocidade e distância); campos do formulário mudam com a modalidade e a troca limpa os que não valem.
- **Etapa 5b** (0.12.0): aba Evolução com "Exercícios | Cardio"; no Cardio, por modalidade, recordes (maior duração e distância; escada: duração e andares), gráficos de duração, distância e velocidade (escada: duração e andares) e tabela.
- **Etapa 5c** (0.13.0): medidas de peso e cintura (/medidas, registrar, editar, excluir com "Desfazer"); bloco de peso no Início (peso atual, variação de cerca de 7 dias, meta); meta de peso em Configurações; Evolução → Corpo com gráficos de peso e cintura.
- **Correção 0.13.1**: meta de peso com direção (perder/ganhar), gravada ao salvar; passar da meta mostra "meta alcançada".
- **Etapa 5d** (0.14.0): fotos corporais nas medições (várias por medição, desfocadas até "Mostrar fotos", comparar duas medições lado a lado; fora do backup).
- **Etapa 5e** (0.15.0): aparelhos (/aparelhos, exclusão bloqueada se em uso) e "Marcar hoje como descanso" no Início.
- **Etapa 6a** (0.16.0): backup JSON completo (com imagens de exercício em base64, sem fotos corporais), importação validada com Zod, pré-visualização, backup automático antes de substituir, lembrete de backup.
- **Etapa 6b** (0.17.0 e 0.17.1): CSV de séries e de medidas.
- **Etapa 6c** (0.18.0): pacote de exercícios (com fichas opcionais) para outro aparelho, juntando pelo nome normalizado.
- **Perfil** (0.19.0, correção 0.19.1): "Meu perfil", saudação com nome e foto; backup sem perfil mantém o atual.
- **0.20.0**: regra de pendências corrigida (só treino em casa cobre a ficha de academia do dia) e card "Fichas da semana".
- **0.21.0**: aparelhos com cor e número, etiqueta na sessão, cor sugerida pelo grupo muscular.
- **0.22.0**: calendário das últimas 5 semanas no Início, com link para o Histórico.
- **0.23.0** (correção 0.23.1): comparação com o treino anterior da ficha (barras na visão geral e no Finalizar, linha compacta na execução).
- **Etapa 7** (0.24.0): PWA instalável e offline (manifest, ícones, meta do iOS, precache das partes sob demanda, aviso de nova versão).
- **Etapa 8** (1.0.0): README e revisão do workflow.
- **Correção 1.0.1**: no iPhone instalado (viewport-fit=cover, status bar black-translucent), conteúdo, diálogos, X da foto e faixa da demonstração ficam abaixo da barra de status; conferido no test:viewport com a barra forçada em 47 px.
- CI/CD funcionando (último deploy: sucesso).

---

## 6. Pela metade ou bugs conhecidos

- Nenhum bug aberto conhecido.
- Conferência manual da Etapa 7 no celular (pelo usuário): instalar no Chrome Android e no Safari do iPhone e ver "Armazenamento persistente" em Configurações com o app instalado. A área segura do iPhone só foi conferida no Chrome com a variável forçada, não num iPhone real.
- Simplificação marcada no código: `src/sessao.ts` (comentário `ponytail:`) — o tempo ativo para um instante anterior ao último trecho ativo é aproximado por cima.

---

## 7. Próximos passos planejados

Cada item com versão, `git push` e deploy confirmado próprios:

1. **1.1.0**: modalidade de cardio "elíptico".
2. Depois da Etapa 5 (decidido não fazer agora): "Iniciar cardio" avulso com cronômetro, reaproveitando a tela do cardio pós-treino.
3. Futuro sem etapa: login e sincronização entre aparelhos (Supabase) — **não fazer até o usuário pedir**. Sem nutrição.

---

## 8. Decisões importantes e motivos

- **Sem servidor, tudo no IndexedDB**: app pessoal, offline na academia, sem custo de hospedagem de backend.
- **Roteamento por hash (`createHashRouter`)**: GitHub Pages não reescreve URLs para SPA; com `#` qualquer rota funciona ao recarregar. Migrado para data router na 0.3.5 para poder usar `useBlocker` (aviso de alterações não salvas).
- **Base `/fittrack/`**: o site é publicado em `nuxman.github.io/fittrack/`.
- **Acesso ao Dexie só via repositories**: centraliza soft delete e timestamps; componentes nunca tocam o banco.
- **Soft delete com `filter()` e sem índice em `deletedAt`**: o IndexedDB não indexa `null`.
- **Seed via `db.on('populate')`**: roda uma única vez, atômico, sem duplicar em várias abas.
- **Campos opcionais novos sem migração** (lidos com `?? padrão`); campo obrigatório ou índice novo exige versão nova do schema com `upgrade()` e teste.
- **Um único Exercise por nome normalizado**: o mesmo exercício em dias diferentes acumula histórico junto.
- **`planSnapshot` na sessão** (com nome/tipo/unidade/grupo copiados): editar ou excluir exercício/ficha nunca altera o histórico.
- **Carga nunca na ficha, nunca aumento automático**: sugestão = última carga registrada.
- **Volume só para carga em kg**; "placa" não tem volume em kg (não é comparável).
- **Cronômetros salvos como horário final no banco** (`restTimerEndsAt`, cardio): sobrevivem a tela bloqueada e recarregamento.
- **Bipes com Web Audio, sem arquivos**, onda quadrada 2–3 kHz com compressor: audíveis com música no fone; só com o app visível (navegador não garante alerta em segundo plano, e o projeto não usa truques de áudio silencioso).
- **ConfirmDialog próprio** em vez de `window.confirm`: visual consistente e suporte a múltiplas opções.
- **Sem streak/ícone de fogo**: consistência é "X de Y treinos esta semana", sem acumular semanas.
- **Semana de segunda a domingo; pendências não passam para a semana seguinte.**
- **Local Academia/Casa**: `local ?? 'academia'` sem migração; treino em casa num dia cobre a pendência da ficha de academia desse dia.
- **Teste de viewport em Chrome headless real**: jsdom não calcula layout; garante que tudo da série cabe na tela do S24 Ultra (e do iPhone) sem rolar.
- **Área segura do iPhone por variáveis CSS** (`--sat` = `env(safe-area-inset-top)`): no Android e no navegador vale 0; o test:viewport força 47 px na rodada do iPhone, porque o Chrome não tem entalhe.
- **PWA com `registerType: 'prompt'`**: o usuário decide quando atualizar (nunca recarrega no meio de um treino); o precache inclui as partes carregadas sob demanda para a Evolução funcionar offline.
- **Backup sem fotos corporais**: privacidade e tamanho do arquivo; avisado nas telas. Backup completo e pacote de exercícios recusam o arquivo um do outro.
- **Modo demonstração em banco separado, escolhido na abertura**: o `db` é criado uma vez por carregamento; trocar de banco recarregando a página garante que nenhuma tela fique com o banco antigo aberto, e o banco real nunca é aberto no modo.
- **Leituras do banco depois de a tela fechar são descartadas** (`useAsync` ignora a falha quando a tela já foi desmontada; `RetomarSessao` ignora banco fechado de propósito): isso eliminou o `DatabaseClosedError` intermitente nos testes, que chegou a derrubar o deploy.
- **CI/deploy antecipado** (desde a 3a.1) para testar no celular de verdade a cada etapa.
- **Versionamento**: funcionalidade nova sobe o número do meio, correção o último; commits só de CI/docs/CLAUDE.md não sobem versão. A versão sobe **antes** de rodar tsc/lint/testes/build.

### Regras de trabalho do dono do projeto (resumo de `CLAUDE.md`)
- Implementar **uma etapa por vez**, só a pedida.
- Antes de dizer que terminou: `tsc --noEmit`, lint e testes passando.
- Entrega só está concluída após `git push` **e** deploy confirmado (`gh run watch`/`gh run list`).
- Commit "Etapa N: <resumo>" e relatório com arquivos criados, como testar e pendências.
- Decisões fora da spec: perguntar antes ou listar no relatório.
- Comandos para o usuário: PowerShell 7, um por linha, nada interativo.
- Nunca encerrar processos por nome; só por PID de processos iniciados por você.
- Evitar capturas de tela.

---

## 9. Variáveis de ambiente e configurações

O app **não usa variáveis de ambiente, senhas nem chaves** (não há `.env`; `.env*` está no `.gitignore`). Nada de credenciais no repositório.

Configurações existentes:
- `sessionStorage` chave `fittrack-modo` = `demo`: liga o modo demonstração só nesta aba/abertura do app (fechar o app apaga; sem ela, banco real). Se existir em `localStorage` (0.8.0), é removida.
- `CHROME_PATH` — opcional, caminho do executável do Chrome usado por `npm run test:viewport` (no CI: `/usr/bin/google-chrome`).
- Constantes injetadas pelo Vite no build (não são variáveis de ambiente): `__APP_VERSION__` (de `package.json`), `__APP_COMMIT__` (hash do git), `__APP_BUILD_DATE__`.
- GitHub: Pages com Source = "GitHub Actions"; o workflow usa as permissões `pages: write` e `id-token: write` (sem secrets próprios).
- Para fazer push/ver deploy: chave SSH com acesso a `nuxman/fittrack` e `gh` autenticado.
- Configurações do usuário dentro do app ficam na tabela `settings` (UserSettings): descanso padrão, cardio padrão, local do dia, som/aviso/volume do descanso, meta de peso e direção, data do último backup etc. O perfil fica na tabela `profile`.
