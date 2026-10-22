// Folha/painel de detalhes da tarefa.

import { AREAS, ROTULOS_AREA, diaSemana, hojeSP } from '../logica.js';
import { h, limpar } from './dom.js';
import { icone } from './icones.js';

function mensagemErro(e) {
  const codigo = (e && (e.codigo || e.message)) || 'erro';
  if (codigo === 'conflito') return 'Esta tarefa mudou em outro aparelho.';
  if (codigo === 'nao_encontrada') return 'Tarefa não encontrada.';
  if (codigo === 'rede') return 'Sem conexão. A mudança ficou na fila.';
  if (codigo === 'limite') return 'Muitas mudanças em pouco tempo.';
  if (String(codigo).startsWith('invalido:')) return 'Valor inválido.';
  return String(codigo);
}

function dataHora(instante) {
  if (!instante) return '';
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return '';
  try {
    return d.toLocaleString('pt-BR', {
      timeZone: 'America/Sao_Paulo',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export function criarDetalhes({
  aoSalvar,
  aoSubCriar,
  aoSubMarcar,
  aoSubEditar,
  aoSubApagar,
  aoArquivar,
  aoReabrir,
  aoEventos,
}) {
  const painel = document.getElementById('detalhes');
  const fundo = document.getElementById('detalhes-fundo');

  let tarefaAtual = null;
  let aberto = false;
  let historicoAberto = false;
  let eventosCache = null;
  let carregandoEventos = false;
  let personalizado = null;
  let statusTexto = '';

  // Edições em campos diferentes acontecem em sequência (blur após blur).
  // A fila evita que a segunda use uma versão já vencida pela primeira.
  let cadeia = Promise.resolve();
  function emOrdem(operacao) {
    const proxima = cadeia.then(operacao, operacao);
    cadeia = proxima.catch(() => {});
    return proxima;
  }

  function status(texto) {
    statusTexto = texto || '';
    const alvo = painel.querySelector('.status-detalhes');
    if (alvo) alvo.textContent = statusTexto;
  }

  function fechar() {
    aberto = false;
    tarefaAtual = null;
    personalizado = null;
    historicoAberto = false;
    eventosCache = null;
    painel.hidden = true;
    fundo.hidden = true;
    document.body.classList.remove('painel-aberto');
    limpar(painel);
  }

  function aplicarTarefa(nova) {
    if (!nova || !aberto || !tarefaAtual || nova.id !== tarefaAtual.id) return;
    tarefaAtual = nova;
    render();
  }

  async function recarregarEventos() {
    if (!tarefaAtual || carregandoEventos) return;
    carregandoEventos = true;
    try {
      eventosCache = (await aoEventos(tarefaAtual.id)) || [];
    } catch {
      eventosCache = [];
    } finally {
      carregandoEventos = false;
    }
    if (aberto) render();
  }

  function salvar(campos, { rerender = false } = {}) {
    return emOrdem(async () => {
      if (!tarefaAtual) return;
      try {
        const nova = await aoSalvar(tarefaAtual, campos);
        if (nova) {
          tarefaAtual = nova;
          personalizado = null;
          status('Salvo');
          if (rerender && aberto) render();
        }
      } catch (e) {
        status(mensagemErro(e));
        if (aberto) render();
      }
    });
  }

  function acaoSubtarefa(acao, sub, valor) {
    return emOrdem(async () => {
      if (!tarefaAtual) return;
      try {
        let nova = null;
        if (acao === 'criar') {
          nova = await aoSubCriar(tarefaAtual.id, valor);
        } else if (acao === 'marcar') {
          nova = await aoSubMarcar(tarefaAtual.id, sub.id, valor);
        } else if (acao === 'editar') {
          nova = await aoSubEditar(tarefaAtual.id, sub.id, valor);
        } else if (acao === 'apagar') {
          nova = await aoSubApagar(tarefaAtual.id, sub.id);
        }
        status('Salvo');
        if (nova) {
          tarefaAtual = nova;
          if (aberto) render();
        }
      } catch (e) {
        status(mensagemErro(e));
      }
    });
  }

  function montarRepetir({ freq, intervalo }) {
    const base = (tarefaAtual && tarefaAtual.quando) || hojeSP();
    const saida = { freq, intervalo: Number(intervalo) || 1 };
    const atual = tarefaAtual && tarefaAtual.repetir;
    if (freq === 'semanal') {
      saida.dias_semana =
        atual && atual.freq === 'semanal' && atual.dias_semana
          ? atual.dias_semana
          : [diaSemana(base)];
    }
    if (freq === 'mensal') {
      saida.dia_mes =
        atual && atual.freq === 'mensal' && atual.dia_mes
          ? atual.dia_mes
          : Number(base.slice(8, 10));
    }
    return saida;
  }

  function campoTitulo(tarefa) {
    const entrada = h('input', {
      class: 'entrada entrada-titulo',
      type: 'text',
      maxlength: '300',
      value: tarefa.titulo || '',
      'aria-label': 'Título',
    });
    entrada.addEventListener('change', () => {
      const valor = entrada.value.trim();
      if (!valor && tarefa.titulo) {
        entrada.value = tarefa.titulo;
        status('O título não pode ficar vazio.');
        return;
      }
      if (valor === (tarefa.titulo || '')) return;
      salvar({ titulo: valor });
    });
    return entrada;
  }

  function campoNotas(tarefa) {
    const area = h('textarea', {
      class: 'entrada entrada-notas',
      rows: '4',
      maxlength: '5000',
      placeholder: 'Notas',
      'aria-label': 'Notas',
    });
    area.value = tarefa.notas || '';
    area.addEventListener('change', () => {
      const valor = area.value;
      if (valor === (tarefa.notas || '')) return;
      salvar({ notas: valor.trim() ? valor : null });
    });
    return area;
  }

  function repetirAjustadoParaData(repetir, data) {
    if (!repetir || !data) return repetir;
    if (repetir.freq === 'semanal') {
      // Com um único dia da semana, mudar a data move a repetição junto.
      if (Array.isArray(repetir.dias_semana) && repetir.dias_semana.length === 1) {
        return { ...repetir, dias_semana: [diaSemana(data)] };
      }
      return repetir;
    }
    if (repetir.freq === 'mensal' && repetir.dia_mes) {
      return { ...repetir, dia_mes: Number(data.slice(8, 10)) };
    }
    return repetir;
  }

  function campoData(tarefa) {
    const entrada = h('input', {
      class: 'entrada',
      type: 'date',
      value: tarefa.quando || '',
      'aria-label': 'Data',
    });
    entrada.addEventListener('change', () => {
      const data = entrada.value || null;
      const campos = { quando: data };
      if (data && tarefa.repetir) {
        campos.repetir = repetirAjustadoParaData(tarefa.repetir, data);
      }
      salvar(campos);
    });
    return entrada;
  }

  function campoHora(tarefa) {
    const entrada = h('input', {
      class: 'entrada',
      type: 'time',
      value: tarefa.hora || '',
      'aria-label': 'Hora',
    });
    entrada.addEventListener('change', () => {
      salvar({ hora: entrada.value || null });
    });
    return entrada;
  }

  function campoArea(tarefa) {
    const selecao = h('select', { class: 'entrada', 'aria-label': 'Área' });
    for (const area of AREAS) {
      const opcao = h('option', {
        value: area,
        text: ROTULOS_AREA[area],
      });
      selecao.appendChild(opcao);
    }
    selecao.value = tarefa.area || 'pessoal';
    selecao.addEventListener('change', () => {
      salvar({ area: selecao.value });
    });
    return selecao;
  }

  function campoRepetir(tarefa) {
    if (!personalizado && tarefa.repetir && tarefa.repetir.intervalo > 1) {
      personalizado = {
        freq: tarefa.repetir.freq,
        intervalo: tarefa.repetir.intervalo,
      };
    }
    const bloco = h('div', { class: 'campo-repetir' });
    const selecao = h('select', { class: 'entrada', 'aria-label': 'Repetir' });
    const opcoes = [
      ['nenhum', 'Não repete'],
      ['diaria', 'Todo dia'],
      ['semanal', 'Toda semana'],
      ['mensal', 'Todo mês'],
      ['personalizar', 'Personalizar intervalo'],
    ];
    for (const [valor, rotulo] of opcoes) {
      selecao.appendChild(h('option', { value: valor, text: rotulo }));
    }
    if (!tarefa.repetir) selecao.value = 'nenhum';
    else if (personalizado || tarefa.repetir.intervalo > 1) {
      selecao.value = 'personalizar';
    } else {
      selecao.value = tarefa.repetir.freq;
    }

    selecao.addEventListener('change', () => {
      const valor = selecao.value;
      if (valor === 'nenhum') {
        personalizado = null;
        salvar({ repetir: null }, { rerender: true });
      } else if (valor === 'personalizar') {
        personalizado = {
          freq: (tarefa.repetir && tarefa.repetir.freq) || 'diaria',
          intervalo: Math.max(
            2,
            (tarefa.repetir && tarefa.repetir.intervalo) || 2,
          ),
        };
        render();
      } else {
        personalizado = null;
        salvar(
          { repetir: montarRepetir({ freq: valor, intervalo: 1 }) },
          { rerender: true },
        );
      }
    });
    bloco.appendChild(selecao);

    if (selecao.value === 'personalizar') {
      const linha = h('div', { class: 'repetir-personalizado' });
      const freq = h('select', {
        class: 'entrada entrada-curta',
        'aria-label': 'Frequência',
      });
      freq.appendChild(h('option', { value: 'diaria', text: 'dias' }));
      freq.appendChild(h('option', { value: 'semanal', text: 'semanas' }));
      freq.appendChild(h('option', { value: 'mensal', text: 'meses' }));
      freq.value = (personalizado && personalizado.freq) || 'diaria';
      const numero = h('input', {
        class: 'entrada entrada-numero',
        type: 'number',
        min: '2',
        max: '365',
        value: String((personalizado && personalizado.intervalo) || 2),
        'aria-label': 'Intervalo',
      });
      const aplicar = () => {
        const intervalo = Math.min(
          365,
          Math.max(2, Number(numero.value) || 2),
        );
        personalizado = { freq: freq.value, intervalo };
        salvar(
          { repetir: montarRepetir(personalizado) },
          { rerender: true },
        );
      };
      freq.addEventListener('change', aplicar);
      numero.addEventListener('change', aplicar);
      linha.appendChild(h('span', { class: 'suave', text: 'a cada' }));
      linha.appendChild(numero);
      linha.appendChild(freq);
      bloco.appendChild(linha);
    }
    return bloco;
  }

  function campoLink(tarefa) {
    const entrada = h('input', {
      class: 'entrada',
      type: 'url',
      value: tarefa.link || '',
      placeholder: 'https://',
      'aria-label': 'Link',
    });
    entrada.addEventListener('change', () => {
      const valor = entrada.value.trim();
      if (valor === (tarefa.link || '')) return;
      salvar({ link: valor || null });
    });
    return entrada;
  }

  function blocoSubtarefas(tarefa) {
    const bloco = h('div', { class: 'subtarefas' });
    const subs = Array.isArray(tarefa.subtarefas) ? tarefa.subtarefas : [];
    for (const sub of subs) {
      const linha = h('div', { class: 'sub-linha' });
      const check = h('input', {
        class: 'sub-check',
        type: 'checkbox',
        checked: sub.feita === true,
        'aria-label': `Feita: ${sub.texto}`,
      });
      check.addEventListener('change', () => {
        acaoSubtarefa('marcar', sub, check.checked);
      });
      const checkAlvo = h('label', { class: 'sub-check-alvo' });
      checkAlvo.appendChild(check);
      const texto = h('input', {
        class: 'sub-texto',
        type: 'text',
        maxlength: '300',
        value: sub.texto,
        'aria-label': 'Subtarefa',
      });
      texto.addEventListener('change', () => {
        const valor = texto.value.trim();
        if (!valor) {
          texto.value = sub.texto;
          return;
        }
        if (valor === sub.texto) return;
        acaoSubtarefa('editar', sub, valor);
      });
      const apagar = h('button', {
        class: 'sub-apagar',
        type: 'button',
        'aria-label': `Apagar subtarefa ${sub.texto}`,
      });
      apagar.appendChild(icone('fechar', { tamanho: 14 }));
      apagar.addEventListener('click', () => {
        acaoSubtarefa('apagar', sub);
      });
      linha.appendChild(checkAlvo);
      linha.appendChild(texto);
      linha.appendChild(apagar);
      bloco.appendChild(linha);
    }

    const form = h('form', { class: 'sub-form' });
    const entrada = h('input', {
      class: 'entrada',
      type: 'text',
      maxlength: '300',
      placeholder: 'Adicionar subtarefa',
      'aria-label': 'Adicionar subtarefa',
    });
    const botao = h('button', {
      class: 'botao botao-pequeno',
      type: 'submit',
      text: 'Adicionar',
    });
    form.appendChild(entrada);
    form.appendChild(botao);
    form.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const valor = entrada.value.trim();
      if (!valor) return;
      entrada.value = '';
      acaoSubtarefa('criar', null, valor);
    });
    bloco.appendChild(form);
    return bloco;
  }

  function blocoHistorico(tarefa) {
    const detalhes = h('details', { class: 'historico' });
    if (historicoAberto) detalhes.open = true;
    detalhes.appendChild(h('summary', { text: 'Histórico' }));
    const conteudo = h('div', { class: 'historico-conteudo' });
    if (eventosCache) {
      if (!eventosCache.length) {
        conteudo.appendChild(
          h('p', { class: 'suave', text: 'Nenhum evento.' }),
        );
      }
      for (const evento of eventosCache.slice(0, 50)) {
        const origem =
          evento.origem && String(evento.origem).startsWith('ia:')
            ? evento.origem
            : 'você';
        const titulo =
          (evento.depois && evento.depois.titulo) ||
          (evento.antes && evento.antes.titulo) ||
          '';
        conteudo.appendChild(
          h('p', {
            class: 'historico-linha',
            text: `${dataHora(evento.em)} · ${evento.acao} · ${origem}${
              titulo ? ` · ${titulo}` : ''
            }`,
          }),
        );
      }
    } else {
      conteudo.appendChild(h('p', { class: 'suave', text: 'Carregando…' }));
    }
    detalhes.appendChild(conteudo);
    detalhes.addEventListener('toggle', () => {
      historicoAberto = detalhes.open;
      if (detalhes.open && !eventosCache) recarregarEventos();
    });
    return detalhes;
  }

  function render() {
    if (!tarefaAtual) return;
    const tarefa = tarefaAtual;
    const rolagem = painel.scrollTop;
    limpar(painel);

    const cabecalho = h('div', { class: 'painel-cabecalho' });
    cabecalho.appendChild(h('h2', { class: 'painel-titulo', text: 'Detalhes' }));
    const fecharBotao = h('button', {
      class: 'icone',
      type: 'button',
      'aria-label': 'Fechar detalhes',
    });
    fecharBotao.appendChild(icone('fechar', { tamanho: 22 }));
    fecharBotao.addEventListener('click', fechar);
    cabecalho.appendChild(fecharBotao);
    painel.appendChild(cabecalho);

    painel.appendChild(campoTitulo(tarefa));
    painel.appendChild(campoNotas(tarefa));

    const linhaData = h('div', { class: 'linha-campos' });
    linhaData.appendChild(
      h('label', { class: 'campo' }, [
        h('span', { class: 'campo-rotulo', text: 'Data' }),
        campoData(tarefa),
      ]),
    );
    linhaData.appendChild(
      h('label', { class: 'campo' }, [
        h('span', { class: 'campo-rotulo', text: 'Hora' }),
        campoHora(tarefa),
      ]),
    );
    painel.appendChild(linhaData);

    painel.appendChild(
      h('label', { class: 'campo' }, [
        h('span', { class: 'campo-rotulo', text: 'Área' }),
        campoArea(tarefa),
      ]),
    );
    painel.appendChild(
      h('label', { class: 'campo' }, [
        h('span', { class: 'campo-rotulo', text: 'Repetir' }),
        campoRepetir(tarefa),
      ]),
    );
    painel.appendChild(
      h('label', { class: 'campo' }, [
        h('span', { class: 'campo-rotulo', text: 'Link' }),
        campoLink(tarefa),
      ]),
    );

    painel.appendChild(
      h('h3', { class: 'secao-titulo', text: 'Subtarefas' }),
    );
    painel.appendChild(blocoSubtarefas(tarefa));

    const acoes = h('div', { class: 'acoes-painel' });
    if (tarefa.estado === 'feita' || tarefa.estado === 'arquivada') {
      const reabrir = h('button', {
        class: 'botao',
        type: 'button',
        text: 'Reabrir',
      });
      reabrir.addEventListener('click', () => {
        emOrdem(async () => {
          if (!tarefaAtual) return;
          try {
            const nova = await aoReabrir(tarefaAtual);
            if (nova) aplicarTarefa(nova);
          } catch (e) {
            status(mensagemErro(e));
          }
        });
      });
      acoes.appendChild(reabrir);
    } else {
      const esperando = tarefa.estado === 'esperando';
      const botao = h('button', {
        class: 'botao',
        type: 'button',
        text: esperando ? 'Tirar de esperando' : 'Marcar como esperando',
      });
      botao.addEventListener('click', () => {
        salvar({ estado: esperando ? 'aberta' : 'esperando' }, { rerender: true });
      });
      acoes.appendChild(botao);

      const arquivar = h('button', {
        class: 'botao botao-discreto',
        type: 'button',
        text: 'Arquivar',
      });
      arquivar.addEventListener('click', () => {
        emOrdem(async () => {
          if (!tarefaAtual) return;
          try {
            await aoArquivar(tarefaAtual);
            fechar();
          } catch (e) {
            status(mensagemErro(e));
          }
        });
      });
      acoes.appendChild(arquivar);
    }
    painel.appendChild(acoes);

    painel.appendChild(blocoHistorico(tarefa));

    painel.appendChild(
      h('p', { class: 'status-detalhes', text: statusTexto, role: 'status' }),
    );

    painel.scrollTop = rolagem;
  }

  function abrir(tarefa) {
    if (!tarefa) return;
    tarefaAtual = tarefa;
    aberto = true;
    personalizado = null;
    historicoAberto = false;
    eventosCache = null;
    statusTexto = '';
    render();
    painel.hidden = false;
    fundo.hidden = false;
    document.body.classList.add('painel-aberto');
    const titulo = painel.querySelector('.entrada-titulo');
    if (titulo) titulo.focus();
  }

  fundo.addEventListener('click', fechar);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && aberto) fechar();
  });

  return { abrir, fechar, atualizar: aplicarTarefa, estaAberto: () => aberto };
}
