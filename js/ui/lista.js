// Lista do caderno: faixas (Com data, Imediato, Próximo, Em breve, Esperando),
// o momento de concluir e o arrastar entre faixas e caixas.

import {
  ROTULOS_AREA,
  faixaDe,
  formatarHora,
  origemExterna,
  progresso,
  rotuloData,
  dominio,
} from '../logica.js';
import { h, limpar } from './dom.js';
import { icone } from './icones.js';

const NS = 'http://www.w3.org/2000/svg';
const ESPERA_TOQUE = 380; // ms segurando para erguer a tarefa no celular
const DURACAO_CONCLUSAO = 980; // ms até a linha sair da lista
// Dois toques curtos: o 12 ms antigo passava despercebido em muitos Androids.
const VIBRAR_CONCLUIR = [18, 60, 28];

function pluralDias(n) {
  return n === 1 ? '1 dia' : `${n} dias`;
}

function semMovimento() {
  try {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  } catch {
    return false;
  }
}

function vibrar(padrao) {
  try {
    if (navigator.vibrate) navigator.vibrate(padrao);
  } catch {
    // sem vibração
  }
}

/** Visto desenhado a pena (o traço é animado pelo CSS). */
function visto() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', 'visto');
  svg.setAttribute('aria-hidden', 'true');
  const traco = document.createElementNS(NS, 'path');
  traco.setAttribute('d', 'M6.2 12.6c1.3 1.1 2.4 2.3 3.4 3.7 2.2-3.6 4.8-6.6 8.2-9.2');
  svg.appendChild(traco);
  return svg;
}

