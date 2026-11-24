// Teste de layout no viewport do S24 Ultra (384×832) e, com --iphone, do iPhone 14 (390×844), num Chrome headless de verdade.
// O jsdom não calcula layout; aqui medimos getBoundingClientRect pelo DevTools Protocol.
// Uso: npm run build && npm run test:viewport  (inclui o caso com foto)  (sem dependências: Node 22 + Chrome/Edge instalados)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// --iphone: iPhone 14 (390×844); padrão: S24 Ultra (384×832).
const IPHONE = process.argv.includes('--iphone');
const LARGURA = IPHONE ? 390 : 384;
const ALTURA = IPHONE ? 844 : 832;
const PORTA_PREVIEW = 4319;
const PORTA_CDP = 9333;

const NAVEGADORES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
].filter(Boolean);
const navegador = NAVEGADORES.find((p) => existsSync(p));
if (!navegador) throw new Error('Chrome/Edge não encontrado (defina CHROME_PATH)');

const filhos = [];
const perfil = mkdtempSync(join(tmpdir(), 'fittrack-viewport-'));
const encerrar = () => {
  // Só os processos que este script iniciou, pelo PID.
  for (const p of filhos) if (p.exitCode === null) p.kill();
};
process.on('exit', () => {
  encerrar();
  try {
    rmSync(perfil, { recursive: true, force: true });
  } catch {
    // Chrome pode segurar arquivos por um instante; o diretório é temporário.
  }
});

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
async function ate(fn, msg, ms = 15000) {
  const fim = Date.now() + ms;
  for (;;) {
    try {
      const v = await fn();
      if (v) return v;
    } catch {
      // tenta de novo
    }
    if (Date.now() > fim) throw new Error(`Tempo esgotado: ${msg}`);
    await esperar(150);
  }
}

// 1. Servidor do build (vite preview).
const preview = spawn(process.execPath, ['node_modules/vite/bin/vite.js', 'preview', '--port', String(PORTA_PREVIEW), '--strictPort'], { stdio: 'ignore' });
filhos.push(preview);
const URL_APP = `http://localhost:${PORTA_PREVIEW}/fittrack/`;
await ate(async () => (await fetch(URL_APP)).ok, 'vite preview');

