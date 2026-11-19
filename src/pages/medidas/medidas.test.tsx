import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import { abrir } from '../../test/abrir';
import { bodyMeasurementsRepository as medidas } from '../../db/repositories/bodyMeasurements';
import { settingsRepository } from '../../db/repositories/settings';
import { resumoPeso, textoMeta, textoVariacao } from '../../medidas';

// O Recharts mede o contêiner com ResizeObserver, que o jsdom não tem.
class ResizeObserverFalso {
  observe() {}
  unobserve() {}
  disconnect() {}
}

// Quarta-feira, 14 de janeiro de 2026, 10h.
const HOJE = new Date(2026, 0, 14, 10);
const medir = (data: string, pesoKg: number | null, cinturaCm: number | null = null) => medidas.registrar({ data, pesoKg, cinturaCm, observacoes: '' });
const m = (data: string, pesoKg: number | null, createdAt = `${data}T07:00:00.000Z`) => ({ data, pesoKg, createdAt });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOJE);
  vi.stubGlobal('ResizeObserver', ResizeObserverFalso);
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('peso atual e variação (regras)', () => {
  it('variação com 7 dias', () => {
    expect(resumoPeso([m('2026-01-14', 84.2), m('2026-01-07', 85), m('2026-01-01', 86)])).toMatchObject({
      atual: { pesoKg: 84.2 }, variacao: { kg: -0.8, dias: 7 },
    });
    expect(textoVariacao({ kg: -0.8, dias: 7 })).toBe('−0,8 kg em 7 dias');
  });

  it('com 5 dias (mais próxima de 7 dentro de 4 a 10)', () => {
    expect(resumoPeso([m('2026-01-14', 84.5), m('2026-01-12', 84), m('2026-01-09', 84.2), m('2026-01-01', 86)])!.variacao).toEqual({ kg: 0.3, dias: 5 });
    expect(textoVariacao({ kg: 0.3, dias: 5 })).toBe('+0,3 kg em 5 dias');
    // 6 e 8 dias empatam: fica a mais antiga (8).
    expect(resumoPeso([m('2026-01-14', 84), m('2026-01-08', 85), m('2026-01-06', 86)])!.variacao).toEqual({ kg: -2, dias: 8 });
  });

  it('sem medição entre 4 e 10 dias: só o peso atual', () => {
    expect(resumoPeso([m('2026-01-14', 84), m('2026-01-12', 85), m('2026-01-02', 86)])).toMatchObject({ atual: { pesoKg: 84 }, variacao: null });
    expect(resumoPeso([])).toBeNull();
  });

  it('medição só de cintura não entra no peso', () => {
    const r = resumoPeso([m('2026-01-14', null), m('2026-01-13', 84), m('2026-01-07', null), m('2026-01-06', 85)]);
    expect(r).toMatchObject({ atual: { data: '2026-01-13', pesoKg: 84 }, variacao: { kg: -1, dias: 7 } });
    expect(resumoPeso([m('2026-01-14', null)])).toBeNull();
  });

  it('mesmo dia: vale a registrada por último', () => {
    expect(resumoPeso([m('2026-01-14', 84, '2026-01-14T07:00:00.000Z'), m('2026-01-14', 83.6, '2026-01-14T20:00:00.000Z')])!.atual.pesoKg).toBe(83.6);
  });

  it('meta sem julgamento', () => {
    expect(textoMeta(84.2, 80)).toBe('faltam 4,2 kg para a meta (80 kg)');
    expect(textoMeta(78, 80)).toBe('faltam 2 kg para a meta (80 kg)');
    expect(textoMeta(80, 80)).toBe('meta de 80 kg alcançada');
  });

  it('repositório: pelo menos peso ou cintura; limites; sem data futura', async () => {
    await expect(medir('2026-01-14', null, null)).rejects.toThrow('Informe o peso ou a cintura');
    await expect(medir('2026-01-14', 10)).rejects.toThrow('Peso (kg): de 20 a 400');
    await expect(medir('2026-01-14', null, 20)).rejects.toThrow('Cintura (cm): de 30 a 250');
    await expect(medir('2026-01-15', 80)).rejects.toThrow('A data não pode ser no futuro');
    expect(await medir('2026-01-14', null, 92)).toMatchObject({ pesoKg: null, cinturaCm: 92 });
  });
});

