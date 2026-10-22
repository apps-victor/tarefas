// Campo único de criação, com prévia da interpretação em fichas.

import { interpretar } from '../parser.js';
import {
  ROTULOS_AREA,
  formatarHora,
  rotuloCurto,
} from '../logica.js';
import { h, limpar } from './dom.js';

function novoClientRef() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function textoRepetir(repetir) {
  if (!repetir) return '';
  const n = repetir.intervalo || 1;
  if (repetir.freq === 'diaria') {
    return n > 1 ? `a cada ${n} dias` : 'todo dia';
  }
  if (repetir.freq === 'semanal') {
    return n > 1 ? `a cada ${n} semanas` : 'toda semana';
  }
  return n > 1 ? `a cada ${n} meses` : 'todo mês';
}

function estaDigitando(alvo) {
  if (!alvo || !alvo.tagName) return false;
  const tag = alvo.tagName.toLowerCase();
  return (
    tag === 'input' ||
    tag === 'textarea' ||
    tag === 'select' ||
    alvo.isContentEditable === true
  );
}

export function criarBarra({ aoCriar, obterHoje, aoAviso }) {
  const form = document.getElementById('form-criar');
  const input = document.getElementById('nova-tarefa');
  const previa = document.getElementById('previa');
  let ultima = null;
  let valorUltimo = '';
  let enviando = false;

  function lerAgora() {
    const valor = input.value;
    if (!valor.trim()) {
      ultima = null;
      valorUltimo = '';
      limpar(previa);
      previa.hidden = true;
      return null;
    }
    ultima = interpretar(valor, obterHoje());
    valorUltimo = valor;
    desenharPrevia(ultima, valor);
    return ultima;
  }

  function removerTrecho(tipo) {
    if (!ultima || !ultima.trechos || !ultima.trechos[tipo]) return;
    const [ini, fim] = ultima.trechos[tipo];
    const atual = input.value;
    if (valorUltimo !== atual) return;
    input.value =
      atual.slice(0, ini).replace(/[ \t]+$/, '') +
      atual.slice(fim).replace(/^[ \t]+/, '');
    input.focus();
    lerAgora();
  }

  function desenharPrevia(res, valor) {
    limpar(previa);
    const fichas = [];
    if (res.quando) {
      fichas.push({ tipo: 'data', texto: rotuloCurto(res.quando) });
    }
    if (res.hora) {
      fichas.push({ tipo: 'hora', texto: formatarHora(res.hora) });
    }
    if (res.repetir) {
      fichas.push({ tipo: 'repetir', texto: textoRepetir(res.repetir) });
    }
    if (res.trechos && res.trechos.area) {
      fichas.push({ tipo: 'area', texto: ROTULOS_AREA[res.area] });
    }
    if (res.foco) {
      fichas.push({ tipo: 'foco', texto: 'foco' });
    }

    for (const ficha of fichas) {
      const botao = h('button', {
        class: `ficha ficha-${ficha.tipo}`,
        type: 'button',
        title: 'Remover',
      });
      botao.appendChild(h('span', { text: ficha.texto }));
      botao.appendChild(h('span', { class: 'ficha-x', text: '×' }));
      botao.addEventListener('click', () => removerTrecho(ficha.tipo));
      previa.appendChild(botao);
    }

    if (res.avisos.length) {
      previa.appendChild(
        h('p', { class: 'previa-aviso', text: res.avisos.join(' · ') }),
      );
    }

    if (!fichas.length && !res.avisos.length) {
      previa.hidden = true;
      return;
    }
    if (!res.titulo && valor.trim() && !res.avisos.length) {
      previa.appendChild(
        h('p', { class: 'previa-aviso', text: 'sem título' }),
      );
    }
    previa.hidden = false;
  }

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviando) return;
    const valor = input.value.trim();
    if (!valor) return;
    const res = interpretar(valor, obterHoje());
    if (!res.titulo) {
      lerAgora();
      if (typeof aoAviso === 'function') {
        aoAviso('Escreva um título para a tarefa.');
      }
      return;
    }
    enviando = true;
    try {
      await aoCriar({
        titulo: res.titulo,
        area: res.area,
        quando: res.quando,
        hora: res.hora,
        repetir: res.repetir,
        foco: res.foco,
        client_ref: novoClientRef(),
      });
      input.value = '';
      ultima = null;
      valorUltimo = '';
      limpar(previa);
      previa.hidden = true;
      input.focus();
    } catch {
      // o app mostra o erro no toast
    } finally {
      enviando = false;
    }
  });

  input.addEventListener('input', lerAgora);

  document.addEventListener('keydown', (evento) => {
    if (
      evento.key.toLowerCase() === 'n' &&
      !evento.ctrlKey &&
      !evento.metaKey &&
      !evento.altKey &&
      !estaDigitando(evento.target) &&
      !document.body.classList.contains('painel-aberto')
    ) {
      evento.preventDefault();
      input.focus();
    }
  });

  return {
    focar() {
      input.focus();
    },
    limpar() {
      input.value = '';
      limpar(previa);
      previa.hidden = true;
    },
  };
}
