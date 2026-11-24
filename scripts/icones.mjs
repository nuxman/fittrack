// Gera os ícones PNG do app (192, 512, maskable 512 e apple-touch-icon 180) a partir do desenho do favicon.svg
// (haltere dourado sobre fundo escuro), sem dependências: retângulos num buffer RGBA e PNG com o zlib do Node.
// Uso: node scripts/icones.mjs  (grava em public/; os arquivos ficam no repositório)
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';

const FUNDO = [0x0a, 0x0a, 0x0a];
const OURO = [0xfb, 0xbf, 0x24];
// Mesmo desenho do favicon.svg (viewBox 64×64): [x, y, largura, altura].
const HALTERE = [[10, 26, 6, 12], [16, 22, 6, 20], [42, 22, 6, 20], [48, 26, 6, 12], [22, 29, 20, 6]];

const crcTabela = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTabela[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
const bloco = (tipo, dados) => {
  const t = Buffer.from(tipo, 'ascii');
  const len = Buffer.alloc(4);
  len.writeUInt32BE(dados.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, dados])));
  return Buffer.concat([len, t, dados, crc]);
};

/** `escala`: fração do lado ocupada pela área de 64×64 do desenho (maskable: menor, para caber na zona segura). */
function png(lado, escala) {
  const px = Buffer.alloc(lado * lado * 3);
  for (let i = 0; i < lado * lado; i++) px.set(FUNDO, i * 3);
  const s = (lado * escala) / 64;
  const margem = (lado - 64 * s) / 2;
  for (const [x, y, w, h] of HALTERE) {
    const x0 = Math.round(margem + x * s), x1 = Math.round(margem + (x + w) * s);
    const y0 = Math.round(margem + y * s), y1 = Math.round(margem + (y + h) * s);
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) px.set(OURO, (yy * lado + xx) * 3);
  }
  // Cada linha começa com o byte de filtro 0.
  const linhas = Buffer.alloc(lado * (lado * 3 + 1));
  for (let y = 0; y < lado; y++) px.copy(linhas, y * (lado * 3 + 1) + 1, y * lado * 3, (y + 1) * lado * 3);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(lado, 0);
  ihdr.writeUInt32BE(lado, 4);
  ihdr[8] = 8; // 8 bits
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), bloco('IHDR', ihdr), bloco('IDAT', deflateSync(linhas, { level: 9 })), bloco('IEND', Buffer.alloc(0))]);
}

const ICONES = [
  ['pwa-192.png', 192, 1],
  ['pwa-512.png', 512, 1],
  // Maskable: o sistema recorta em círculo ou gota; o desenho fica nos 80% centrais.
  ['pwa-maskable-512.png', 512, 0.8],
  ['apple-touch-icon.png', 180, 0.9],
];
for (const [nome, lado, escala] of ICONES) writeFileSync(new URL(`../public/${nome}`, import.meta.url), png(lado, escala));
console.log(`Ícones gravados em public/: ${ICONES.map(([n]) => n).join(', ')}`);
