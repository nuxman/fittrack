# FitTrack

App pessoal de controle de musculação, cardio e medidas corporais, em português do Brasil. Funciona **100% offline**: sem servidor, sem login, sem conta. Os dados ficam só no aparelho (IndexedDB do navegador).

**Endereço:** https://nuxman.github.io/fittrack/

## O que faz

- Fichas de treino por dia da semana, de academia ou de casa, com sugestão do treino do dia e das fichas que faltam na semana.
- Execução do treino: carga e repetições por série, cronômetro de descanso com alerta sonoro, tela sempre ligada, comparação com o treino anterior da mesma ficha.
- Aparelhos com cor e número (ex.: "● Azul 12"), foto, link de vídeo e anotações de cada exercício.
- Cardio pós-treino (com cronômetro) e avulso; histórico, recordes e gráficos de evolução.
- Medidas (peso e cintura), meta de peso e fotos corporais (que ficam só no aparelho).
- Calendário das últimas 5 semanas, perfil, dia de descanso e modo demonstração.
- Backup completo em JSON, CSV de séries e de medidas, e pacote de exercícios para outro aparelho.

O app não faz diagnóstico médico. Pare o treino se sentir dor no peito, tontura, falta de ar desproporcional ou dor articular aguda.

## Instalar no celular

Abra o endereço uma vez com internet. Depois de instalado, o app abre sem internet. Só o "Ver execução" (vídeo no YouTube) precisa de rede.

### Samsung Galaxy S24 Ultra (Chrome)

1. Abra https://nuxman.github.io/fittrack/ no **Chrome**.
2. Toque no menu **⋮** (canto superior direito) → **Instalar app** (ou **Adicionar à tela inicial** → **Instalar**).
3. Abra o FitTrack pelo ícone na tela inicial: ele abre em tela cheia, sem a barra do navegador.
4. Em **Configurações → Armazenamento**, confira se aparece "persistente" (o Chrome não apaga os dados sozinho se faltar espaço).

### iPhone (Safari)

1. Abra https://nuxman.github.io/fittrack/ no **Safari** (outros navegadores do iPhone não instalam o app).
2. Toque em **Compartilhar** (quadrado com seta para cima) → **Adicionar à Tela de Início** → **Adicionar**.
3. Abra o FitTrack pelo ícone na Tela de Início.
4. No iPhone, o app instalado tem um armazenamento separado do Safari: o que foi registrado no Safari antes de instalar não aparece no app. Para levar exercícios e fotos de um aparelho para outro, use **Configurações → Backup → Exportar pacote de exercícios** (ou o backup completo).

### Atualizações

Quando houver uma versão nova, o app mostra no topo **"Nova versão disponível — atualizar"**. Toque para recarregar na versão nova. A versão atual aparece em **Configurações**.

## Seus dados

- Tudo fica **só neste aparelho**. Limpar os dados do navegador, desinstalar o app ou trocar de celular **sem backup** apaga tudo.
- Faça backups em **Configurações → Backup → Exportar backup** (o app lembra no Início depois de 14 dias sem backup). O arquivo pode ir para o Google Drive, o WhatsApp ou o e-mail pelo compartilhamento do celular.
- **Fotos corporais não entram no backup.** Imagens de exercício e a foto do perfil entram.
- Para restaurar: **Configurações → Backup → Importar backup**. Antes de substituir, o app baixa um backup dos dados atuais.

## Desenvolvimento

Requisitos: Node 22 e npm. Para o teste de layout, Chrome ou Edge instalado.

```powershell
npm ci
npm run dev
```

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor local em http://localhost:5173/fittrack/ |
| `npm run dev:phone` | Mesmo servidor em HTTPS na rede local (abrir pelo IP no celular; o certificado é autoassinado) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Testes (Vitest, fake-indexeddb, Testing Library) |
| `npm run build` | Typecheck e build de produção em `dist/` (com o service worker) |
| `npm run test:viewport` | Depois do build: layout no Chrome headless em 384×832 (S24 Ultra) e 390×844 (iPhone), modo demonstração e funcionamento offline |
| `node scripts/icones.mjs` | Gera de novo os ícones PNG em `public/` (só se o desenho mudar) |

Tecnologias: React 18, TypeScript 5 (strict), Vite 5, Tailwind CSS 3.4, Dexie 4 (IndexedDB), Recharts 2, Zod, React Router 6 (rotas com `#`), vite-plugin-pwa, Lucide React.

A especificação completa, com as regras de negócio e as decisões de cada etapa, está em [CLAUDE.md](CLAUDE.md).

## Publicação

Cada push no branch `master` roda o workflow [.github/workflows/deploy.yml](.github/workflows/deploy.yml): `npm ci` → typecheck → lint → testes → build → teste de layout e offline no Chrome headless → publicação no GitHub Pages. Se qualquer passo falhar, nada é publicado.

Configuração única do repositório (já feita): **Settings → Pages → Source: GitHub Actions**.
