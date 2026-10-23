// Folha "Nova tarefa" (com caixa e faixa à vista) e a folha "Para quando?".
// O texto ainda aceita os atalhos do parser (#casa, amanhã, 7h, !), que só
// preenchem as escolhas de baixo.

import { interpretar } from '../parser.js';
import {
  AREAS,
  PRIORIDADES,
  ROTULOS_AREA,
  ROTULOS_FAIXA,
  diaSemana,
  formatarHora,
  rotuloCurto,
  somarDias,
} from '../logica.js';
import { h, limpar } from './dom.js';
import { icone } from './icones.js';

function novoClientRef() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `ref-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/** Próxima ocorrência de um dia da semana, depois de hoje. */
function proximo(hoje, dow) {
  let d = somarDias(hoje, 1);
  while (diaSemana(d) !== dow) d = somarDias(d, 1);
  return d;
}

/** Atalhos de data: hoje, amanhã, próxima sexta e próxima segunda. */
export function atalhosData(hoje) {
  const lista = [
    { rotulo: 'Hoje', data: hoje },
    { rotulo: 'Amanhã', data: somarDias(hoje, 1) },
  ];
  for (const dow of [5, 1]) {
    const data = proximo(hoje, dow);
    if (!lista.some((a) => a.data === data)) {
      lista.push({ rotulo: rotuloCurto(data), data });
    }
  }
  return lista;
}

function chip(texto, { ativo = false, classe = '', aoClicar } = {}) {
  const botao = h('button', {
    class: `chip${ativo ? ' ativo' : ''}${classe ? ` ${classe}` : ''}`,
    type: 'button',
    'aria-pressed': ativo ? 'true' : 'false',
  });
  botao.appendChild(h('span', { text: texto }));
  if (aoClicar) botao.addEventListener('click', aoClicar);
  return botao;
}

export function criarNova({ aoCriar, obterHoje, comVoltar, aoAviso }) {
  const painel = document.getElementById('nova');
  const fundo = document.getElementById('nova-fundo');
  let aberto = false;
  let soltarVoltar = null;
  let enviando = false;
  // `base` guarda o que foi escolhido nos botões; o texto (#casa, amanhã, 7h, !)
  // só sobrepõe enquanto estiver escrito, e some ao anotar.
  const base = { area: 'pessoal', faixa: 'proximo', quando: null, hora: null };
  const escolha = { ...base };
  let anotadas = [];

  const form = h('form', { class: 'nova-form', autocomplete: 'off' });
  const topo = h('div', { class: 'nova-topo' });
  topo.appendChild(h('span', { class: 'nova-rotulo', text: 'Nova tarefa' }));
  const fechar = h('button', { class: 'icone', type: 'button', 'aria-label': 'Fechar' });
  fechar.appendChild(icone('fechar', { tamanho: 20 }));
  topo.appendChild(fechar);
  const titulo = h('input', {
    class: 'nova-titulo',
    type: 'text',
    maxlength: '300',
    placeholder: 'O que precisa ser feito?',
    'aria-label': 'Título da tarefa',
    enterkeyhint: 'send',
  });
  const previa = h('p', { class: 'nova-previa', 'aria-live': 'polite' });
  const linhaCaixa = h('div', { class: 'opcoes', role: 'group', 'aria-label': 'Caixa' });
  const linhaFaixa = h('div', { class: 'opcoes', role: 'group', 'aria-label': 'Faixa' });
  const datas = h('div', { class: 'opcoes opcoes-datas', role: 'group', 'aria-label': 'Data' });
  const rodape = h('div', { class: 'nova-rodape' });
  const enviar = h('button', { class: 'botao-tinta', type: 'submit', text: 'Anotar' });
  rodape.appendChild(enviar);
  const lista = h('ul', { class: 'nova-anotadas', 'aria-label': 'Anotadas agora' });
  for (const no of [topo, titulo, previa, linhaCaixa, linhaFaixa, datas, rodape, lista]) {
    form.appendChild(no);
  }
  painel.appendChild(form);

  function interpretado() {
    const texto = titulo.value;
    if (!texto.trim()) return null;
    return interpretar(texto, obterHoje());
  }

  function aplicarParser() {
    Object.assign(escolha, base);
    const res = interpretado();
    const partes = [];
    if (res && res.trechos) {
      if (res.trechos.area) {
        escolha.area = res.area;
        partes.push(ROTULOS_AREA[res.area]);
      }
      if (res.quando) {
        escolha.faixa = 'com_data';
        escolha.quando = res.quando;
        partes.push(rotuloCurto(res.quando));
      }
      if (res.hora) {
        escolha.hora = res.hora;
        partes.push(formatarHora(res.hora));
      }
      if (res.foco && escolha.faixa !== 'com_data') {
        escolha.faixa = 'imediato';
        partes.push('imediato');
      }
      if (res.repetir) partes.push('repete');
    }
    previa.textContent = partes.length ? `entendi: ${partes.join(' · ')}` : '';
    desenharEscolhas();
  }

  function desenharEscolhas() {
    const hoje = obterHoje();
    painel.dataset.caixa = escolha.area;
    limpar(linhaCaixa);
    for (const area of AREAS) {
      linhaCaixa.appendChild(
        chip(ROTULOS_AREA[area], {
          ativo: escolha.area === area,
          classe: `chip-caixa tinta-${area}`,
          aoClicar: () => {
            escolha.area = area;
            base.area = area;
            desenharEscolhas();
          },
        }),
      );
    }
    limpar(linhaFaixa);
    for (const faixa of [...PRIORIDADES, 'com_data']) {
      linhaFaixa.appendChild(
        chip(ROTULOS_FAIXA[faixa], {
          ativo: escolha.faixa === faixa,
          aoClicar: () => {
            escolha.faixa = faixa;
            if (faixa === 'com_data' && !escolha.quando) escolha.quando = hoje;
            Object.assign(base, { faixa, quando: escolha.quando, hora: escolha.hora });
            desenharEscolhas();
          },
        }),
      );
    }
    limpar(datas);
    datas.hidden = escolha.faixa !== 'com_data';
    if (!datas.hidden) {
      for (const atalho of atalhosData(hoje)) {
        datas.appendChild(
          chip(atalho.rotulo, {
            ativo: escolha.quando === atalho.data,
            aoClicar: () => {
              escolha.quando = atalho.data;
              Object.assign(base, { faixa: 'com_data', quando: atalho.data });
              desenharEscolhas();
            },
          }),
        );
      }
      const outra = h('input', {
        class: 'entrada entrada-data',
        type: 'date',
        value: escolha.quando || '',
        'aria-label': 'Outra data',
      });
      outra.addEventListener('change', () => {
        if (outra.value) {
          escolha.quando = outra.value;
          Object.assign(base, { faixa: 'com_data', quando: outra.value });
        }
        desenharEscolhas();
      });
      datas.appendChild(outra);
      const hora = h('input', {
        class: 'entrada entrada-hora',
        type: 'time',
        value: escolha.hora || '',
        'aria-label': 'Hora (opcional)',
      });
      hora.addEventListener('change', () => {
        escolha.hora = hora.value || null;
        base.hora = escolha.hora;
      });
      datas.appendChild(hora);
    }
  }

  function desenharAnotadas() {
    limpar(lista);
    for (const item of anotadas.slice(-4).reverse()) {
      const li = h('li', { class: `tinta-${item.area}` });
      li.appendChild(h('span', { class: 'anotada-visto', text: '✓', 'aria-hidden': 'true' }));
      li.appendChild(h('span', { class: 'anotada-titulo', text: item.titulo }));
      li.appendChild(h('span', { class: 'anotada-onde', text: item.onde }));
      lista.appendChild(li);
    }
  }

  function fecharPainel() {
    if (!aberto) return;
    aberto = false;
    painel.hidden = true;
    fundo.hidden = true;
    document.body.classList.remove('folha-aberta');
    if (soltarVoltar) {
      const soltar = soltarVoltar;
      soltarVoltar = null;
      soltar();
    }
  }

  function abrir({ caixa, faixa } = {}) {
    if (caixa && caixa !== 'tudo') base.area = caixa;
    base.faixa = faixa || 'proximo';
    base.quando = base.faixa === 'com_data' ? obterHoje() : null;
    base.hora = null;
    Object.assign(escolha, base);
    anotadas = [];
    titulo.value = '';
    previa.textContent = '';
    desenharEscolhas();
    desenharAnotadas();
    aberto = true;
    painel.hidden = false;
    fundo.hidden = false;
    document.body.classList.add('folha-aberta');
    soltarVoltar = comVoltar(() => {
      soltarVoltar = null;
      fecharPainel();
    });
    // No celular, o foco precisa vir do mesmo toque para o teclado abrir.
    titulo.focus();
  }

  titulo.addEventListener('input', aplicarParser);

  form.addEventListener('submit', async (evento) => {
    evento.preventDefault();
    if (enviando) return;
    const res = interpretado();
    if (!res || !res.titulo) {
      aoAviso('Escreva o que precisa ser feito.');
      titulo.focus();
      return;
    }
    const comData = escolha.faixa === 'com_data' && escolha.quando;
    const campos = {
      titulo: res.titulo,
      area: escolha.area,
      prioridade: PRIORIDADES.includes(escolha.faixa) ? escolha.faixa : 'proximo',
      quando: comData ? escolha.quando : null,
      hora: comData ? escolha.hora : null,
      repetir: res.repetir || null,
      client_ref: novoClientRef(),
    };
    enviando = true;
    try {
      await aoCriar(campos);
      anotadas.push({
        titulo: res.titulo,
        area: escolha.area,
        onde: `${ROTULOS_AREA[escolha.area]} · ${
          comData ? rotuloCurto(escolha.quando) : ROTULOS_FAIXA[campos.prioridade]
        }`,
      });
      desenharAnotadas();
      titulo.value = '';
      aplicarParser();
      titulo.focus();
    } catch {
      // o app já avisou
    } finally {
      enviando = false;
    }
  });

  fechar.addEventListener('click', fecharPainel);
  fundo.addEventListener('click', fecharPainel);
  painel.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape') fecharPainel();
  });

  return { abrir, fechar: fecharPainel, estaAberto: () => aberto };
}

/** Folha "Para quando?": devolve a data escolhida ou null. */
export function criarEscolherData({ obterHoje, comVoltar }) {
  const painel = document.getElementById('escolher-data');
  const fundo = document.getElementById('data-fundo');
  let resolver = null;
  let soltarVoltar = null;

  function terminar(valor) {
    if (!resolver) return;
    const r = resolver;
    resolver = null;
    painel.hidden = true;
    fundo.hidden = true;
    if (soltarVoltar) {
      const soltar = soltarVoltar;
      soltarVoltar = null;
      soltar();
    }
    r(valor);
  }

  function escolher({ titulo = 'Para quando?', atual = null } = {}) {
    if (resolver) terminar(null);
    const hoje = obterHoje();
    limpar(painel);
    const topo = h('div', { class: 'nova-topo' });
    topo.appendChild(h('span', { class: 'nova-rotulo', text: titulo }));
    const fechar = h('button', { class: 'icone', type: 'button', 'aria-label': 'Cancelar' });
    fechar.appendChild(icone('fechar', { tamanho: 20 }));
    fechar.addEventListener('click', () => terminar(null));
    topo.appendChild(fechar);
    painel.appendChild(topo);
    const opcoes = h('div', { class: 'opcoes opcoes-datas' });
    for (const atalho of atalhosData(hoje)) {
      opcoes.appendChild(
        chip(atalho.rotulo, {
          ativo: atual === atalho.data,
          aoClicar: () => terminar(atalho.data),
        }),
      );
    }
    const outra = h('input', {
      class: 'entrada entrada-data',
      type: 'date',
      value: atual || '',
      'aria-label': 'Outra data',
    });
    outra.addEventListener('change', () => {
      if (outra.value) terminar(outra.value);
    });
    opcoes.appendChild(outra);
    painel.appendChild(opcoes);
    painel.hidden = false;
    fundo.hidden = false;
    soltarVoltar = comVoltar(() => {
      soltarVoltar = null;
      terminar(null);
    });
    return new Promise((ok) => {
      resolver = ok;
    });
  }

  fundo.addEventListener('click', () => terminar(null));
  return { escolher };
}
