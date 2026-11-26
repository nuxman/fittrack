import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Dexie from 'dexie';
import { gerarDemo } from './demo';
import { buildSeed } from './seed';
import { pontosDoExercicio } from '../evolucao';
import { resumoPeso } from '../medidas';

/** Conteúdo completo de um banco (todas as tabelas, ordenadas por id), aberto pelo nome sem passar pelo app. */
async function despejar(nome: string) {
  const d = new Dexie(nome);
  await d.open();
  const tudo: Record<string, unknown[]> = {};
  for (const t of d.tables) tudo[t.name] = (await t.toArray()).sort((a, b) => String(a.id).localeCompare(String(b.id)));
  d.close();
  return tudo;
}

/** "Recarrega a página": módulos do zero, como o navegador faz depois de entrar ou sair do modo. */
async function abrirApp() {
  vi.resetModules();
  const { db } = await import('./db');
  await db.open();
  return {
    db,
    modo: await import('../modo'),
    planos: (await import('./repositories/workoutPlans')).workoutPlansRepository,
    sessoes: (await import('./repositories/workoutSessions')).workoutSessionsRepository,
    series: (await import('./repositories/exerciseSets')).exerciseSetsRepository,
    demo: (await import('./repositories/demo')).demoRepository,
  };
}

beforeEach(async () => {
  localStorage.clear();
  sessionStorage.clear();
  await Dexie.delete('fittrack');
  await Dexie.delete('fittrack-demo');
});
afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
  sessionStorage.clear();
});

describe('dados fictícios', () => {
  it('cerca de 4 semanas de treinos concluídos até ontem, com cargas subindo e cardio em alguns dias', () => {
    const seed = buildSeed();
    const agora = new Date(2026, 10, 18, 9); // quarta
    const { sessions, sets, cardio, medidas, aparelhos, ligacoes, perfil } = gerarDemo(seed.exercises, seed.workoutPlans, agora);
    expect(sessions.length).toBeGreaterThanOrEqual(18);
    expect(sessions.every((s) => s.status === 'concluida' && s.rpe !== null && s.duracaoAtivaSeg > 600)).toBe(true);
    const hoje = new Date(2026, 10, 18).getTime();
    expect(sessions.every((s) => Date.parse(s.iniciadaEm) < hoje)).toBe(true);
    expect(new Date(sessions[0]!.iniciadaEm).getDay()).toBe(1);
    expect(cardio.length).toBeGreaterThan(0);
    const ligados = cardio.filter((c) => c.sessionId);
    expect(ligados.length).toBeGreaterThan(0);
    expect(ligados.every((c) => sessions.some((s) => s.id === c.sessionId))).toBe(true);
    // Cardio avulso aos sábados (sem treino), antes de hoje.
    const avulsos = cardio.filter((c) => !c.sessionId);
    const sabados = avulsos.filter((c) => new Date(`${c.data}T12:00`).getDay() === 6);
    expect(sabados.map((c) => c.modalidade)).toEqual(['caminhada', 'escada', 'caminhada', 'escada']);
    expect(avulsos.every((c) => c.data < '2026-11-18')).toBe(true);
    // Elíptico avulso nos domingos das semanas pares, com velocidade, distância e nível.
    const elipticos = avulsos.filter((c) => c.modalidade === 'eliptico');
    expect(elipticos).toHaveLength(2);
    expect(elipticos.every((c) => new Date(`${c.data}T12:00`).getDay() === 0 && c.velocidadeKmh! > 0 && c.distanciaKm! > 0 && c.inclinacaoNivel?.rotulo === 'nível 10' && c.andares === undefined)).toBe(true);
    expect(avulsos).toHaveLength(6);
    const escadas = avulsos.filter((c) => c.modalidade === 'escada');
    expect(escadas.every((c) => c.andares! > 0 && c.velocidadeKmh === null && c.distanciaKm === null)).toBe(true);

    // Medidas: ~6 semanas, até hoje, peso e cintura; pelo menos uma a cerca de 7 dias da mais recente.
    expect(medidas.length).toBeGreaterThanOrEqual(11);
    expect(medidas[0]!.data).toBe('2026-10-12');
    expect(medidas.every((m) => m.data <= '2026-11-18' && m.pesoKg! > 70)).toBe(true);
    expect(medidas.filter((m) => m.cinturaCm !== null).length).toBe(6);
    expect(resumoPeso(medidas)!.variacao).not.toBeNull();
    expect(medidas.at(-1)!.pesoKg!).toBeLessThan(medidas[0]!.pesoKg!);

    // Perfil fictício sem foto.
    expect(perfil).toMatchObject({ nome: 'Alex', alturaCm: 178 });
    expect(perfil.foto).toBeUndefined();

    // Aparelhos: 3, ligados a 6 exercícios do seed.
    expect(aparelhos).toHaveLength(3);
    expect(aparelhos.every((a) => a.cor && a.numero)).toBe(true);
    expect(ligacoes).toHaveLength(6);
    expect(ligacoes.every(([e, a]) => seed.exercises.some((x) => x.id === e) && aparelhos.some((x) => x.id === a))).toBe(true);

    const supino = seed.exercises.find((e) => e.nome === 'Supino máquina')!;
    const cargas = pontosDoExercicio(supino.id, sessions, new Map(sessions.map((s) => [s.id, sets.filter((x) => x.sessionId === s.id)])))
      .map((p) => p.cargaMax!);
    expect(cargas.length).toBeGreaterThan(4);
    expect(cargas.at(-1)!).toBeGreaterThan(cargas[0]!);
    expect(cargas.every((c, k) => k === 0 || c >= cargas[k - 1]!)).toBe(true);
  });
});

