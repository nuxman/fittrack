import { describe, expect, it } from 'vitest';
import type { GrupoMuscular, LocalTreino, StatusSessao } from './db/types';
import { avisoGrupoSeguido, chaveDia, contadorSemana, duracaoEstimadaSeg, inicioSemana, localEscolhido, pendentes, sugestao } from './semana';

// Semana de 2026-01-05 (segunda) a 2026-01-11 (domingo).
const dia = (d: number, h = 10) => new Date(2026, 0, d, h);
const SEG = 5, TER = 6, QUA = 7, QUI = 8, SEX = 9, SAB = 10, DOM = 11;

const ficha = (id: string, diaSemana: number, local?: LocalTreino) => ({ id, diaSemana, ...(local && { local }) });
// Academia segunda a sexta (como o seed; fichas antigas sem local = academia).
const ACADEMIA = [ficha('seg', 1), ficha('ter', 2), ficha('qua', 3), ficha('qui', 4), ficha('sex', 5)];

const sessao = (planId: string, em: Date, { status = 'concluida' as StatusSessao, rpe = 6, grupos = ['peito'] as GrupoMuscular[] } = {}) => ({
  planId, status, rpe, iniciadaEm: em.toISOString(),
  planSnapshot: { itens: grupos.map((grupoPrincipal) => ({ grupoPrincipal })) } as never,
});
const ids = (xs: { id: string }[]) => xs.map((x) => x.id);

describe('semana de segunda a domingo', () => {
  it('domingo pertence à semana que começou na segunda anterior', () => {
    expect(chaveDia(inicioSemana(dia(DOM)))).toBe('2026-01-05');
    expect(chaveDia(inicioSemana(dia(SEG, 0)))).toBe('2026-01-05');
    expect(chaveDia(inicioSemana(dia(12)))).toBe('2026-01-12');
  });
});

describe('regra de sugestão', () => {
  it('semana sem faltas: sugere a ficha de hoje', () => {
    const s = [sessao('seg', dia(SEG)), sessao('ter', dia(TER))];
    expect(pendentes(ACADEMIA, s, 'academia', dia(QUA))).toEqual([]);
    expect(sugestao(ACADEMIA, s, 'academia', dia(QUA))).toEqual({ tipo: 'hoje', plano: ACADEMIA[2] });
  });

  it('falta na terça: na quarta sugere a de terça, com a de hoje como segunda opção', () => {
    const s = [sessao('seg', dia(SEG))];
    expect(sugestao(ACADEMIA, s, 'academia', dia(QUA))).toEqual({ tipo: 'pendente', plano: ACADEMIA[1], opcional: false, hoje: ACADEMIA[2] });
  });

  it('duas faltas: sugere a mais antiga', () => {
    const r = sugestao(ACADEMIA, [], 'academia', dia(QUA));
    expect(ids(pendentes(ACADEMIA, [], 'academia', dia(QUA)))).toEqual(['seg', 'ter']);
    expect(r.tipo === 'pendente' && r.plano.id).toBe('seg');
  });

  it('treino de sexta feito adiantado: não é sugerido nem fica pendente', () => {
    const s = [sessao('seg', dia(SEG)), sessao('ter', dia(TER)), sessao('qua', dia(QUA)), sessao('sex', dia(QUA, 18)), sessao('qui', dia(QUI))];
    expect(sugestao(ACADEMIA, s, 'academia', dia(SEX))).toEqual({ tipo: 'escolher' });
    expect(pendentes(ACADEMIA, s, 'academia', dia(SAB))).toEqual([]);
    expect(sugestao(ACADEMIA, s, 'academia', dia(SAB))).toEqual({ tipo: 'descanso' });
  });

  it('virada de semana zera as pendências', () => {
    expect(ids(pendentes(ACADEMIA, [], 'academia', dia(DOM)))).toHaveLength(5);
    expect(pendentes(ACADEMIA, [], 'academia', dia(12))).toEqual([]); // segunda seguinte
    expect(sugestao(ACADEMIA, [], 'academia', dia(12))).toEqual({ tipo: 'hoje', plano: ACADEMIA[0] });
  });

  it('sessão abandonada não conta', () => {
    const s = [sessao('seg', dia(SEG), { status: 'abandonada' })];
    expect(ids(pendentes(ACADEMIA, s, 'academia', dia(TER)))).toEqual(['seg']);
    expect(contadorSemana(ACADEMIA, s, dia(TER)).feitos).toBe(0);
  });

  it('sábado e domingo: pendentes são opcionais; sem pendentes, dia de descanso', () => {
    const r = sugestao(ACADEMIA, [], 'academia', dia(SAB));
    expect(r).toMatchObject({ tipo: 'pendente', opcional: true });
  });
});

