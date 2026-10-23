// Bloco de notas livre de cada caixa. Em "Tudo", os quatro blocos em sequência.
// Grava sozinho alguns instantes depois de parar de digitar e ao sair do campo.

import { AREAS, ROTULOS_AREA } from '../logica.js';
import { h, limpar } from './dom.js';

const ESPERA_GRAVAR = 800;

function horaCurta(instante) {
  const d = instante ? new Date(instante) : new Date();
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function criarNotas({ aoLer, aoSalvar }) {
  const raiz = document.getElementById('notas');
  let notas = {};
  const timers = new Map();

  function ajustarAltura(campo) {
    campo.style.height = 'auto';
    campo.style.height = `${Math.max(campo.scrollHeight, 220)}px`;
  }

  async function gravar(area, campo, status) {
    if (timers.has(area)) clearTimeout(timers.get(area));
    timers.delete(area);
    const texto = campo.value;
    if ((notas[area] && notas[area].texto) === texto) return;
    status.textContent = 'gravando…';
    try {
      notas[area] = await aoSalvar(area, texto);
      status.textContent = `guardado às ${horaCurta(notas[area].atualizada_em)}`;
    } catch {
      status.textContent = 'não consegui guardar; tente de novo';
    }
  }

  function bloco(area, { sozinho }) {
    const sec = h('div', { class: `bloco-nota tinta-${area}` });
    if (!sozinho) {
      sec.appendChild(h('h2', { class: 'bloco-nota-titulo', text: ROTULOS_AREA[area] }));
    }
    const campo = h('textarea', {
      class: 'papel',
      'aria-label': `Notas de ${ROTULOS_AREA[area]}`,
      placeholder: sozinho
        ? 'Escreva à vontade: ideias, listas, o que lembrar…'
        : 'Notas desta caixa',
      maxlength: '20000',
      spellcheck: 'true',
    });
    campo.value = (notas[area] && notas[area].texto) || '';
    const status = h('p', { class: 'nota-status', role: 'status' });
    if (notas[area] && notas[area].atualizada_em) {
      status.textContent = `guardado às ${horaCurta(notas[area].atualizada_em)}`;
    }
    campo.addEventListener('input', () => {
      ajustarAltura(campo);
      status.textContent = '';
      if (timers.has(area)) clearTimeout(timers.get(area));
      timers.set(area, setTimeout(() => gravar(area, campo, status), ESPERA_GRAVAR));
    });
    campo.addEventListener('blur', () => gravar(area, campo, status));
    sec.appendChild(campo);
    sec.appendChild(status);
    requestAnimationFrame(() => ajustarAltura(campo));
    return sec;
  }

  async function mostrar(caixa) {
    limpar(raiz);
    try {
      notas = (await aoLer()) || {};
    } catch {
      // sem rede: mostra o que houver
    }
    limpar(raiz);
    const areas = caixa === 'tudo' ? AREAS : [caixa];
    for (const area of areas) {
      raiz.appendChild(bloco(area, { sozinho: areas.length === 1 }));
    }
  }

  return { mostrar };
}
