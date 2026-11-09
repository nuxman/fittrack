import { describe, expect, it } from 'vitest';
import type { ExerciseSet } from './db/types';
import {
  ajustarDescanso, exercicioAtual, formatarSerie, parseNumero, restanteSeg, sessaoEsquecida, statusExercicio, tempoAtivoEm, totalReps,
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