describe('local do treino', () => {
  const CASA = [ficha('casa-ter', 2, 'casa'), ficha('casa-qui', 4, 'casa')];
  const TODAS = [...ACADEMIA, ...CASA];

  it('treino em casa na terça não deixa a ficha de terça da academia pendente', () => {
    const s = [sessao('seg', dia(SEG)), sessao('casa-ter', dia(TER))];
    expect(pendentes(TODAS, s, 'academia', dia(QUA))).toEqual([]);
    expect(sugestao(TODAS, s, 'academia', dia(QUA))).toEqual({ tipo: 'hoje', plano: ACADEMIA[2] });
  });

  it('sugestão considera só as fichas do local escolhido', () => {
    expect(sugestao(TODAS, [], 'casa', dia(QUA))).toMatchObject({ tipo: 'pendente', plano: CASA[0] });
    // Sem ficha de casa para hoje e sem pendentes: escolher entre as fichas de casa.
    expect(sugestao(TODAS, [sessao('casa-ter', dia(TER))], 'casa', dia(QUA))).toEqual({ tipo: 'escolher' });
  });

  it('contador soma treinos dos dois locais; Y conta só dias com ficha de academia', () => {
    const s = [sessao('seg', dia(SEG)), sessao('casa-ter', dia(TER)), sessao('qua', dia(QUA)), sessao('ter', dia(1), {})];
    expect(contadorSemana(TODAS, s, dia(QUA))).toEqual({ feitos: 3, planejados: 5 });
  });

  it('aviso de grupo em dias seguidos cruza locais e exige RPE ≥ 8', () => {
    const casaOntem = [sessao('casa-ter', dia(TER, 19), { rpe: 8, grupos: ['peito', 'costas'] })];
    expect(avisoGrupoSeguido(['peito', 'tríceps'], casaOntem, dia(QUA))).toEqual({ grupos: ['peito'], rpe: 8 });
    expect(avisoGrupoSeguido(['peito'], [sessao('ter', dia(TER), { rpe: 7 })], dia(QUA))).toBeNull();
    expect(avisoGrupoSeguido(['peito'], [sessao('seg', dia(SEG), { rpe: 9 })], dia(QUA))).toBeNull(); // anteontem
    expect(avisoGrupoSeguido(['ombros'], casaOntem, dia(QUA))).toBeNull();
    expect(avisoGrupoSeguido(['peito'], [sessao('ter', dia(TER), { rpe: 9, status: 'abandonada' })], dia(QUA))).toBeNull();
  });

  it('local escolhido vale só para o dia; no dia seguinte volta para academia', () => {
    const s = { interface: { tema: 'escuro' as const, vibrar: true, localHoje: { local: 'casa' as const, data: '2026-01-07' } } };
    expect(localEscolhido(s, dia(QUA))).toBe('casa');
    expect(localEscolhido(s, dia(QUI))).toBe('academia');
    expect(localEscolhido({ interface: { tema: 'escuro', vibrar: true } }, dia(QUA))).toBe('academia');
  });
});

describe('duração estimada', () => {
  const plano = { id: 'p', itens: [{ exerciseId: 'a', series: 3, descansoSeg: 90 }, { exerciseId: 'b', series: 2, descansoSeg: 60 }] };
  const s = (dia: number, seg: number, status: StatusSessao = 'concluida') => ({ planId: 'p', status, iniciadaEm: new Date(2026, 0, dia).toISOString(), duracaoAtivaSeg: seg });
  it('sem histórico: séries × 40 s + descansos planejados', () => {
    expect(duracaoEstimadaSeg(plano, [])).toBe(3 * 130 + 2 * 100);
  });
  it('média das últimas 3 concluídas da ficha (abandonadas fora)', () => {
    expect(duracaoEstimadaSeg(plano, [s(1, 9999), s(2, 3000), s(3, 2400), s(4, 3600), s(5, 1, 'abandonada')])).toBe(3000);
  });
});
