import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '../../db/db';
import { abrir } from '../../test/abrir';
import { bodyMeasurementsRepository as medidas } from '../../db/repositories/bodyMeasurements';
import { bodyPhotosRepository as fotos } from '../../db/repositories/bodyPhotos';
import { DESFAZER_MS } from '../../medidas';

const HOJE = new Date(2026, 0, 14, 10);
const medir = (data: string, pesoKg: number) => medidas.registrar({ data, pesoKg, cinturaCm: null, observacoes: '' });
const blob = (n = 100) => new Blob([new Uint8Array(n)], { type: 'image/webp' });

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(HOJE);
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  await db.delete();
  await db.open();
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('fotos corporais (repositório)', () => {
  it('remover: soft delete com o blob esvaziado', async () => {
    const m = await medir('2026-01-14', 84);
    const f = await fotos.adicionar(m.id, blob());
    await medidas.salvar(m.id, { data: m.data, pesoKg: 84, cinturaCm: null, observacoes: '' }, { novas: [], removidas: [f.id] });
    const salva = (await db.bodyPhotos.get(f.id))!;
    expect(salva.deletedAt).not.toBeNull();
    expect(salva.blob.size).toBe(0);
    expect(await fotos.daMedicao(m.id)).toHaveLength(0);
  });

  it('excluir a medição: fotos mantêm o blob durante o desfazer e são esvaziadas depois do prazo', async () => {
    const m = await medir('2026-01-14', 84);
    const f = await fotos.adicionar(m.id, blob());
    const removida = await fotos.adicionar(m.id, blob());
    await fotos.remover(removida.id);
    const exclusao = await medidas.excluir(m.id);
    expect(exclusao.fotos).toEqual([f.id]);
    expect((await db.bodyPhotos.get(f.id))!.blob.size).toBe(100);

    // Desfazer restaura a medição e só as fotos daquela exclusão.
    await medidas.restaurar(exclusao);
    expect((await fotos.daMedicao(m.id)).map((x) => x.id)).toEqual([f.id]);

    await medidas.excluir(m.id);
    expect(await fotos.esvaziarExcluidas()).toBe(0); // ainda no prazo
    expect(await fotos.esvaziarExcluidas(Date.now() + DESFAZER_MS + 1)).toBe(1);
    expect((await db.bodyPhotos.get(f.id))!.blob.size).toBe(0);
  });
});

describe('fotos corporais (telas)', () => {
  it('adicionar no editor grava a foto redimensionada, nunca o original', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: 3000, height: 4000, close() {} })));
    const canvas = { width: 0, height: 0, getContext: () => ({ drawImage() {} }), toBlob: (cb: (b: Blob) => void, t: string) => cb(new Blob(['r'], { type: t })) };
    const criar = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => (tag === 'canvas' ? (canvas as unknown as HTMLElement) : criar(tag)));
    const m = await medir('2026-01-14', 84);
    abrir(`/medidas/${m.id}`);
    const original = new File([new Uint8Array(5000)], 'foto.jpg', { type: 'image/jpeg' });
    fireEvent.change(await screen.findByLabelText('Arquivo da foto corporal'), { target: { files: [original] } });
    expect(await screen.findByRole('button', { name: 'Remover foto 1' })).toBeInTheDocument();
    expect(screen.getByTestId('aviso-fotos')).toHaveTextContent('não entram no backup');
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(async () => expect(await fotos.daMedicao(m.id)).toHaveLength(1));
    const [salva] = await fotos.daMedicao(m.id);
    expect(salva!.blob.type).toBe('image/webp');
    expect(salva!.blob.size).toBe(1);
    expect([canvas.width, canvas.height]).toEqual([768, 1024]);
  });

  it('lista e comparação: fotos desfocadas até "Mostrar fotos"; comparação lado a lado', async () => {
    const a = await medir('2026-01-01', 86);
    const b = await medir('2026-01-14', 84);
    await fotos.adicionar(a.id, blob());
    await fotos.adicionar(b.id, blob());
    const { router } = abrir('/medidas');
    const lista = await screen.findAllByTestId('foto-corporal');
    expect(lista).toHaveLength(2);
    lista.forEach((f) => expect(f).toHaveAttribute('data-desfocada'));
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar fotos' }));
    screen.getAllByTestId('foto-corporal').forEach((f) => expect(f).not.toHaveAttribute('data-desfocada'));

    fireEvent.click(screen.getByRole('link', { name: 'Comparar fotos' }));
    await waitFor(() => expect(router.state.location.pathname).toBe('/medidas/comparar'));
    // Nova tela: desfocadas de novo.
    expect(await screen.findAllByTestId('foto-corporal')).toHaveLength(2);
    screen.getAllByTestId('foto-corporal').forEach((f) => expect(f).toHaveAttribute('data-desfocada'));
    expect(screen.getByLabelText('Medição da esquerda')).toHaveDisplayValue('01/01/2026');
    expect(screen.getByLabelText('Medição da direita')).toHaveDisplayValue('14/01/2026');
    fireEvent.click(screen.getByRole('button', { name: 'Mostrar fotos' }));
    fireEvent.click(within(screen.getByRole('region', { name: 'Antes' })).getByRole('button', { name: /Ampliar foto 1 de 01\/01\/2026/ }));
    expect(await screen.findByRole('button', { name: 'Fechar foto' })).toBeInTheDocument();
  });

  it('excluir medição com foto pela tela: esvazia o blob ao fim do prazo do desfazer', async () => {
    const m = await medir('2026-01-14', 84);
    const f = await fotos.adicionar(m.id, blob());
    abrir(`/medidas/${m.id}`);
    fireEvent.click(await screen.findByRole('button', { name: /Excluir medida/ }));
    const dialogo = await screen.findByRole('dialog');
    expect(dialogo).toHaveTextContent('as fotos dela');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Excluir medida' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Medida excluída');
    expect((await db.bodyPhotos.get(f.id))!.blob.size).toBe(100);
    await act(() => fotos.esvaziarExcluidas(Date.now() + DESFAZER_MS + 1));
    expect((await db.bodyPhotos.get(f.id))!.blob.size).toBe(0);
  });
});
