export const MAX_LADO = 1024;

/** Dimensões que cabem em max×max mantendo a proporção; nunca amplia. */
export function fitWithin(largura: number, altura: number, max = MAX_LADO) {
  const escala = Math.min(1, max / Math.max(largura, altura));
  return { largura: Math.max(1, Math.round(largura * escala)), altura: Math.max(1, Math.round(altura * escala)) };
}

export interface ImagemRedimensionada {
  blob: Blob;
  mimeType: string;
  largura: number;
  altura: number;
}

const toBlob = (canvas: HTMLCanvasElement, tipo: string, qualidade: number) =>
  new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, tipo, qualidade));

/**
 * Redimensiona no canvas para no máximo 1024 px no maior lado e reencoda em WebP 0.8
 * (JPEG 0.8 se o navegador não gerar WebP). O arquivo original nunca é devolvido.
 * createImageBitmap aplica a orientação EXIF de fotos da câmera.
 */
export async function resizeImage(file: Blob): Promise<ImagemRedimensionada> {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => {
    throw new Error('Não foi possível ler a imagem');
  });
  const { largura, altura } = fitWithin(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = largura;
  canvas.height = altura;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  ctx.drawImage(bitmap, 0, 0, largura, altura);
  bitmap.close?.();

  // Navegador sem encoder WebP devolve PNG (ou null); aí usamos JPEG.
  let blob = await toBlob(canvas, 'image/webp', 0.8);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, 'image/jpeg', 0.8);
  if (!blob) throw new Error('Falha ao converter a imagem');
  return { blob, mimeType: blob.type, largura, altura };
}