describe('modo demonstração isolado do banco real', () => {
  it('entrar, criar e abandonar um treino, sair: o banco real continua idêntico', async () => {
    const real = await abrirApp();
    expect(real.db.name).toBe('fittrack');
    const s = await real.sessoes.iniciar((await real.planos.list())[0]!.id);
    await real.series.registrar({ sessionId: s.id, exerciseId: s.planSnapshot.itens[0]!.exerciseId, carga: 40, reps: 10 });
    await real.sessoes.finalizar(s.id, { rpe: 7, observacoes: 'real' });
    const recarga = vi.fn();
    real.modo.pagina.recarregar = recarga;
    await real.demo.entrar();
    expect(recarga).toHaveBeenCalledOnce();
    real.db.close();
    const antes = await despejar('fittrack');

    const demo = await abrirApp();
    expect(demo.db.name).toBe('fittrack-demo');
    expect((await demo.sessoes.list()).length).toBeGreaterThan(10);
    const d = await demo.sessoes.iniciar((await demo.planos.list())[1]!.id);
    await demo.series.registrar({ sessionId: d.id, exerciseId: d.planSnapshot.itens[0]!.exerciseId, carga: 99, reps: 10 });
    await demo.sessoes.abandonar(d.id);
    demo.modo.pagina.recarregar = vi.fn();
    demo.modo.sairDemo();
    demo.db.close();

    const deVolta = await abrirApp();
    expect(deVolta.db.name).toBe('fittrack');
    deVolta.db.close();
    expect(await despejar('fittrack')).toEqual(antes);
  });

  it('Recomeçar apaga e recria só o banco de demonstração; no banco real é recusado', async () => {
    const real = await abrirApp();
    await expect(real.demo.recomecar()).rejects.toThrow('demonstração');
    real.db.close();
    const antes = await despejar('fittrack');

    sessionStorage.setItem('fittrack-modo', 'demo');
    const demo = await abrirApp();
    const s = await demo.sessoes.iniciar((await demo.planos.list())[0]!.id);
    demo.modo.pagina.recarregar = vi.fn();
    await demo.demo.recomecar();
    expect(demo.modo.pagina.recarregar).toHaveBeenCalledOnce();

    const nova = await abrirApp();
    expect(await nova.sessoes.get(s.id)).toBeUndefined();
    expect((await nova.sessoes.list()).every((x) => x.status === 'concluida')).toBe(true);
    nova.db.close();
    expect(await despejar('fittrack')).toEqual(antes);
  });

  it('nova abertura do app (sem a marca da aba) abre o banco real; marca antiga da 0.8.0 em localStorage é ignorada', async () => {
    sessionStorage.setItem('fittrack-modo', 'demo');
    const demo = await abrirApp();
    expect(demo.db.name).toBe('fittrack-demo');
    demo.db.close();

    // Fechar o app apaga o sessionStorage; a 0.8.0 deixava a marca em localStorage.
    sessionStorage.clear();
    localStorage.setItem('fittrack-modo', 'demo');
    const nova = await abrirApp();
    expect(nova.db.name).toBe('fittrack');
    expect(localStorage.getItem('fittrack-modo')).toBeNull();
    nova.db.close();
  });

  it('"Entrar" sempre recria a demonstração com datas atuais, apagando o que foi feito antes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      vi.setSystemTime(new Date(2026, 0, 7, 10));
      sessionStorage.setItem('fittrack-modo', 'demo');
      const velha = await abrirApp();
      const ultimaVelha = (await velha.sessoes.list()).map((x) => x.iniciadaEm).sort().at(-1)!;
      const feita = await velha.sessoes.iniciar((await velha.planos.list())[0]!.id);
      velha.db.close();

      // Dias depois, fora do modo (app fechado), entra de novo.
      vi.setSystemTime(new Date(2026, 1, 18, 10));
      sessionStorage.clear();
      const real = await abrirApp();
      real.modo.pagina.recarregar = vi.fn();
      await real.demo.entrar();
      real.db.close();

      const nova = await abrirApp();
      expect(nova.db.name).toBe('fittrack-demo');
      expect(await nova.sessoes.get(feita.id)).toBeUndefined();
      const ultimaNova = (await nova.sessoes.list()).map((x) => x.iniciadaEm).sort().at(-1)!;
      expect(ultimaNova > ultimaVelha).toBe(true);
      expect(new Date(ultimaNova).getDate()).toBe(17);
      nova.db.close();
    } finally {
      vi.useRealTimers();
    }
  });
});
