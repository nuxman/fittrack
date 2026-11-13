import { describe, expect, it } from 'vitest';
import type { ExerciseSet } from './db/types';
import {
  ajustarDescanso, descricaoRpe, mudancasNaSessao, exercicioAtual, formatarSerie, parseNumero, restanteSeg, sessaoEsquecida, statusExercicio, tempoAtivoEm, totalReps, volumeKg,
} from './sessao';

let n = 0;
const set = (exerciseId: string, minuto: number): ExerciseSet => ({
  id: String(++n), createdAt: '', updatedAt: '', deletedAt: null, sessionId: 's', exerciseId,
  numeroSerie: 1, carga: 40, reps: 10, lado: null, concluidaEm: new Date(Date.UTC(2026, 0, 1, 10, minuto)).toISOString(),
});
const itens = [
  { exerciseId: 'a', series: 3, ordem: 0 },
  { exerciseId: 'b', series: 2, ordem: 1 },
  { exerciseId: 'c', series: 2, ordem: 2 },
];

describe('leitura e totais da série', () => {
  it('"22,5" e "22.5" são lidos como 22,5; texto inválido vira NaN', () => {
    expect(parseNumero('22,5')).toBe(22.5);
    expect(parseNumero('22.5')).toBe(22.5);
    expect(parseNumero(' 40 ')).toBe(40);
    expect(parseNumero('2,2,5')).toBeNaN();
    expect(parseNumero('-5')).toBeNaN();
    expect(parseNumero('')).toBeNaN();
  });

  it('total de reps de exercício porLado = reps × 2', () => {
    expect(totalReps({ reps: 10 }, { porLado: true })).toBe(20);
    expect(totalReps({ reps: 10 }, { porLado: false })).toBe(10);
    expect(totalReps({ reps: 10 }, {})).toBe(10);
    expect(formatarSerie({ carga: null, reps: 10 }, { tipo: 'peso_corporal', unidadeCarga: 'kg', porLado: true })).toBe('10 por lado');
  });
});

describe('status e exercício para retomar', () => {
  it('status vem só das séries; pulado só enquanto incompleto', () => {
    const sets = [set('a', 1), set('a', 2)];
    expect(statusExercicio(itens[0]!, sets, [])).toBe('parcial');
    expect(statusExercicio(itens[0]!, sets, ['a'])).toBe('pulado');
    expect(statusExercicio(itens[0]!, [...sets, set('a', 3)], ['a'])).toBe('concluido');
    expect(statusExercicio(itens[1]!, sets, [])).toBe('pendente');
  });

  it('primeiro exercício completo: retoma no segundo', () => {
    expect(exercicioAtual(itens, [set('a', 1), set('a', 2), set('a', 3)], [])).toBe('b');
  });

  it('retoma no exercício da última série, se ainda aberto; pula os pulados', () => {
    expect(exercicioAtual(itens, [set('c', 1)], [])).toBe('c');
    expect(exercicioAtual(itens, [], ['a'])).toBe('b');
    expect(exercicioAtual(itens, [set('a', 1), set('a', 2), set('a', 3), set('b', 4), set('b', 5), set('c', 6), set('c', 7)], [])).toBeUndefined();
  });
});

describe('tempo ativo e sessão esquecida', () => {
  const t0 = Date.UTC(2026, 0, 1, 10, 0);
  it('conta só em andamento; pausa congela', () => {
    expect(tempoAtivoEm({ status: 'em_andamento', duracaoAtivaSeg: 100, ativaDesde: t0, pausadaEm: null }, t0 + 60_000)).toBe(160);
    expect(tempoAtivoEm({ status: 'pausada', duracaoAtivaSeg: 100, ativaDesde: null, pausadaEm: t0 }, t0 + 3_600_000)).toBe(100);
    // Instante antes da pausa (finalizar no horário da última série).
    expect(tempoAtivoEm({ status: 'pausada', duracaoAtivaSeg: 100, ativaDesde: null, pausadaEm: t0 }, t0 - 30_000)).toBe(70);
  });

  it('esquecida = mais de 3 h desde a última série ou retomada', () => {
    const s = { iniciadaEm: new Date(t0).toISOString(), ativaDesde: t0 };
    const sets = [set('a', 30)]; // 10:30
    expect(sessaoEsquecida(s, sets, t0 + 30 * 60_000 + 3 * 3_600_000)).toBe(false);
    expect(sessaoEsquecida(s, sets, t0 + 30 * 60_000 + 3 * 3_600_000 + 1)).toBe(true);
  });
});

