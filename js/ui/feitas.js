// O que já foi feito, por dia. Tocar no círculo reabre a tarefa.

import { feitasPorDia, rotuloCaixa, tintaCaixa } from '../logica.js';
import { h, limpar } from './dom.js';

export function criarFeitas({ aoReabrir, obterCaixas = () => [] }) {
  const raiz = document.getElementById('feitas');

  function linha(tarefa, caixa) {
    const caixas = obterCaixas();
    const li = h('div', {
      class: `linha linha-feita tinta-${tintaCaixa(caixas, tarefa.area)}`,
      role: 'listitem',
    });
    const circulo = h('button', {
      class: 'circulo cheio',
      type: 'button',
      'aria-label': `Reabrir ${tarefa.titulo}`,
      title: 'Reabrir',
    });
    circulo.appendChild(h('span', { class: 'anel', 'aria-hidden': 'true' }, ['✓']));
    circulo.addEventListener('click', () => aoReabrir(tarefa));
    const corpo = h('div', { class: 'linha-corpo' });
    corpo.appendChild(h('span', { class: 'titulo-feito', text: tarefa.titulo }));
    if (caixa === 'tudo') {
      corpo.appendChild(
        h('span', { class: 'detalhe' }, [
          h('span', {
            class: `etiqueta tinta-${tintaCaixa(caixas, tarefa.area)}`,
            text: rotuloCaixa(caixas, tarefa.area),
          }),
        ]),
      );
    }
    li.appendChild(circulo);
    li.appendChild(corpo);
    return li;
  }

  function mostrar(tarefas, { caixa, hoje }) {
    limpar(raiz);
    const daCaixa = caixa === 'tudo' ? tarefas : tarefas.filter((t) => t.area === caixa);
    const dias = feitasPorDia(daCaixa, hoje);
    if (!dias.length) {
      raiz.appendChild(
        h('p', { class: 'vazio', text: 'Ainda nada concluído por aqui.' }),
      );
      return;
    }
    for (const dia of dias) {
      const bloco = h('section', { class: 'faixa' });
      bloco.appendChild(
        h('div', { class: 'faixa-cab' }, [
          h('span', { class: 'faixa-nome faixa-dia', text: dia.rotulo }),
        ]),
      );
      const lista = h('div', { class: 'faixa-lista', role: 'list' });
      for (const t of dia.tarefas) lista.appendChild(linha(t, caixa));
      bloco.appendChild(lista);
      raiz.appendChild(bloco);
    }
  }

  return { mostrar };
}
