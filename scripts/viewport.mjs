// Teste de layout no viewport do S24 Ultra (384×832), num Chrome headless de verdade.
// O jsdom não calcula layout; aqui medimos getBoundingClientRect pelo DevTools Protocol.
// Uso: npm run build && npm run test:viewport  (inclui o caso com foto)  (sem dependências: Node 22 + Chrome/Edge instalados)
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const LARGURA = 384;
const ALTURA = 832;
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

// 2. Chrome headless.
const chrome = spawn(navegador, [
  '--headless=new', `--remote-debugging-port=${PORTA_CDP}`, `--user-data-dir=${perfil}`,
  '--no-first-run', '--no-default-browser-check', '--disable-gpu', '--no-sandbox', 'about:blank',
], { stdio: 'ignore' });
filhos.push(chrome);
const alvo = await ate(async () => {
  const lista = await (await fetch(`http://127.0.0.1:${PORTA_CDP}/json/list`)).json();
  return lista.find((t) => t.type === 'page');
}, 'Chrome DevTools');

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
await cdp('Page.navigate', { url: `${URL_APP}#/treinar` });

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

await ate(() => avaliar(`${AJUDA}; !!__botao('Iniciar')`), 'aba Treinar');
await avaliar(`__botao('Iniciar').click(), true`);
await ate(() => avaliar(`location.hash === '#/sessao'`), 'visão geral');
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
    contagem: __visivel(__q('[data-testid="descanso"]')),
    rolagem: __rolagem(),
    conteudoRolado: __q('[data-testid="conteudo-execucao"]').scrollTop,
    folga: Math.round(__botao('Concluir série').getBoundingClientRect().top - __campo('Repetições').getBoundingClientRect().bottom),
  })`);
  console.log(`  (${etapa}: ${r.folga} px entre o campo de reps e o rodapé)`);
  conferir(`${etapa}: campo de carga visível`, r.carga);
  conferir(`${etapa}: campo de reps visível`, r.reps);
  conferir(`${etapa}: "Concluir série" visível`, r.concluir);
  conferir(`${etapa}: página sem rolagem`, r.rolagem === 0 && r.conteudoRolado === 0 ? true : `scrollTop=${r.rolagem}/${r.conteudoRolado}`);
  return r;
};

// Pior caso: exercício com foto (miniatura de 120 px). Grava uma imagem pelo app e recarrega.
const comFoto = process.argv.includes('--com-foto');
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

const sem = await medirExecucao(comFoto ? 'com foto, sem descanso' : 'sem descanso');
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
const com = await medirExecucao(comFoto ? 'com foto, com descanso' : 'com descanso');
conferir('com descanso: contagem visível', com.contagem);
conferir('com descanso: contagem acima de "Concluir série"', await avaliar(`${AJUDA}; __q('[data-testid="descanso"]').getBoundingClientRect().bottom <= __botao('Concluir série').getBoundingClientRect().top || 'sobreposto'`));

ws.close();
encerrar();
if (falhas.length) {
  console.error(`\n${falhas.length} verificação(ões) falharam.`);
  process.exit(1);
}
console.log('\nLayout OK em 384×832.');
process.exit(0);