describe('bloco de peso no Início', () => {
  it('sem medições: card "Registrar peso" que abre o formulário', async () => {
    const { router } = abrir('/');
    const bloco = await screen.findByTestId('bloco-peso');
    expect(bloco).toHaveTextContent('Registrar peso');
    fireEvent.click(bloco);
    expect(await screen.findByRole('heading', { name: 'Registrar medida' })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe('/medidas/nova');
  });

  it('peso atual, variação de 7 dias e meta; tocar abre a lista', async () => {
    await medir('2026-01-07', 85);
    await medir('2026-01-14', 84.2, 92);
    await settingsRepository.update({ metaPesoKg: 80 });
    const { router } = abrir('/');
    expect(await screen.findByTestId('peso-atual')).toHaveTextContent('84,2 kg');
    expect(screen.getByTestId('variacao-peso')).toHaveTextContent('−0,8 kg em 7 dias');
    expect(screen.getByTestId('meta-peso')).toHaveTextContent('faltam 4,2 kg para a meta (80 kg)');
    fireEvent.click(screen.getByTestId('bloco-peso'));
    await waitFor(() => expect(router.state.location.pathname).toBe('/medidas'));
  });

  it('excluir a medição reflete no Início; desfazer volta', async () => {
    await medir('2026-01-07', 85);
    const nova = await medir('2026-01-14', 84.2);
    const { router } = abrir(`/medidas/${nova.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Excluir medida/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir medida' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Medida excluída');
    expect(router.state.location.pathname).toBe('/medidas');
    expect(screen.getAllByTestId('item-medida')).toHaveLength(1);

    await act(() => router.navigate('/'));
    expect(await screen.findByTestId('peso-atual')).toHaveTextContent('85 kg');
    expect(screen.queryByTestId('variacao-peso')).not.toBeInTheDocument();

    await medidas.restaurar(nova.id);
    await act(() => router.navigate('/medidas'));
    await act(() => router.navigate('/'));
    expect(await screen.findByTestId('peso-atual')).toHaveTextContent('84,2 kg');
  });

  it('"Desfazer" na lista restaura a medição', async () => {
    const a = await medir('2026-01-14', 84);
    const { router } = abrir(`/medidas/${a.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Excluir medida/ }));
    fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Excluir medida' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Medida excluída');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Desfazer' })));
    expect(await screen.findByTestId('item-medida')).toHaveTextContent('84 kg');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(router.state.location.state).toBeNull();
  });
});

describe('telas de medidas', () => {
  it('registrar com vírgula; lista da mais recente para a mais antiga; editar', async () => {
    await medir('2026-01-07', 85, 93);
    const { router } = abrir('/medidas/nova');
    expect(await screen.findByLabelText('Data')).toHaveValue('2026-01-14');
    fireEvent.change(screen.getByLabelText('Peso (kg)'), { target: { value: '84,3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Registrar medida' }));
    await waitFor(async () => expect(await medidas.list()).toHaveLength(2));
    await act(() => router.navigate('/medidas'));
    const itens = await screen.findAllByTestId('item-medida');
    expect(itens[0]).toHaveTextContent('84,3 kg');
    expect(itens[1]).toHaveTextContent('85 kg · cintura 93 cm');

    fireEvent.click(itens[1]!);
    const cintura = await screen.findByLabelText('Cintura (cm)');
    expect(cintura).toHaveValue('93');
    fireEvent.change(cintura, { target: { value: '92,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect((await screen.findAllByTestId('item-medida'))[1]).toHaveTextContent('cintura 92,5 cm');
  });

  it('sem peso nem cintura: mensagem, sem gravar', async () => {
    abrir('/medidas/nova');
    fireEvent.click(await screen.findByRole('button', { name: 'Registrar medida' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Informe o peso ou a cintura');
    expect(await medidas.list()).toHaveLength(0);
  });

  it('meta de peso em Configurações: salva, aparece no Início e vazio remove', async () => {
    await medir('2026-01-14', 82);
    const { router } = abrir('/configuracoes');
    const campo = await screen.findByLabelText('Meta (kg), opcional');
    fireEvent.change(campo, { target: { value: '79,5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    expect(await screen.findByText('Meta salva.')).toBeInTheDocument();
    expect((await settingsRepository.get()).metaPesoKg).toBe(79.5);
    await act(() => router.navigate('/'));
    expect(await screen.findByTestId('meta-peso')).toHaveTextContent('faltam 2,5 kg para a meta (79,5 kg)');

    await act(() => router.navigate('/configuracoes'));
    fireEvent.change(await screen.findByLabelText('Meta (kg), opcional'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar meta' }));
    expect(await screen.findByText('Meta removida.')).toBeInTheDocument();
    expect((await settingsRepository.get()).metaPesoKg).toBeUndefined();
  });
});

describe('Evolução → Corpo', () => {
  it('gráficos de peso e cintura; cintura com uma medição só explica', async () => {
    await medir('2026-01-05', 85, 93);
    await medir('2026-01-09', 84.6);
    await medir('2026-01-14', 84.2);
    abrir('/evolucao?ver=corpo');
    expect(await screen.findByRole('figure', { name: 'Peso' }, { timeout: 5000 })).toBeInTheDocument();
    const cintura = screen.getByRole('region', { name: 'Cintura' });
    expect(within(cintura).queryByRole('figure')).not.toBeInTheDocument();
    expect(cintura).toHaveTextContent('93 cm em 05/01');
    expect(screen.getByRole('link', { name: /Medidas \(3\)/ })).toHaveAttribute('href', '/medidas');
  });

  it('sem medições: explica e oferece "Registrar medida"', async () => {
    abrir('/evolucao?ver=corpo');
    expect(await screen.findByText(/evolução do seu peso e da cintura/, undefined, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Registrar medida' })).toHaveAttribute('href', '/medidas/nova');
  });
});
