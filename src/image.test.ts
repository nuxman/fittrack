import { afterEach, describe, expect, it, vi } from 'vitest';
import { fitWithin, resizeImage } from './image';

describe('fitWithin', () => {
  it('reduz pelo maior lado mantendo proporção', () => {
    expect(fitWithin(4000, 3000)).toEqual({ largura: 1024, altura: 768 });
    expect(fitWithin(3000, 4000)).toEqual({ largura: 768, altura: 1024 });
    expect(fitWithin(4080, 3060)).toEqual({ largura: 1024, altura: 768 });
  });
  it('não amplia imagem pequena', () => {
    expect(fitWithin(640, 480)).toEqual({ largura: 640, altura: 480 });
    expect(fitWithin(1024, 1024)).toEqual({ largura: 1024, altura: 1024 });
  });
});

describe('resizeImage (canvas simulado)', () => {
  afterEach(() => vi.unstubAllGlobals());

  function simular(suportaWebp: boolean, w = 4000, h = 3000) {
    const drawImage = vi.fn();
    const close = vi.fn();
    vi.stubGlobal('createImageBitmap', vi.fn(async () => ({ width: w, height: h, close })));
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toBlob: (cb: (b: Blob) => void, tipo: string) =>
        cb(new Blob(['x'], { type: tipo === 'image/webp' && !suportaWebp ? 'image/png' : tipo })),
    };
    vi.spyOn(document, 'createElement').mockReturnValueOnce(canvas as unknown as HTMLCanvasElement);
    return { canvas, drawImage, close };
  }

  it('gera WebP de no máximo 1024 px e nunca devolve o arquivo original', async () => {
    const { canvas, drawImage, close } = simular(true);
    const original = new File([new Uint8Array(5_000_000)], 'foto.jpg', { type: 'image/jpeg' });
    const r = await resizeImage(original);
    expect(r).toMatchObject({ mimeType: 'image/webp', largura: 1024, altura: 768 });
    expect([canvas.width, canvas.height]).toEqual([1024, 768]);
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1024, 768);
    expect(r.blob).not.toBe(original);
    expect(close).toHaveBeenCalled();
  });

  it('sem suporte a WebP, usa JPEG', async () => {
    simular(false, 1200, 1600);
    const r = await resizeImage(new Blob(['x']));
    expect(r).toMatchObject({ mimeType: 'image/jpeg', largura: 768, altura: 1024 });
  });

  it('arquivo ilegível gera erro amigável', async () => {
    vi.stubGlobal('createImageBitmap', vi.fn(async () => { throw new Error('decode'); }));
    await expect(resizeImage(new Blob(['x']))).rejects.toThrow('Não foi possível ler a imagem');
  });
});
