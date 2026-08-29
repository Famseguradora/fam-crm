// Desenha o icone do FAM Financeiro (fam-financeiro.ico) sem biblioteca nenhuma.
// E o mesmo "F" do logo do CRM: quadrado de cantos arredondados, degrade azul da
// FAM, letra branca. O atalho da area de trabalho e o do menu Iniciar apontam
// para ele · icone generico de HTML e o que faz o sistema parecer um arquivo
// solto em vez de um programa.
// Uso: node fam-financeiro/gerar-icone.cjs
const fs = require('node:fs');
const path = require('node:path');

const TAMANHOS = [16, 24, 32, 48, 64, 128, 256];

/* cores do logo do CRM (app/globals.css): degrade 145deg de #4d84e6 para #2f63c4 */
const DE = [0x4d, 0x84, 0xe6];
const PARA = [0x2f, 0x63, 0xc4];

/* O "F", em coordenadas de 0 a 1 · o mesmo desenho em qualquer tamanho. */
const BARRAS = [
  [0.295, 0.225, 0.435, 0.785],   // haste
  [0.295, 0.225, 0.735, 0.350],   // barra de cima
  [0.295, 0.440, 0.660, 0.560],   // barra do meio
];

/* Ponto dentro do quadrado de cantos arredondados? O canto e um circulo de
   raio r: fora dele, so conta o que estiver dentro da distancia. */
function dentroDoQuadrado(x, y, n){
  const r = n * 0.225;
  const cx = Math.min(Math.max(x, r), n - r);
  const cy = Math.min(Math.max(y, r), n - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

const dentroDoF = (x, y, n) =>
  BARRAS.some(([a, b, c, d]) => x >= a * n && x <= c * n && y >= b * n && y <= d * n);

/* Uma passada de 4x4 por pixel: e o que tira a escada da borda do arredondado
   e da letra. Sem isso o icone de 16px fica ilegivel. */
function desenhar(n){
  const px = Buffer.alloc(n * n * 4);
  const AM = 4;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      let fundo = 0, letra = 0;
      for (let sy = 0; sy < AM; sy++) for (let sx = 0; sx < AM; sx++) {
        const px1 = x + (sx + 0.5) / AM, py1 = y + (sy + 0.5) / AM;
        if (!dentroDoQuadrado(px1, py1, n)) continue;
        fundo++;
        if (dentroDoF(px1, py1, n)) letra++;
      }
      const total = AM * AM;
      const alfa = Math.round(255 * fundo / total);
      /* o degrade anda na diagonal, como o do CRM */
      const t = Math.min(1, Math.max(0, (x / n + y / n) / 2));
      const base = [0, 1, 2].map(i => Math.round(DE[i] + (PARA[i] - DE[i]) * t));
      const mistura = letra / total;
      const cor = base.map(c => Math.round(c + (255 - c) * Math.min(1, mistura * (total / Math.max(1, fundo)))));
      const o = (y * n + x) * 4;
      px[o] = cor[2]; px[o + 1] = cor[1]; px[o + 2] = cor[0]; px[o + 3] = alfa;   // BGRA
    }
  }
  return px;
}

/* BITMAPINFOHEADER + pixels de baixo para cima + mascara AND (zerada: quem
   manda na transparencia e o canal alfa dos 32 bits). */
function imagemBMP(n, px){
  const cab = Buffer.alloc(40);
  cab.writeUInt32LE(40, 0);
  cab.writeInt32LE(n, 4);
  cab.writeInt32LE(n * 2, 8);      // altura dobrada: XOR + AND
  cab.writeUInt16LE(1, 12);
  cab.writeUInt16LE(32, 14);
  cab.writeUInt32LE(0, 16);        // BI_RGB
  cab.writeUInt32LE(n * n * 4, 20);

  const xor = Buffer.alloc(n * n * 4);
  for (let y = 0; y < n; y++)
    px.copy(xor, (n - 1 - y) * n * 4, y * n * 4, (y + 1) * n * 4);

  const linha = Math.ceil(n / 32) * 4;      // 1 bit por pixel, linha alinhada em 4 bytes
  const and = Buffer.alloc(linha * n);
  return Buffer.concat([cab, xor, and]);
}

const imagens = TAMANHOS.map(n => ({ n, dados: imagemBMP(n, desenhar(n)) }));

const dir = Buffer.alloc(6 + 16 * imagens.length);
dir.writeUInt16LE(0, 0);
dir.writeUInt16LE(1, 2);                     // 1 = icone
dir.writeUInt16LE(imagens.length, 4);
let offset = dir.length;
imagens.forEach((im, i) => {
  const o = 6 + i * 16;
  dir.writeUInt8(im.n >= 256 ? 0 : im.n, o);       // 0 quer dizer 256
  dir.writeUInt8(im.n >= 256 ? 0 : im.n, o + 1);
  dir.writeUInt8(0, o + 2);
  dir.writeUInt8(0, o + 3);
  dir.writeUInt16LE(1, o + 4);
  dir.writeUInt16LE(32, o + 6);
  dir.writeUInt32LE(im.dados.length, o + 8);
  dir.writeUInt32LE(offset, o + 12);
  offset += im.dados.length;
});

const destino = path.join(__dirname, 'fam-financeiro.ico');
fs.writeFileSync(destino, Buffer.concat([dir, ...imagens.map(i => i.dados)]));
console.log('gravado ' + destino + ' · ' + TAMANHOS.join('/') + 'px · ' +
  Math.round(fs.statSync(destino).size / 1024) + ' KB');
