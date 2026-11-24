import { describe, expect, it } from 'vitest';
import type { ExerciseSet, SnapshotItem, StatusSessao, TipoExercicio, UnidadeCarga, WorkoutSession } from './db/types';
import { compararPontos, exerciciosComSeries, pontoNaSessao, pontosDoExercicio, porMedida, recordes, totaisTreino, treinoAnterior, variacaoPct } from './evolucao';

const item = (exerciseId: string, tipo: TipoExercicio = 'carga', unidadeCarga: UnidadeCarga = 'kg', porLado = false) =>
  ({ exerciseId, nome: exerciseId, tipo, unidadeCarga, porLado, grupoPrincipal: 'peito' }) as SnapshotItem;
const sessao = (id: string, dia: number, itens: SnapshotItem[], status: StatusSessao = 'concluida') =>
  ({ id, status, iniciadaEm: new Date(2026, 0, dia, 10).toISOString(), planSnapshot: { itens } }) as never;
let n = 0;
const set = (sessionId: string, exerciseId: string, carga: number | null, reps: number) =>
  ({ id: String(++n), sessionId, exerciseId, carga, reps }) as ExerciseSet;
const porSessao = (sets: ExerciseSet[]) => {
  const m = new Map<string, ExerciseSet[]>();
  for (const s of sets) m.set(s.sessionId, [...(m.get(s.sessionId) ?? []), s]);
  return m;
};

describe('volume e carga por sessão', () => {
  it('kg: carga máxima (com as reps dessa série) e volume = soma(carga × reps)', () => {
    const sets = porSessao([set('a', 'sup', 40, 12), set('a', 'sup', 45, 10), set('a', 'sup', 45, 8)]);
    const [p] = pontosDoExercicio('sup', [sessao('a', 5, [item('sup')])], sets);
    expect(p).toMatchObject({ medida: 'kg', cargaMax: 45, repsNaCargaMax: 10, volume: 40 * 12 + 45 * 10 + 45 * 8, reps: 30 });
  });

  it('placa: progressão de placa, sem volume em kg', () => {
    const sets = porSessao([set('a', 'leg', 7, 12), set('a', 'leg', 8, 10)]);
    const [p] = pontosDoExercicio('leg', [sessao('a', 5, [item('leg', 'carga', 'placa')])], sets);
    expect(p).toMatchObject({ medida: 'placa', cargaMax: 8, volume: null });
    expect(recordes('placa', [p!]).map((r) => r.rotulo)).toEqual(['Maior carga']);
  });

  it('peso corporal: total de reps, porLado conta × 2, sem carga nem volume', () => {
    const sets = porSessao([set('a', 'bird', null, 10), set('a', 'bird', null, 8)]);
    const [p] = pontosDoExercicio('bird', [sessao('a', 5, [item('bird', 'peso_corporal', 'kg', true)])], sets);
    expect(p).toMatchObject({ medida: 'peso_corporal', reps: 36, cargaMax: null, volume: null });
    const [semLado] = pontosDoExercicio('bird', [sessao('a', 5, [item('bird', 'peso_corporal')])], sets);
    expect(semLado!.reps).toBe(18);
  });

  it('tempo: maior tempo de uma série, sem volume', () => {
    const sets = porSessao([set('a', 'prancha', null, 30), set('a', 'prancha', null, 45)]);
    const [p] = pontosDoExercicio('prancha', [sessao('a', 5, [item('prancha', 'tempo')])], sets);
    expect(p).toMatchObject({ medida: 'tempo', tempoMax: 45, volume: null });
  });

  it('ordem cronológica; ativas e sessões sem séries do exercício ficam fora; abandonadas com séries entram', () => {
    const sessoes = [
      sessao('c', 9, [item('sup')], 'em_andamento'),
      sessao('b', 7, [item('sup')], 'abandonada'),
      sessao('a', 5, [item('sup')]),
      sessao('d', 8, [item('sup')]),
    ];
    const sets = porSessao([set('a', 'sup', 40, 10), set('b', 'sup', 42, 10), set('c', 'sup', 50, 10)]);
    expect(pontosDoExercicio('sup', sessoes, sets).map((p) => p.sessionId)).toEqual(['a', 'b']);
  });
});

describe('recordes por unidade', () => {
  it('kg: maior carga e maior volume podem ser de treinos diferentes; empate fica com o primeiro', () => {
    const sessoes = [sessao('a', 5, [item('sup')]), sessao('b', 7, [item('sup')]), sessao('c', 9, [item('sup')])];
    const sets = porSessao([
      set('a', 'sup', 50, 5),
      set('b', 'sup', 40, 12), set('b', 'sup', 40, 12),
      set('c', 'sup', 50, 6),
    ]);
    expect(recordes('kg', pontosDoExercicio('sup', sessoes, sets))).toEqual([
      { rotulo: 'Maior carga', valor: 50, reps: 5, data: new Date(2026, 0, 5, 10).toISOString() },
      { rotulo: 'Maior volume', valor: 960, data: new Date(2026, 0, 7, 10).toISOString() },
    ]);
  });

  it('exercício que mudou de kg para placa: recordes separados, sem comparar unidades', () => {
    const sessoes = [sessao('a', 5, [item('rem')]), sessao('b', 7, [item('rem', 'carga', 'placa')])];
    const sets = porSessao([set('a', 'rem', 30, 10), set('b', 'rem', 9, 10)]);
    const grupos = porMedida(pontosDoExercicio('rem', sessoes, sets));
    expect([...grupos.keys()]).toEqual(['kg', 'placa']);
    expect(recordes('kg', grupos.get('kg')!)[0]!.valor).toBe(30);
    expect(recordes('placa', grupos.get('placa')!)[0]!.valor).toBe(9);
  });

  it('peso corporal: recorde de mais repetições numa sessão', () => {
    const it2 = item('bird', 'peso_corporal', 'kg', true);
    const sets = porSessao([set('a', 'bird', null, 10), set('b', 'bird', null, 12)]);
    expect(recordes('peso_corporal', pontosDoExercicio('bird', [sessao('a', 5, [it2]), sessao('b', 7, [it2])], sets))).toMatchObject([
      { rotulo: 'Mais repetições numa sessão', valor: 24 },
    ]);
  });
});

