// Ícones em SVG (criados por código; nada de arquivo externo nem innerHTML).

const NS = 'http://www.w3.org/2000/svg';

const CAMINHOS = {
  busca: [
    ['circle', { cx: '11', cy: '11', r: '7' }],
    ['path', { d: 'M16.5 16.5 21 21' }],
  ],
  ajustes: [
    ['path', { d: 'M4 7h16' }],
    ['path', { d: 'M4 12h16' }],
    ['path', { d: 'M4 17h16' }],
    ['circle', { cx: '9', cy: '7', r: '2' }],
    ['circle', { cx: '15', cy: '12', r: '2' }],
    ['circle', { cx: '8', cy: '17', r: '2' }],
  ],
  fechar: [
    ['path', { d: 'M6 6 18 18' }],
    ['path', { d: 'M18 6 6 18' }],
  ],
  mais: [
    ['circle', { cx: '5', cy: '12', r: '1.4', preenchido: true }],
    ['circle', { cx: '12', cy: '12', r: '1.4', preenchido: true }],
    ['circle', { cx: '19', cy: '12', r: '1.4', preenchido: true }],
  ],
  seta: [
    ['path', { d: 'M9 6l6 6-6 6' }],
  ],
  mais_simples: [
    ['path', { d: 'M12 5v14' }],
    ['path', { d: 'M5 12h14' }],
  ],
  feitas: [
    ['circle', { cx: '12', cy: '12', r: '8.5' }],
    ['path', { d: 'M8.5 12.2l2.4 2.4 4.6-5' }],
  ],
  calendario: [
    ['path', { d: 'M5 7.5a1.5 1.5 0 0 1 1.5-1.5h11A1.5 1.5 0 0 1 19 7.5v10a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 17.5z' }],
    ['path', { d: 'M5 10.5h14' }],
    ['path', { d: 'M9 4v4' }],
    ['path', { d: 'M15 4v4' }],
  ],
  externo: [
    ['path', { d: 'M14 5h5v5' }],
    ['path', { d: 'M19 5l-7 7' }],
    ['path', { d: 'M18 13v5a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5' }],
  ],
};

export function icone(nome, { tamanho = 20 } = {}) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(tamanho));
  svg.setAttribute('height', String(tamanho));
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.setAttribute('class', 'icone-svg');
  const formas = CAMINHOS[nome] || [];
  for (const [tag, attrs] of formas) {
    const forma = document.createElementNS(NS, tag);
    for (const [chave, valor] of Object.entries(attrs)) {
      if (chave === 'preenchido') {
        forma.setAttribute('fill', 'currentColor');
        forma.setAttribute('stroke', 'none');
      } else {
        forma.setAttribute(chave, valor);
      }
    }
    svg.appendChild(forma);
  }
  return svg;
}
