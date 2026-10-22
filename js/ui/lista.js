// Lista agrupada de tarefas.

import {
  formatarHora,
  progresso,
  rotuloData,
  dominio,
  GRUPOS_RECOLHIDOS,
} from '../logica.js';
import { h, limpar } from './dom.js';
import { icone } from './icones.js';

function pluralDias(n) {
  return n === 1 ? '1 dia' : `${n} dias`;
}

export function criarLista({
  aoConcluir,
  aoAbrir,
  aoAbrirLink,
  aoAdiar,
  aoMenu,
}) {
  const raiz = document.getElementById('lista');
  const recolhidos = new Set(GRUPOS_RECOLHIDOS);
  let ultimo = { grupos: [], hoje: null, iaRecentes: new Set() };

  function animarConclusao(circulo) {
    if (typeof circulo.animate !== 'function') return;
    try {
      circulo.animate(
        [
          { transform: 'scale(1)', opacity: 1 },
          { transform: 'scale(0.7)', opacity: 0.35 },
          { transform: 'scale(1)', opacity: 1 },
        ],
        { duration: 200, easing: 'ease-out' },
      );
    } catch {
      // sem Web Animations: conclui direto
    }
  }

  function textoDetalhe(tarefa, chave, hoje) {
    const partes = [];
    let classe = '';

    if (chave === 'esperando') {
      partes.push(`esperando há ${pluralDias(tarefa.dias || 0)}`);
      classe = 'detalhe-esperando';
    } else if (chave === 'feitas_hoje') {
      partes.push('feita');
      if (tarefa.hora) partes.push(formatarHora(tarefa.hora));
    } else if (tarefa.atraso_dias > 0) {
      partes.push(`há ${pluralDias(tarefa.atraso_dias)}`);
      if (tarefa.quando) partes.push(rotuloData(tarefa.quando, hoje));
      if (tarefa.hora) partes.push(formatarHora(tarefa.hora));
      classe = 'detalhe-atraso';
    } else {
      if (tarefa.quando) partes.push(rotuloData(tarefa.quando, hoje));
      if (tarefa.hora) partes.push(formatarHora(tarefa.hora));
    }
    return { texto: partes.join(' · '), classe };
  }

  function criarDetalhes(tarefa, chave, hoje) {
    const detalhe = h('span', { class: 'detalhe' });
    detalhe.appendChild(
      h('span', {
        class: `bolinha area-${tarefa.area || 'pessoal'}`,
        'aria-hidden': 'true',
      }),
    );
    const { texto, classe } = textoDetalhe(tarefa, chave, hoje);
    if (texto) {
      detalhe.appendChild(
        h('span', { class: classe || 'detalhe-texto', text: texto }),
      );
    }
    const progressoSub = progresso(tarefa.subtarefas);
    if (progressoSub.total > 0) {
      detalhe.appendChild(
        h('span', {
          class: 'detalhe-extra',
          text: `${progressoSub.feitas}/${progressoSub.total}`,
          'aria-label': `${progressoSub.feitas} de ${progressoSub.total} subtarefas`,
        }),
      );
    }
    if (tarefa.repetir) {
      detalhe.appendChild(
        h('span', {
          class: 'detalhe-extra',
          text: '↻',
          'aria-label': 'repete',
          title: 'repete',
        }),
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
    return detalhe;
  }

  function criarLinha(tarefa, chave, hoje, iaRecentes) {
    const linha = h('div', { class: 'linha', dataset: { id: tarefa.id } });
    const buriti = String(tarefa.ref_externa || '').startsWith('cf:');

    const circulo = h('button', {
      class: `circulo${buriti ? ' tracejado' : ''}`,
      type: 'button',
      'aria-label': buriti
        ? `Abrir ${tarefa.titulo} no Buriti`
        : `Concluir ${tarefa.titulo}`,
    });
    circulo.addEventListener('click', (evento) => {
      evento.stopPropagation();
      if (buriti) {
        if (dominio(tarefa.link)) aoAbrirLink(tarefa);
        else aoAbrir(tarefa);
        return;
      }
      animarConclusao(circulo);
      setTimeout(() => aoConcluir(tarefa), 200);
    });

    const corpo = h('div', { class: 'linha-corpo' });
    const titulo = h('button', {
      class: 'titulo-linha',
      type: 'button',
      text: tarefa.titulo,
    });
    titulo.addEventListener('click', () => aoAbrir(tarefa));
    corpo.appendChild(titulo);
    const detalhe = criarDetalhes(tarefa, chave, hoje);
    const marcaIa = iaRecentes && iaRecentes.has(tarefa.id);
    if (marcaIa) {
      detalhe.appendChild(
        h('span', {
          class: 'ponto-ia',
          title: 'mudança recente por IA',
          'aria-label': 'mudança recente por IA',
        }),
      );
    }
    corpo.appendChild(detalhe);

    const botaoMenu = h('button', {
      class: 'menu-botao',
      type: 'button',
      'aria-label': `Mais opções de ${tarefa.titulo}`,
    });
    botaoMenu.appendChild(icone('mais', { tamanho: 18 }));
    botaoMenu.addEventListener('click', (evento) => {
      evento.stopPropagation();
      aoMenu(tarefa, botaoMenu);
    });

    linha.appendChild(circulo);
    linha.appendChild(corpo);
    linha.appendChild(botaoMenu);

    // Deslizar para a direita = adiar para amanhã.
    let inicioX = 0;
    let inicioY = 0;
    let dx = 0;
    let arrastando = false;
    let cancelado = false;
    let timerToque = null;

    const limparTimer = () => {
      if (timerToque) clearTimeout(timerToque);
      timerToque = null;
    };

    linha.addEventListener('pointerdown', (evento) => {
      if (evento.pointerType === 'mouse' && evento.button !== 0) return;
      if (evento.target.closest('.circulo, .menu-botao, a')) return;
      inicioX = evento.clientX;
      inicioY = evento.clientY;
      dx = 0;
      arrastando = false;
      cancelado = false;
      if (evento.pointerType !== 'mouse' && inicioX > 24) {
        limparTimer();
        timerToque = setTimeout(() => {
          cancelado = true;
          aoMenu(tarefa, linha);
        }, 550);
      }
    });

    linha.addEventListener('pointermove', (evento) => {
      if (!inicioX && inicioX !== 0) return;
      const deslocX = evento.clientX - inicioX;
      const deslocY = evento.clientY - inicioY;
      if (Math.hypot(deslocX, deslocY) > 8) limparTimer();
      // Só começa o deslizar quando o toque começou longe da borda esquerda
      // (evita brigar com o gesto "voltar" do Android).
      if (
        inicioX > 24 &&
        deslocX > 8 &&
        Math.abs(deslocY) < Math.abs(deslocX)
      ) {
        limparTimer();
        arrastando = true;
        dx = Math.min(deslocX, 140);
        if (typeof linha.animate === 'function') {
          try {
            linha.animate(
              [{ transform: `translateX(${dx}px)` }],
              { duration: 0, fill: 'forwards' },
            );
          } catch {
            // ignora
          }
        }
      }
    });

    const terminar = () => {
      limparTimer();
      if (!arrastando) return;
      arrastando = false;
      const largura = linha.getBoundingClientRect().width || 300;
      const adiar = dx >= largura * 0.35;
      if (typeof linha.animate === 'function') {
        try {
          linha.animate(
            [
              { transform: `translateX(${dx}px)` },
              { transform: 'translateX(0px)' },
            ],
            { duration: adiar ? 120 : 160, easing: 'ease-out' },
          );
        } catch {
          // ignora
        }
      }
      dx = 0;
      if (adiar && !cancelado) aoAdiar(tarefa);
    };

    linha.addEventListener('pointerup', terminar);
    linha.addEventListener('pointercancel', () => {
      limparTimer();
      arrastando = false;
      dx = 0;
    });
    linha.addEventListener('click', () => {
      if (cancelado) {
        cancelado = false;
      }
    });

    return linha;
  }

  function renderInterno() {
    const { grupos, hoje, iaRecentes } = ultimo;
    limpar(raiz);
    for (const grupo of grupos) {
      const recolhido = recolhidos.has(grupo.chave);
      const cabecalho = h('button', {
        class: `grupo-cabecalho${recolhido ? ' recolhido' : ''}`,
        type: 'button',
        'aria-expanded': recolhido ? 'false' : 'true',
      });
      cabecalho.appendChild(
        h('span', { class: 'grupo-nome', text: grupo.titulo }),
      );
      if (recolhido) {
        cabecalho.appendChild(
          h('span', { class: 'grupo-contagem', text: String(grupo.tarefas.length) }),
        );
      }
      cabecalho.appendChild(
        h('span', {
          class: 'grupo-seta',
          text: recolhido ? '▸' : '▾',
          'aria-hidden': 'true',
        }),
      );
      cabecalho.addEventListener('click', () => {
        if (recolhidos.has(grupo.chave)) recolhidos.delete(grupo.chave);
        else recolhidos.add(grupo.chave);
        renderInterno();
      });
      raiz.appendChild(cabecalho);
      if (recolhido) continue;
      const bloco = h('div', { class: 'grupo', role: 'list' });
      for (const tarefa of grupo.tarefas) {
        bloco.appendChild(
          criarLinha(tarefa, grupo.chave, hoje, iaRecentes),
        );
      }
      raiz.appendChild(bloco);
    }
  }

  function render(grupos, { hoje, iaRecentes } = {}) {
    ultimo = {
      grupos: grupos || [],
      hoje,
      iaRecentes: iaRecentes instanceof Set ? iaRecentes : new Set(),
    };
    renderInterno();
  }

  return { render };
}