describe('lista de exercícios com séries', () => {
  it('mais recente primeiro, contando treinos; nome atual ou o do snapshot se excluído', () => {
    const sessoes = [sessao('a', 5, [item('sup'), item('old')]), sessao('b', 7, [item('sup')]), sessao('c', 9, [item('ext')], 'em_andamento')];
    const sets = porSessao([set('a', 'sup', 40, 10), set('a', 'old', 10, 10), set('b', 'sup', 40, 10), set('c', 'ext', 40, 10)]);
    const lista = exerciciosComSeries(sessoes, sets, new Map([['sup', 'Supino máquina']]));
    expect(lista.map((e) => [e.nome, e.sessoes])).toEqual([['Supino máquina', 2], ['old', 1]]);
  });
});

describe('comparação com o treino anterior da ficha', () => {
  const ponto = (id: string, it: SnapshotItem, sets: ExerciseSet[]) => pontoNaSessao(it.exerciseId, sessao(id, 5, [it]), sets);

  it('kg: carga máxima e volume, com sinal', () => {
    const it2 = item('sup');
    const antes = ponto('a', it2, [set('a', 'sup', 40, 10), set('a', 'sup', 40, 10)]);
    const agora = ponto('b', it2, [set('b', 'sup', 42.5, 10), set('b', 'sup', 40, 8)]);
    expect(compararPontos(agora, antes)).toEqual({ anterior: '40 kg × 10 · volume 800 kg', mudanca: 'carga +2,5 kg · volume −55 kg' });
  });

  it('placa e peso corporal; mesma marca vira "igual"', () => {
    const pl = item('leg', 'carga', 'placa');
    expect(compararPontos(ponto('b', pl, [set('b', 'leg', 8, 10)]), ponto('a', pl, [set('a', 'leg', 8, 12)]))).toEqual({
      anterior: 'placa 8 × 12', mudanca: 'placa igual',
    });
    const pc = item('bird', 'peso_corporal', 'kg', true);
    expect(compararPontos(ponto('b', pc, [set('b', 'bird', null, 12)]), ponto('a', pc, [set('a', 'bird', null, 10)]))!.mudanca).toBe('reps +4');
  });

  it('unidade diferente não compara; sem séries em um dos treinos não há comparação', () => {
    const c = compararPontos(ponto('b', item('rem', 'carga', 'placa'), [set('b', 'rem', 9, 10)]), ponto('a', item('rem'), [set('a', 'rem', 30, 10)]));
    expect(c).toEqual({ anterior: '30 kg × 10 · volume 300 kg', mudanca: null });
    expect(compararPontos(null, ponto('a', item('rem'), [set('a', 'rem', 30, 10)]))).toBeNull();
  });

  it('treino anterior = concluído mais recente da mesma ficha antes deste; abandonados e outras fichas não contam', () => {
    const s = (id: string, planId: string, dia: number, status: StatusSessao = 'concluida') =>
      ({ id, planId, status, iniciadaEm: new Date(2026, 0, dia, 10).toISOString(), planSnapshot: { itens: [] } }) as unknown as WorkoutSession;
    const lista = [s('a', 'seg', 5), s('b', 'seg', 12, 'abandonada'), s('c', 'ter', 13), s('d', 'seg', 19), s('e', 'seg', 26)];
    expect(treinoAnterior(lista, lista[3]!)?.id).toBe('a');
    expect(treinoAnterior(lista, lista[0]!)).toBeUndefined();
  });
});

describe('comparação com o treino anterior (0.23.0)', () => {
  it('totais: carga e volume só em kg; repetições de todos os tipos com porLado × 2; tempo fora das reps', () => {
    const itens = [item('sup'), item('leg', 'carga', 'placa'), item('bird', 'peso_corporal', 'kg', true), item('prancha', 'tempo')];
    const sets = [set('a', 'sup', 40, 10), set('a', 'sup', 45, 8), set('a', 'leg', 7, 12), set('a', 'bird', null, 10), set('a', 'prancha', null, 60)];
    expect(totaisTreino(sets, itens)).toEqual({ cargaKg: 85, volumeKg: 760, reps: 10 + 8 + 12 + 20 });
    expect(totaisTreino([set('b', 'bird', null, 5)], itens)).toEqual({ cargaKg: null, volumeKg: null, reps: 10 });
  });

  it('variação em %: "+4%", "−2%", "igual"; sem base, null', () => {
    expect(variacaoPct(104, 100)).toBe('+4%');
    expect(variacaoPct(98, 100)).toBe('−2%');
    expect(variacaoPct(100.2, 100)).toBe('igual');
    expect(variacaoPct(10, 0)).toBeNull();
  });
});