describe('descanso', () => {
  it('restante e ±15 s', () => {
    expect(restanteSeg(10_500, 0)).toBe(11);
    expect(restanteSeg(null, 0)).toBe(0);
    expect(ajustarDescanso(60_000, 0, 15)).toBe(75_000);
    expect(ajustarDescanso(10_000, 0, -15)).toBeNull();
    expect(ajustarDescanso(null, 1000, 15)).toBe(16_000);
  });
});

describe('volume (último treino no Início)', () => {
  const itens = [
    { exerciseId: 'kg', tipo: 'carga' as const, unidadeCarga: 'kg' as const },
    { exerciseId: 'lado', tipo: 'carga' as const, unidadeCarga: 'kg' as const, porLado: true },
    { exerciseId: 'placa', tipo: 'carga' as const, unidadeCarga: 'placa' as const },
    { exerciseId: 'corpo', tipo: 'peso_corporal' as const, unidadeCarga: 'kg' as const },
  ];
  it('soma carga × reps só em kg; por lado conta reps × 2; placa e peso corporal ficam fora', () => {
    const sets = [
      { exerciseId: 'kg', carga: 40, reps: 10 },
      { exerciseId: 'lado', carga: 10, reps: 12 },
      { exerciseId: 'placa', carga: 7, reps: 12 },
      { exerciseId: 'corpo', carga: null, reps: 15 },
    ];
    expect(volumeKg(sets, itens)).toBe(400 + 240);
    expect(volumeKg(sets.slice(2), itens)).toBeNull();
  });
});

describe('descricaoRpe', () => {
  it('cobre 0 a 10 conforme a spec', () => {
    expect([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(descricaoRpe)).toEqual([
      'Repouso.', 'Muito leve.', 'Muito leve.', 'Leve, dava para fazer muito mais.', 'Leve, dava para fazer muito mais.',
      'Moderado, sobravam 4 ou mais repetições.', 'Moderado, sobravam 4 ou mais repetições.', 'Pesado, sobravam ~3 repetições.',
      'Difícil, sobravam ~2 repetições.', 'Muito difícil, sobrava 1 repetição.', 'Máximo, não saía mais nenhuma.',
    ]);
  });
});

describe('mudancasNaSessao', () => {
  const base = { series: 3, repsMin: 10, repsMax: 12, descansoSeg: 90 };
  const snap = (exerciseId: string, nome: string, ordem: number, extra = {}) => ({
    ...base, exerciseId, nome, ordem, tipo: 'carga' as const, unidadeCarga: 'kg' as const, grupoPrincipal: 'peito' as const, ...extra,
  });
  const iniciais = [{ ...base, exerciseId: 'a', ordem: 0 }, { ...base, exerciseId: 'b', ordem: 1 }];

  it('sem mudanças, lista vazia', () => {
    expect(mudancasNaSessao(iniciais, [snap('a', 'A', 0), snap('b', 'B', 1)])).toEqual([]);
  });

  it('séries, reps e descanso medidos contra o início', () => {
    const r = mudancasNaSessao(iniciais, [snap('a', 'A', 0, { series: 4, repsMax: 15 }), snap('b', 'B', 1, { descansoSeg: 60 })]);
    expect(r.map((m) => m.descricao)).toEqual(['A: séries 3 → 4; reps 10–12 → 10–15', 'B: descanso 90 → 60 s']);
    expect(r[0]!.novo).toEqual({ exerciseId: 'a', series: 4, repsMin: 10, repsMax: 15, descansoSeg: 90 });
  });

  it('troca após N séries: substituto com o total planejado', () => {
    const r = mudancasNaSessao(iniciais, [
      snap('a', 'A', 0, { trocadoApos: 1 }),
      snap('x', 'X', 1, { series: 2, substituiu: { exerciseId: 'a', nome: 'A' } }),
      snap('b', 'B', 2),
    ]);
    expect(r).toEqual([{ exerciseId: 'a', descricao: 'A → X', novo: { exerciseId: 'x', series: 3, repsMin: 10, repsMax: 12, descansoSeg: 90 } }]);
  });
});