// 2. Chrome headless. No CI ele às vezes demora a abrir: espera 60 s e tenta uma segunda vez antes de falhar.
async function abrirChrome() {
  const chrome = spawn(navegador, [
    '--headless=new', `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`,
    '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank',
  ], { stdio: 'ignore' });
  filhos.push(chrome);
  try {
    return await ate(async () => {
      const lista = await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json/list`)).json();
      return lista.find((t) => t.type === 'page');
    }, 'Chrome DevTools', 60000);
  } catch (e) {
    // Só o Chrome que este script abriu, pelo PID.
    if (chrome.exitCode === null) chrome.kill();
    throw e;
  }
}
let alvo;
try {
  alvo = await abrirChrome();
} catch {
  console.log('  (Chrome não abriu em 60 s; tentando de novo)');
  alvo = await abrirChrome();
}

// 3. Cliente CDP mínimo (WebSocket nativo do Node 22).
const ws = new WebSocket(alvo.webSocketDebuggerUrl);
await new Promise((ok, erro) => {
  ws.onopen = ok;
  ws.onerror = erro;
});
let seq = 0;
const pendentes = new Map();
ws.onmessage = (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pendentes.has(m.id)) {
    pendentes.get(m.id)(m);
    pendentes.delete(m.id);
  }
};
const cdp = (method, params = {}) =>
  new Promise((ok, erro) => {
    const id = ++seq;
    pendentes.set(id, (m) => (m.error ? erro(new Error(`${method}: ${m.error.message}`)) : ok(m.result)));
    ws.send(JSON.stringify({ id, method, params }));
  });
async function avaliar(expr) {
  const r = await cdp('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  return r.result.value;
}

await cdp('Emulation.setDeviceMetricsOverride', { width: LARGURA, height: ALTURA, deviceScaleFactor: 3, mobile: true });
// --demo: modo demonstração ligado (faixa fixa no topo) antes de abrir o app.
const comDemo = process.argv.includes('--demo');
if (comDemo) {
  await cdp('Page.navigate', { url: URL_APP });
  await ate(() => avaliar(`document.readyState === 'complete'`), 'página inicial');
  // Marca a página antiga: a espera abaixo só termina na página recarregada (Page.reload volta antes de recarregar).
  await avaliar(`sessionStorage.setItem('fittrack-modo', 'demo'), window.__antiga = true, true`);
  // O banco é escolhido na abertura: recarrega, como o app faz ao entrar no modo.
  await cdp('Page.reload');
  await ate(() => avaliar(`!window.__antiga && !!document.querySelector('[data-testid="faixa-demo"]')`), 'faixa da demonstração');
}
// Funções usadas dentro da página.
const AJUDA = `
  window.__q = (sel) => document.querySelector(sel);
  window.__botao = (texto) => [...document.querySelectorAll('button')].find((b) => b.textContent.trim().startsWith(texto));
  window.__campo = (rotulo) => [...document.querySelectorAll('label')].find((l) => l.textContent.trim() === rotulo)?.control;
  window.__visivel = (el) => {
    if (!el) return 'ausente';
    const r = el.getBoundingClientRect();
    return r.top >= 0 && r.left >= 0 && r.bottom <= innerHeight && r.right <= innerWidth && r.height > 0
      ? true
      : 'fora: top=' + Math.round(r.top) + ' bottom=' + Math.round(r.bottom) + ' (viewport ' + innerWidth + '×' + innerHeight + ')';
  };
  window.__rolagem = () => document.scrollingElement.scrollTop;
`;

const falhas = [];
const conferir = (nome, valor) => {
  const ok = valor === true;
  console.log(`${ok ? '✓' : '✗'} ${nome}${ok ? '' : ` — ${valor}`}`);
  if (!ok) falhas.push(nome);
};

// Início: calendário das últimas 5 semanas (35 dias) sem rolagem horizontal, dias com pelo menos 40 px de largura.
// Na demonstração, os dias têm treinos (links para o Histórico).
await cdp('Page.navigate', { url: `${URL_APP}#/` });
await ate(() => avaliar(`location.hash === '#/' && document.querySelectorAll('[data-testid="dia-calendario"]').length === 35`), 'calendário do Início');
conferir('Início: calendário sem rolagem horizontal', await avaliar(`document.documentElement.scrollWidth <= innerWidth || 'scrollWidth ' + document.documentElement.scrollWidth`));
conferir('Início: dias do calendário com 40 px ou mais', await avaliar(`(() => {
  const w = Math.min(...[...document.querySelectorAll('[data-testid="dia-calendario"]')].map((d) => d.getBoundingClientRect().width));
  return w >= 40 || 'menor dia: ' + Math.round(w) + ' px';
})()`));
if (comDemo) conferir('demonstração: dias com treino abrem o Histórico', await avaliar(`document.querySelectorAll('[data-testid="dia-calendario"] a[href^="#/historico"]').length >= 15 || 'poucos links'`));
await cdp('Page.navigate', { url: `${URL_APP}#/treinar` });

// Espera a aba Treinar de fato: o Início também tem "Iniciar treino" (ex.: na demonstração, que recarrega no Início).
await ate(() => avaliar(`${AJUDA}; location.hash === '#/treinar' && !!__q('[data-testid="card-ficha"]') && !!__botao('Iniciar') && !!__q('a[href="#/historico/cardio/novo"]')`), 'aba Treinar');
// Botões dos cards da aba Treinar em uma linha só (texto sem quebra).
conferir('aba Treinar: "Iniciar" e "Editar" sem quebrar linha', await avaliar(`(() => {
  const card = document.querySelector('[data-testid="card-ficha"]');
  const botoes = [...card.querySelectorAll('a, button')].filter((b) => /^(Iniciar|Editar|Retomar)/.test(b.textContent.trim()));
  const altos = botoes.filter((b) => {
    const linha = parseFloat(getComputedStyle(b).lineHeight) || 24;
    const texto = document.createRange();
    texto.selectNodeContents(b);
    return texto.getClientRects().length > 0 && [...texto.getClientRects()].reduce((m, r) => Math.max(m, r.bottom), 0) - [...texto.getClientRects()].reduce((m, r) => Math.min(m, r.top), Infinity) > linha * 1.5;
  });
  return botoes.length >= 2 && altos.length === 0 ? true : 'quebram: ' + altos.map((b) => b.textContent.trim()).join(', ') + ' (' + botoes.length + ' botões)';
})()`));
await avaliar(`__botao('Iniciar').click(), true`);
// Espera a visão geral renderizar (a URL muda antes de a sessão carregar do banco).
await ate(() => avaliar(`${AJUDA}; location.hash === '#/sessao' && !!__botao('Finalizar treino') && !!document.querySelector('[data-testid="item-sessao"] a')`), 'visão geral');
conferir('visão geral: "Finalizar treino" visível sem rolar', await avaliar(`${AJUDA}; __visivel(__botao('Finalizar treino'))`));
conferir('visão geral: sem navegação inferior', await avaliar(`!document.querySelector('nav[aria-label="Navegação principal"]')`));

// Abre o primeiro exercício (tela de execução).
await avaliar(`document.querySelector('[data-testid="item-sessao"] a').click(), true`);
await ate(() => avaliar(`${AJUDA}; !!__botao('Concluir série')`), 'tela de execução');

const medirExecucao = async (etapa) => {
  const r = await avaliar(`${AJUDA}; ({
    carga: __visivel(__campo('Carga (kg)')),
    reps: __visivel(__campo('Repetições')),
    concluir: __visivel(__botao('Concluir série')),
    video: __visivel(__q('[data-testid="conteudo-execucao"] a[aria-label^="Ver execução de"]')),
    contagem: __visivel(__q('[data-testid="descanso"]')),
    rolagem: __rolagem(),
    conteudoRolado: __q('[data-testid="conteudo-execucao"]').scrollTop,
    folga: Math.round(__botao('Concluir série').getBoundingClientRect().top - __campo('Repetições').getBoundingClientRect().bottom),
  })`);
  console.log(`  (${etapa}: ${r.folga} px entre o campo de reps e o rodapé)`);
  conferir(`${etapa}: campo de carga visível`, r.carga);
  conferir(`${etapa}: campo de reps visível`, r.reps);
  conferir(`${etapa}: "Concluir série" visível`, r.concluir);
  conferir(`${etapa}: botão de vídeo ao lado do nome visível`, r.video);
  conferir(`${etapa}: página sem rolagem`, r.rolagem === 0 && r.conteudoRolado === 0 ? true : `scrollTop=${r.rolagem}/${r.conteudoRolado}`);
  return r;
};

// Pior caso: exercício com foto (miniatura de 120 px). Grava uma imagem pelo app e recarrega.
const comFoto = process.argv.includes('--com-foto');
const etapaDe = (e) => (comDemo ? `demonstração, ${e}` : comFoto ? `com foto, ${e}` : e);
if (comFoto) {
  await avaliar(`(async () => {
    const canvas = Object.assign(document.createElement('canvas'), { width: 400, height: 300 });
    canvas.getContext('2d').fillRect(0, 0, 400, 300);
    const blob = await new Promise((r) => canvas.toBlob(r, 'image/webp', 0.8));
    const id = location.hash.split('/').pop();
    const req = indexedDB.open('fittrack');
    const db = await new Promise((ok) => (req.onsuccess = () => ok(req.result)));
    const agora = new Date().toISOString();
    await new Promise((ok) => {
      const tx = db.transaction('exerciseImages', 'readwrite');
      tx.objectStore('exerciseImages').put({ id: crypto.randomUUID(), exerciseId: id, blob, mimeType: 'image/webp', largura: 400, altura: 300, createdAt: agora, updatedAt: agora, deletedAt: null });
      tx.oncomplete = ok;
    });
    db.close();
    location.reload();
    return true;
  })()`);
  await ate(() => avaliar(`${AJUDA}; !!__botao('Concluir série') && !!document.querySelector('button[aria-label="Ampliar foto"] img')`), 'execução com foto');
  conferir('com foto: miniatura com no máximo 120 px de altura', await avaliar(`(() => { const h = document.querySelector('button[aria-label="Ampliar foto"]').getBoundingClientRect().height; return h <= 120 || 'altura ' + h; })()`));
}

if (comDemo) {
  conferir('demonstração: faixa visível no topo', await avaliar(`${AJUDA}; __visivel(__q('[data-testid="faixa-demo"]'))`));
  conferir('demonstração: faixa não cobre o cabeçalho da sessão', await avaliar(`${AJUDA}; __q('[data-testid="faixa-demo"]').getBoundingClientRect().bottom <= __q('[data-testid="tela-sessao"] header').getBoundingClientRect().top || 'sobreposta'`));
}
const sem = await medirExecucao(etapaDe('sem descanso'));
conferir('sem descanso: painel de contagem ausente', sem.contagem === 'ausente' ? true : `contagem: ${sem.contagem}`);
conferir('sem descanso: linha "Descanso: 90 s · Alterar"', await avaliar(`${AJUDA}; /Descanso: 90 s · Alterar/.test(__q('[data-testid="linha-descanso"]')?.textContent ?? '')`));

// Conclui uma série para ativar o descanso (preenche a carga como um usuário faria).
await avaliar(`${AJUDA}; (() => {
  const c = __campo('Carga (kg)');
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(c, '40');
  c.dispatchEvent(new Event('input', { bubbles: true }));
  return true;
})()`);
await avaliar(`${AJUDA}; __botao('Concluir série').click(), true`);
await ate(() => avaliar(`!!document.querySelector('[data-testid="descanso"]')`), 'contagem do descanso');
const com = await medirExecucao(etapaDe('com descanso'));
conferir('com descanso: contagem visível', com.contagem);
conferir('com descanso: contagem acima de "Concluir série"', await avaliar(`${AJUDA}; __q('[data-testid="descanso"]').getBoundingClientRect().bottom <= __botao('Concluir série').getBoundingClientRect().top || 'sobreposto'`));

// Evolução (só na rodada sem foto): encerra a sessão e grava um treino anterior com uma série, direto no banco,
// para ter dois pontos; o gráfico (Recharts, sob demanda) precisa desenhar a linha sem rolagem horizontal.
if (!comFoto && !comDemo) {
  await avaliar(`(async () => {
    const exId = location.hash.split('/').pop();
    const req = indexedDB.open('fittrack');
    const db = await new Promise((ok) => (req.onsuccess = () => ok(req.result)));
    const tx = db.transaction(['workoutSessions', 'exerciseSets'], 'readwrite');
    const ss = tx.objectStore('workoutSessions');
    const sessao = await new Promise((ok) => { const r = ss.getAll(); r.onsuccess = () => ok(r.result.find((s) => s.status === 'em_andamento')); });
    ss.put({ ...sessao, status: 'concluida', finalizadaEm: new Date().toISOString(), rpe: 7 });
    const antes = new Date(Date.now() - 7 * 864e5).toISOString();
    const id = crypto.randomUUID();
    ss.put({ ...sessao, id, status: 'concluida', iniciadaEm: antes, finalizadaEm: antes, rpe: 7 });
    tx.objectStore('exerciseSets').put({ id: crypto.randomUUID(), sessionId: id, exerciseId: exId, numeroSerie: 1, carga: 35, reps: 10, lado: null, concluidaEm: antes, createdAt: antes, updatedAt: antes, deletedAt: null });
    await new Promise((ok) => (tx.oncomplete = ok));
    db.close();
    location.hash = '#/evolucao/' + exId;
    location.reload();
    return true;
  })()`);
  await ate(() => avaliar(`!!document.querySelector('figure .recharts-line-curve')`), 'gráfico da Evolução');
  conferir('evolução: linha do gráfico desenhada', await avaliar(`(() => { const w = document.querySelector('figure .recharts-line-curve').getBoundingClientRect().width; return w > 100 || 'largura ' + w; })()`));
  conferir('evolução: sem rolagem horizontal', await avaliar(`document.documentElement.scrollWidth <= innerWidth || 'scrollWidth ' + document.documentElement.scrollWidth`));
}

ws.close();
encerrar();
if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`);
  process.exit(1);
}
console.log(`\nLayout OK em ${LARGURA}×${ALTURA}.`);
process.exit(0);