export function criarLista({
  aoConcluir,
  aoReabrir,
  aoAbrir,
  aoAbrirLink,
  aoMenu,
  aoMover,
  aoNovaNaFaixa,
}) {
  const raiz = document.getElementById('lista');
  const recolhidas = new Set(['esperando']);
  let ultimo = null;
  let pendente = null;
  let animando = 0;
  let arrasto = null;
  let destacarId = null;
  // Tarefa que acabou de ser anotada: fica sem título até a escrita começar,
  // para não aparecer pronta e depois "piscar" ao ser escrita.
  let reservada = null;
  let soltarReserva = null;

  // ------------------------------------------------------------- concluir

  function respingos(onde) {
    const caixa = h('span', { class: 'respingos', 'aria-hidden': 'true' });
    const n = 7;
    for (let i = 0; i < n; i += 1) {
      const angulo = (Math.PI * 2 * i) / n + Math.random() * 0.5;
      const raio = 15 + Math.random() * 9;
      const gota = h('span', { class: 'gota' });
      gota.style.setProperty('--dx', `${Math.cos(angulo) * raio}px`);
      gota.style.setProperty('--dy', `${Math.sin(angulo) * raio}px`);
      gota.style.setProperty('--t', `${2 + Math.random() * 2.5}px`);
      caixa.appendChild(gota);
    }
    onde.appendChild(caixa);
    setTimeout(() => caixa.remove(), 700);
  }

  function animarConclusao(linha, circulo) {
    linha.classList.add('concluindo');
    // Ainda dentro do clique: o Chrome exige ativação do usuário para vibrar.
    vibrar(VIBRAR_CONCLUIR);
    if (semMovimento()) {
      return new Promise((ok) => setTimeout(ok, 350));
    }
    respingos(circulo);
    return new Promise((ok) => {
      setTimeout(() => {
        const altura = linha.getBoundingClientRect().height;
        if (typeof linha.animate === 'function') {
          try {
            linha.animate(
              [
                { height: `${altura}px`, opacity: 1 },
                { height: '0px', opacity: 0, paddingTop: '0px', paddingBottom: '0px' },
              ],
              { duration: 300, easing: 'cubic-bezier(.4,0,.2,1)', fill: 'forwards' },
            );
          } catch {
            // sem Web Animations
          }
        }
      }, DURACAO_CONCLUSAO - 300);
      setTimeout(ok, DURACAO_CONCLUSAO);
    });
  }

  async function concluir(tarefa, linha, circulo) {
    if (linha.classList.contains('concluindo')) return;
    animando += 1;
    const fim = animarConclusao(linha, circulo);
    try {
      await aoConcluir(tarefa);
    } finally {
      await fim;
      animando -= 1;
      if (!animando && pendente) {
        ultimo = pendente;
        pendente = null;
        renderInterno();
      }
    }
  }

  // ----------------------------------------------------------------- linha

  function linhaDetalhe(tarefa, contexto) {
    const detalhe = h('span', { class: 'detalhe' });
    if (contexto.caixa === 'tudo') {
      detalhe.appendChild(
        h('span', {
          class: `etiqueta tinta-${tarefa.area || 'pessoal'}`,
          text: ROTULOS_AREA[tarefa.area] || 'Pessoal',
        }),
      );
    }
    const faixa = faixaDe(tarefa);
    if (faixa === 'com_data') {
      const partes = [rotuloData(tarefa.quando, contexto.hoje)];
      if (tarefa.hora) partes.push(formatarHora(tarefa.hora));
      detalhe.appendChild(
        h('span', {
          class: tarefa.atraso_dias > 0 ? 'data data-atraso' : 'data',
          text:
            tarefa.atraso_dias > 0
              ? `${partes.join(' · ')} · há ${pluralDias(tarefa.atraso_dias)}`
              : partes.join(' · '),
        }),
      );
    } else if (faixa === 'esperando') {
      detalhe.appendChild(
        h('span', {
          class: 'detalhe-texto',
          text: tarefa.dias > 0 ? `esperando há ${pluralDias(tarefa.dias)}` : 'esperando desde hoje',
        }),
      );
    }
    const sub = progresso(tarefa.subtarefas);
    if (sub.total > 0) {
      detalhe.appendChild(
        h('span', {
          class: 'detalhe-extra',
          text: `${sub.feitas}/${sub.total}`,
          'aria-label': `${sub.feitas} de ${sub.total} passos`,
        }),
      );
    }
    if (tarefa.repetir) {
      detalhe.appendChild(
        h('span', { class: 'detalhe-extra', text: '↻', 'aria-label': 'repete' }),
      );
    }
    const host = dominio(tarefa.link);
    if (host) {
      const link = h(
        'a',
        {
          class: 'detalhe-extra detalhe-link',
          href: tarefa.link,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: tarefa.link,
        },
        [`↗ ${host}`],
      );
      link.addEventListener('click', (evento) => evento.stopPropagation());
      detalhe.appendChild(link);
    }
    if (contexto.iaRecentes.has(tarefa.id)) {
      detalhe.appendChild(
        h('span', { class: 'ponto-ia', title: 'mudança recente por IA' }),
      );
    }
    return detalhe.childNodes.length ? detalhe : null;
  }

  function criarLinha(tarefa, contexto) {
    const linha = h('div', {
      class: `linha tinta-${tarefa.area || 'pessoal'}`,
      role: 'listitem',
      dataset: { id: tarefa.id },
    });
    if (reservada && (tarefa.client_ref === reservada || tarefa.id === reservada)) {
      linha.classList.add('a-anotar');
    }
    const externa = origemExterna(tarefa);

    const circulo = h('button', {
      class: `circulo${externa ? ' tracejado' : ''}`,
      type: 'button',
      'aria-label': externa
        ? `Abrir ${tarefa.titulo} no ${externa}`
        : `Concluir ${tarefa.titulo}`,
    });
    const anel = h('span', { class: 'anel', 'aria-hidden': 'true' });
    anel.appendChild(visto());
    circulo.appendChild(anel);
    circulo.addEventListener('click', (evento) => {
      evento.stopPropagation();
      if (externa) {
        if (dominio(tarefa.link)) aoAbrirLink(tarefa);
        else aoAbrir(tarefa);
        return;
      }
      concluir(tarefa, linha, circulo);
    });

    const corpo = h('div', { class: 'linha-corpo' });
    const titulo = h('button', { class: 'titulo-linha', type: 'button' });
    titulo.appendChild(h('span', { class: 'titulo-texto', text: tarefa.titulo }));
    titulo.addEventListener('click', () => {
      if (arrasto || linha.dataset.arrastou) return;
      aoAbrir(tarefa);
    });
    corpo.appendChild(titulo);
    const detalhe = linhaDetalhe(tarefa, contexto);
    if (detalhe) corpo.appendChild(detalhe);

    const botaoMenu = h('button', {
      class: 'menu-botao',
      type: 'button',
      'aria-label': `Mais opções de ${tarefa.titulo}`,
    });
    botaoMenu.appendChild(icone('mais', { tamanho: 18 }));
    botaoMenu.addEventListener('click', (evento) => {
      evento.stopPropagation();
      aoMenu(tarefa);
    });

    linha.appendChild(circulo);
    linha.appendChild(corpo);
    linha.appendChild(botaoMenu);
    ligarArrasto(linha, tarefa);
    return linha;
  }

  // --------------------------------------------------------------- arrastar

  function alvoEm(x, y) {
    const el = document.elementFromPoint(x, y);
    if (!el) return null;
    const aba = el.closest('[data-aba]');
    if (aba && aba.dataset.aba !== 'tudo') return { tipo: 'aba', valor: aba.dataset.aba, el: aba };
    const faixa = el.closest('[data-faixa]');
    if (faixa) return { tipo: 'faixa', valor: faixa.dataset.faixa, el: faixa };
    return null;
  }

  function marcarAlvo(alvo) {
    if (arrasto.alvo && arrasto.alvo.el !== (alvo && alvo.el)) {
      arrasto.alvo.el.classList.remove('alvo');
    }
    arrasto.alvo = alvo;
    if (alvo) alvo.el.classList.add('alvo');
  }

  function rolarSozinho() {
    if (!arrasto) return;
    const margem = 90;
    const y = arrasto.y;
    let passo = 0;
    if (y < margem) passo = -Math.ceil((margem - y) / 6);
    else if (y > window.innerHeight - margem) {
      passo = Math.ceil((y - (window.innerHeight - margem)) / 6);
    }
    if (passo) {
      window.scrollBy(0, passo);
      marcarAlvo(alvoEm(arrasto.x, arrasto.y));
    }
    arrasto.raf = requestAnimationFrame(rolarSozinho);
  }

  function iniciarArrasto(linha, tarefa, x, y) {
    const caixa = linha.getBoundingClientRect();
    const fantasma = linha.cloneNode(true);
    fantasma.classList.add('fantasma');
    fantasma.style.width = `${caixa.width}px`;
    fantasma.style.left = `${caixa.left}px`;
    fantasma.style.top = `${caixa.top}px`;
    document.body.appendChild(fantasma);
    linha.classList.add('origem-arrasto');
    document.body.classList.add('arrastando');
    arrasto = {
      tarefa,
      linha,
      fantasma,
      dy: y - caixa.top,
      x,
      y,
      alvo: null,
      raf: 0,
    };
    vibrar(8);
    arrasto.raf = requestAnimationFrame(rolarSozinho);
  }

  function moverArrasto(x, y) {
    arrasto.x = x;
    arrasto.y = y;
    arrasto.fantasma.style.top = `${y - arrasto.dy}px`;
    marcarAlvo(alvoEm(x, y));
  }

  function terminarArrasto(soltou) {
    const atual = arrasto;
    arrasto = null;
    cancelAnimationFrame(atual.raf);
    document.body.classList.remove('arrastando');
    atual.linha.classList.remove('origem-arrasto');
    atual.linha.dataset.arrastou = '1';
    setTimeout(() => delete atual.linha.dataset.arrastou, 50);
    if (atual.alvo) atual.alvo.el.classList.remove('alvo');
    atual.fantasma.remove();
    if (!animando && pendente) {
      ultimo = pendente;
      pendente = null;
      renderInterno();
    }
    if (!soltou || !atual.alvo) return;
    const { tarefa } = atual;
    if (atual.alvo.tipo === 'aba') {
      if (atual.alvo.valor !== tarefa.area) {
        vibrar(10);
        aoMover(tarefa, { area: atual.alvo.valor });
      }
      return;
    }
    if (atual.alvo.valor !== faixaDe(tarefa)) {
      vibrar(10);
      aoMover(tarefa, { faixa: atual.alvo.valor });
    }
  }

  function ligarArrasto(linha, tarefa) {
    let toque = null;

    const limpar = () => {
      if (toque && toque.timer) clearTimeout(toque.timer);
      toque = null;
    };

    linha.addEventListener('contextmenu', (evento) => evento.preventDefault());

    linha.addEventListener('pointerdown', (evento) => {
      if (evento.pointerType === 'mouse' && evento.button !== 0) return;
      if (evento.target.closest('.circulo, .menu-botao, a')) return;
      if (linha.classList.contains('concluindo')) return;
      toque = {
        id: evento.pointerId,
        x: evento.clientX,
        y: evento.clientY,
        mouse: evento.pointerType === 'mouse',
        timer: null,
      };
      if (!toque.mouse) {
        toque.timer = setTimeout(() => {
          if (!toque) return;
          try {
            linha.setPointerCapture(toque.id);
          } catch {
            // ignora
          }
          iniciarArrasto(linha, tarefa, toque.x, toque.y);
        }, ESPERA_TOQUE);
      }
    });

    linha.addEventListener('pointermove', (evento) => {
      if (arrasto && arrasto.linha === linha) {
        moverArrasto(evento.clientX, evento.clientY);
        return;
      }
      if (!toque) return;
      const dist = Math.hypot(evento.clientX - toque.x, evento.clientY - toque.y);
      if (toque.mouse && dist > 6) {
        try {
          linha.setPointerCapture(toque.id);
        } catch {
          // ignora
        }
        iniciarArrasto(linha, tarefa, toque.x, toque.y);
        moverArrasto(evento.clientX, evento.clientY);
        if (toque.timer) clearTimeout(toque.timer);
        toque = null;
      } else if (!toque.mouse && dist > 8) {
        limpar(); // é rolagem, não arrasto
      }
    });

    linha.addEventListener('pointerup', () => {
      limpar();
      if (arrasto && arrasto.linha === linha) terminarArrasto(true);
    });
    linha.addEventListener('pointercancel', () => {
      limpar();
      if (arrasto && arrasto.linha === linha) terminarArrasto(false);
    });
  }

  // Enquanto uma tarefa está erguida, o dedo não rola a página.
  document.addEventListener(
    'touchmove',
    (evento) => {
      if (arrasto) evento.preventDefault();
    },
    { passive: false },
  );

  // ----------------------------------------------------------------- render

  function cabecalhoFaixa(faixa, contexto) {
    const recolhida = recolhidas.has(faixa.chave);
    const cab = h('div', { class: 'faixa-cab' });
    const botao = h('button', {
      class: 'faixa-nome',
      type: 'button',
      'aria-expanded': recolhida ? 'false' : 'true',
    });
    botao.appendChild(h('span', { text: faixa.titulo }));
    if (faixa.tarefas.length) {
      botao.appendChild(
        h('span', { class: 'faixa-conta', text: String(faixa.tarefas.length) }),
      );
    }
    if (faixa.chave === 'esperando') {
      botao.appendChild(
        h('span', { class: 'faixa-seta', text: recolhida ? '▸' : '▾', 'aria-hidden': 'true' }),
      );
      botao.addEventListener('click', () => {
        if (recolhidas.has(faixa.chave)) recolhidas.delete(faixa.chave);
        else recolhidas.add(faixa.chave);
        renderInterno();
      });
    }
    cab.appendChild(botao);
    if (faixa.chave !== 'esperando') {
      const mais = h('button', {
        class: 'faixa-mais',
        type: 'button',
        'aria-label': `Nova tarefa em ${faixa.titulo}`,
      });
      mais.appendChild(icone('mais_simples', { tamanho: 16 }));
      mais.addEventListener('click', () => aoNovaNaFaixa(faixa.chave, contexto.caixa));
      cab.appendChild(mais);
    }
    return cab;
  }

  function acharLinha(id) {
    return (
      Array.from(raiz.querySelectorAll('.linha')).find(
        (item) => item.dataset.id === id,
      ) || null
    );
  }

  // A escrita começa quando a linha já está à vista, não durante a rolagem.
  function iniciarDestaque(id, linha) {
    const alvo = acharLinha(id) || linha;
    reservar(null);
    alvo.classList.add('recem-anotada');
    alvo.classList.remove('a-anotar');
    setTimeout(() => alvo.classList.remove('recem-anotada'), 1200);
  }

  // Tarefa recém-anotada: rola até ela e liga a animação de tinta/escrita.
  function aplicarDestaque() {
    if (!destacarId) return;
    const id = destacarId;
    const linha = acharLinha(id);
    if (!linha) return;
    destacarId = null;
    const retangulo = linha.getBoundingClientRect();
    const visivel =
      retangulo.top >= 0 && retangulo.bottom <= window.innerHeight;
    if (visivel || semMovimento()) {
      if (!visivel) {
        try {
          linha.scrollIntoView({ block: 'center' });
        } catch {
          // sem rolagem
        }
      }
      iniciarDestaque(id, linha);
      return;
    }
    let terminou = false;
    const comecar = () => {
      if (terminou) return;
      terminou = true;
      window.removeEventListener('scrollend', comecar);
      clearTimeout(tempo);
      iniciarDestaque(id, linha);
    };
    window.addEventListener('scrollend', comecar, { once: true });
    const tempo = setTimeout(comecar, 700);
    try {
      linha.scrollIntoView({ block: 'center', behavior: 'smooth' });
    } catch {
      comecar();
    }
  }

  function reservar(ref) {
    clearTimeout(soltarReserva);
    reservada = ref || null;
    if (!reservada) {
      for (const item of raiz.querySelectorAll('.linha.a-anotar')) {
        item.classList.remove('a-anotar');
      }
      return;
    }
    // Rede de segurança: se o destaque não vier, a tarefa não fica invisível.
    soltarReserva = setTimeout(() => reservar(null), 4000);
  }

  function renderInterno() {
    if (!ultimo) return;
    const { faixas, contexto } = ultimo;
    limpar(raiz);
    const buscando = Boolean(contexto.busca);
    let total = 0;
    for (const faixa of faixas) {
      total += faixa.tarefas.length;
      if (buscando && !faixa.tarefas.length) continue;
      if (faixa.chave === 'esperando' && !faixa.tarefas.length) continue;
      const bloco = h('section', {
        class: `faixa faixa-${faixa.chave}${faixa.tarefas.length ? '' : ' vazia'}`,
        dataset: { faixa: faixa.chave },
        'aria-label': faixa.titulo,
      });
      bloco.appendChild(cabecalhoFaixa(faixa, contexto));
      const lista = h('div', { class: 'faixa-lista', role: 'list' });
      if (!recolhidas.has(faixa.chave)) {
        for (const tarefa of faixa.tarefas) {
          lista.appendChild(criarLinha(tarefa, contexto));
        }
        if (!faixa.tarefas.length) {
          lista.appendChild(
            h('p', {
              class: 'faixa-vazia',
              text: faixa.chave === 'com_data' ? 'nada marcado' : '—',
            }),
          );
        }
      }
      bloco.appendChild(lista);
      raiz.appendChild(bloco);
    }
    if (buscando && !total) {
      raiz.appendChild(h('p', { class: 'vazio', text: 'Nada encontrado.' }));
    }
    aplicarDestaque();
  }

  function render(faixas, contexto) {
    const pacote = {
      faixas: faixas || [],
      contexto: {
        caixa: contexto.caixa || 'tudo',
        hoje: contexto.hoje,
        busca: contexto.busca || '',
        iaRecentes:
          contexto.iaRecentes instanceof Set ? contexto.iaRecentes : new Set(),
      },
    };
    // Durante a animação de concluir, a lista não é redesenhada (senão a linha
    // sumiria no meio do traço); o último pedido é aplicado no fim.
    if (animando || arrasto) {
      pendente = pacote;
      return;
    }
    ultimo = pacote;
    renderInterno();
  }

  return {
    render,
    reservar,
    destacar: (id) => {
      destacarId = id;
      if (!animando && !arrasto) aplicarDestaque();
    },
    estaArrastando: () => Boolean(arrasto),
    reabrir: aoReabrir,
  };
}
