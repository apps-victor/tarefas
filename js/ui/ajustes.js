// Painel de ajustes: conta, mudanças das IAs e exportação.

import { TINTAS, ROTULOS_TINTA, caixasOrdenadas } from '../logica.js';
import { h, liberarPainel, limpar, travarPainel } from './dom.js';
import { icone } from './icones.js';

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

export function criarAjustes({
  aoSair,
  aoListarIa,
  aoDesfazerIa,
  aoExportar,
  aoAtualizar,
  obterEmail,
  obterCaixas = () => [],
  contarTarefas = () => 0,
  aoCriarCaixa = async () => null,
  aoEditarCaixa = async () => null,
  aoOrdenarCaixas = async () => [],
  aoApagarCaixa = async () => ({ movidas: 0 }),
  modoLocal,
  comVoltar = () => () => {},
}) {
  const painel = document.getElementById('ajustes');
  const fundo = document.getElementById('ajustes-fundo');
  let aberto = false;
  let eventos = [];
  let carregando = false;
  let soltarVoltar = null;
  let caixas = [];
  let apagando = null;
  let erroCaixas = '';
  let salvandoCaixa = false;
  let paletaAberta = null;
  let paletaNovaAberta = false;
  let novaTinta = null;

  function mensagemCaixa(e) {
    const codigo = (e && (e.codigo || e.message)) || 'erro';
    if (codigo === 'rede') {
      return 'Para mudar as caixas, conecte-se à internet.';
    }
    if (codigo === 'limite_caixas') return 'O limite é de 12 caixas.';
    if (codigo === 'nome_repetido') return 'Já existe uma caixa com esse nome.';
    if (codigo === 'invalido:nome') {
      return 'O nome precisa ter de 1 a 30 caracteres, sem < nem >.';
    }
    if (codigo === 'invalido:tinta') return 'Escolha uma das tintas da paleta.';
    if (codigo === 'invalido:chaves') return 'Não foi possível salvar a ordem.';
    if (codigo === 'caixa_fixa') {
      return 'Esta caixa é usada por integrações e não pode ser apagada.';
    }
    if (codigo === 'ultima_caixa') {
      return 'O caderno precisa de pelo menos uma caixa.';
    }
    if (codigo === 'invalido:destino') {
      return 'Escolha outra caixa para receber as tarefas.';
    }
    if (codigo === 'nota_grande') {
      return 'A nota desta caixa somada à da caixa de destino ficaria grande demais. Encurte uma das duas e tente de novo.';
    }
    if (codigo === 'nao_encontrada') return 'Esta caixa não existe mais.';
    return String(codigo);
  }

  /** Primeira tinta da paleta que ainda não aparece em nenhuma caixa. */
  function tintaLivre() {
    const usadas = new Set(caixas.map((caixa) => caixa.tinta));
    return TINTAS.find((tinta) => !usadas.has(tinta)) || TINTAS[0];
  }

  function textoFixa(caixa) {
    if (caixa.chave === 'lapig') return 'recebe as reuniões da Agenda';
    if (caixa.chave === 'buriti') return 'ligada ao Buriti';
    if (caixa.chave === 'ia') return 'usada pelas IAs';
    return 'usada por uma integração';
  }

  async function acaoCaixa(operacao, aoConcluir, mensagem) {
    if (salvandoCaixa) return false;
    salvandoCaixa = true;
    erroCaixas = '';
    try {
      await operacao();
      caixas = caixasOrdenadas(obterCaixas());
      if (typeof aoConcluir === 'function') aoConcluir();
      return true;
    } catch (e) {
      erroCaixas =
        typeof mensagem === 'function' ? mensagem(e) : mensagemCaixa(e);
      return false;
    } finally {
      salvandoCaixa = false;
      if (aberto) render();
    }
  }

  function fechar() {
    if (!aberto) return;
    aberto = false;
    painel.hidden = true;
    fundo.hidden = true;
    liberarPainel();
    limpar(painel);
    if (soltarVoltar) {
      const soltar = soltarVoltar;
      soltarVoltar = null;
      soltar();
    }
  }

  // -------------------------------------------------------------- caixas

  function linhaCaixa(caixa, indice, online) {
    const linha = h('div', { class: 'caixa-linha' });
    const topo = h('div', { class: 'caixa-topo' });
    const cor = h('button', {
      class: `caixa-tinta-atual tinta-${caixa.tinta}`,
      type: 'button',
      title: 'Mudar a cor',
      'aria-label': `Mudar a cor de ${caixa.nome}`,
      'aria-expanded': paletaAberta === caixa.chave ? 'true' : 'false',
      disabled: !online || salvandoCaixa,
    });
    cor.appendChild(h('span', { class: 'bolinha' }));
    cor.addEventListener('click', () => {
      paletaAberta = paletaAberta === caixa.chave ? null : caixa.chave;
      render();
    });
    topo.appendChild(cor);

    const nome = h('input', {
      class: 'entrada caixa-nome',
      type: 'text',
      maxlength: '30',
      value: caixa.nome,
      'aria-label': `Nome da caixa ${caixa.nome}`,
      disabled: !online || salvandoCaixa,
    });
    nome.addEventListener('change', () => {
      const valor = nome.value.trim();
      if (!valor) {
        erroCaixas = 'O nome da caixa não pode ficar vazio.';
        render();
        return;
      }
      if (valor === caixa.nome) return;
      acaoCaixa(() => aoEditarCaixa(caixa.chave, { nome: valor }));
    });
    topo.appendChild(nome);

    const ordem = h('div', { class: 'caixa-acoes' });
    const subir = h('button', {
      class: 'icone caixa-seta',
      type: 'button',
      'aria-label': `Subir ${caixa.nome}`,
      text: '↑',
      disabled: !online || salvandoCaixa || indice === 0,
    });
    subir.addEventListener('click', () => {
      const chaves = caixas.map((item) => item.chave);
      const i = chaves.indexOf(caixa.chave);
      if (i <= 0) return;
      [chaves[i - 1], chaves[i]] = [chaves[i], chaves[i - 1]];
      acaoCaixa(() => aoOrdenarCaixas(chaves));
    });
    ordem.appendChild(subir);

    const descer = h('button', {
      class: 'icone caixa-seta',
      type: 'button',
      'aria-label': `Descer ${caixa.nome}`,
      text: '↓',
      disabled: !online || salvandoCaixa || indice === caixas.length - 1,
    });
    descer.addEventListener('click', () => {
      const chaves = caixas.map((item) => item.chave);
      const i = chaves.indexOf(caixa.chave);
      if (i < 0 || i >= chaves.length - 1) return;
      [chaves[i + 1], chaves[i]] = [chaves[i], chaves[i + 1]];
      acaoCaixa(() => aoOrdenarCaixas(chaves));
    });
    ordem.appendChild(descer);

    if (!caixa.fixa) {
      const apagar = h('button', {
        class: 'botao botao-pequeno botao-discreto',
        type: 'button',
        text: 'Apagar',
        disabled: !online || salvandoCaixa,
      });
      apagar.addEventListener('click', () => {
        apagando = caixa.chave;
        paletaAberta = null;
        erroCaixas = '';
        render();
      });
      ordem.appendChild(apagar);
    }
    topo.appendChild(ordem);
    linha.appendChild(topo);

    if (online && paletaAberta === caixa.chave) {
      const tintas = h('div', {
        class: 'caixa-tintas',
        role: 'group',
        'aria-label': `Tinta de ${caixa.nome}`,
      });
      for (const tinta of TINTAS) {
        const ativa = caixa.tinta === tinta;
        const opcao = h('button', {
          class: `tinta-opcao${ativa ? ' ativa' : ''}`,
          type: 'button',
          'aria-label': `Tinta ${ROTULOS_TINTA[tinta]}`,
          'aria-pressed': ativa ? 'true' : 'false',
          disabled: salvandoCaixa,
        });
        opcao.appendChild(h('span', { class: `bolinha tinta-${tinta}` }));
        opcao.addEventListener('click', () => {
          if (ativa) {
            paletaAberta = null;
            render();
            return;
          }
          acaoCaixa(
            () => aoEditarCaixa(caixa.chave, { tinta }),
            () => {
              paletaAberta = null;
            },
          );
        });
        tintas.appendChild(opcao);
      }
      linha.appendChild(tintas);
    }

    if (caixa.fixa) {
      linha.appendChild(
        h('p', {
          class: 'caixa-fixa',
          text: textoFixa(caixa),
        }),
      );
    }

    return linha;
  }

  function blocoApagar(caixa) {
    const bloco = h('div', { class: 'caixa-apagar' });
    const quantidade = Math.max(0, Number(contarTarefas(caixa.chave)) || 0);
    bloco.appendChild(
      h('p', {
        class: 'caixa-apagar-titulo',
        text: `Para qual caixa vão as ${quantidade} ${
          quantidade === 1 ? 'tarefa' : 'tarefas'
        }?`,
      }),
    );
    bloco.appendChild(
      h('p', {
        class: 'suave',
        text: 'As tarefas e a nota desta caixa vão para a escolhida; nada se perde.',
      }),
    );
    const opcoes = h('div', { class: 'caixa-apagar-opcoes' });
    for (const destino of caixas) {
      if (destino.chave === caixa.chave) continue;
      const botao = h('button', {
        class: `chip chip-caixa tinta-${destino.tinta}`,
        type: 'button',
        text: destino.nome,
        disabled: salvandoCaixa,
      });
      botao.addEventListener('click', () => {
        acaoCaixa(
          () => aoApagarCaixa(caixa.chave, destino.chave),
          () => {
            apagando = null;
          },
          (e) =>
            e && e.codigo === 'nota_grande'
              ? `A nota desta caixa somada à de ${destino.nome} ficaria grande demais. Encurte uma das duas e tente de novo.`
              : mensagemCaixa(e),
        );
      });
      opcoes.appendChild(botao);
    }
    bloco.appendChild(opcoes);
    const cancelar = h('button', {
      class: 'botao botao-pequeno botao-discreto',
      type: 'button',
      text: 'Cancelar',
    });
    cancelar.addEventListener('click', () => {
      apagando = null;
      render();
    });
    bloco.appendChild(cancelar);
    return bloco;
  }

  function formNovaCaixa(online) {
    if (!novaTinta || !TINTAS.includes(novaTinta)) novaTinta = tintaLivre();
    const bloco = h('form', { class: 'caixa-nova' });
    bloco.appendChild(h('p', { class: 'caixa-nova-titulo', text: '+ Nova caixa' }));
    const linhaNome = h('div', { class: 'caixa-nova-nome' });
    const cor = h('button', {
      class: `caixa-tinta-atual tinta-${novaTinta}`,
      type: 'button',
      title: 'Mudar a cor',
      'aria-label': 'Mudar a cor da nova caixa',
      'aria-expanded': paletaNovaAberta ? 'true' : 'false',
      disabled: !online || salvandoCaixa,
    });
    cor.appendChild(h('span', { class: 'bolinha' }));
    linhaNome.appendChild(cor);

    const nome = h('input', {
      class: 'entrada',
      type: 'text',
      maxlength: '30',
      placeholder: 'Nome da caixa',
      'aria-label': 'Nome da nova caixa',
      disabled: !online || salvandoCaixa,
    });
    linhaNome.appendChild(nome);
    bloco.appendChild(linhaNome);

    const tintas = h('div', {
      class: 'caixa-tintas',
      role: 'group',
      'aria-label': 'Tinta da nova caixa',
      hidden: !paletaNovaAberta,
    });
    const botoes = [];
    for (const tinta of TINTAS) {
      const botao = h('button', {
        class: `tinta-opcao${novaTinta === tinta ? ' ativa' : ''}`,
        type: 'button',
        'aria-label': `Tinta ${ROTULOS_TINTA[tinta]}`,
        'aria-pressed': novaTinta === tinta ? 'true' : 'false',
        disabled: !online || salvandoCaixa,
      });
      botao.appendChild(h('span', { class: `bolinha tinta-${tinta}` }));
      botao.addEventListener('click', () => {
        novaTinta = tinta;
        for (const [outro, valor] of botoes) {
          const ativo = valor === tinta;
          outro.classList.toggle('ativa', ativo);
          outro.setAttribute('aria-pressed', ativo ? 'true' : 'false');
        }
        cor.className = `caixa-tinta-atual tinta-${tinta}`;
        cor.setAttribute('aria-expanded', 'false');
        paletaNovaAberta = false;
        tintas.hidden = true;
      });
      botoes.push([botao, tinta]);
      tintas.appendChild(botao);
    }
    cor.addEventListener('click', () => {
      paletaNovaAberta = !paletaNovaAberta;
      tintas.hidden = !paletaNovaAberta;
      cor.setAttribute('aria-expanded', paletaNovaAberta ? 'true' : 'false');
    });
    bloco.appendChild(tintas);

    const criar = h('button', {
      class: 'botao botao-pequeno',
      type: 'submit',
      text: 'Criar caixa',
      disabled: !online || salvandoCaixa,
    });
    bloco.appendChild(criar);

    bloco.addEventListener('submit', (evento) => {
      evento.preventDefault();
      const valor = nome.value.trim();
      if (!valor) {
        erroCaixas = 'Dê um nome à nova caixa.';
        render();
        return;
      }
      acaoCaixa(
        () => aoCriarCaixa(valor, novaTinta),
        () => {
          novaTinta = null;
          paletaNovaAberta = false;
        },
      );
    });
    return bloco;
  }

  function render() {
    caixas = caixasOrdenadas(obterCaixas());
    if (paletaAberta && !caixas.some((caixa) => caixa.chave === paletaAberta)) {
      paletaAberta = null;
    }
    const online =
      modoLocal ||
      typeof navigator === 'undefined' ||
      navigator.onLine !== false;
    limpar(painel);
    const cabecalho = h('div', { class: 'painel-cabecalho' });
    cabecalho.appendChild(h('h2', { class: 'painel-titulo', text: 'Ajustes' }));
    const fecharBotao = h('button', {
      class: 'icone',
      type: 'button',
      'aria-label': 'Fechar ajustes',
    });
    fecharBotao.appendChild(icone('fechar', { tamanho: 22 }));
    fecharBotao.addEventListener('click', fechar);
    cabecalho.appendChild(fecharBotao);
    painel.appendChild(cabecalho);

    const email = obterEmail();
    painel.appendChild(
      h('p', {
        class: 'ajustes-conta',
        text: modoLocal
          ? 'modo local — sem sincronizar'
          : email || 'conta conectada',
      }),
    );

    if (!modoLocal) {
      const sair = h('button', {
        class: 'botao',
        type: 'button',
        text: 'Sair',
      });
      sair.addEventListener('click', async () => {
        fechar();
        await aoSair();
      });
      painel.appendChild(sair);
    }

    if (typeof aoAtualizar === 'function') {
      painel.appendChild(h('h3', { class: 'secao-titulo', text: 'App' }));
      painel.appendChild(
        h('p', {
          class: 'suave',
          text: 'Recarrega a versão publicada mais recente.',
        }),
      );
      const atualizar = h('button', {
        class: 'botao',
        type: 'button',
        text: 'Atualizar app',
      });
      atualizar.addEventListener('click', async () => {
        atualizar.disabled = true;
        atualizar.textContent = 'Atualizando…';
        try {
          await aoAtualizar();
        } catch {
          atualizar.disabled = false;
          atualizar.textContent = 'Atualizar app';
        }
      });
      painel.appendChild(atualizar);
    }

    painel.appendChild(h('h3', { class: 'secao-titulo', text: 'Caixas' }));
    if (!online) {
      painel.appendChild(
        h('p', {
          class: 'suave',
          text: 'Para mudar as caixas, conecte-se à internet.',
        }),
      );
    }
    if (erroCaixas) {
      painel.appendChild(
        h('p', { class: 'caixa-erro', role: 'status', text: erroCaixas }),
      );
    }
    if (apagando && !caixas.some((caixa) => caixa.chave === apagando)) {
      apagando = null;
    }
    const listaCaixas = h('div', { class: 'lista-caixas' });
    caixas.forEach((caixa, indice) => {
      listaCaixas.appendChild(linhaCaixa(caixa, indice, online));
      if (apagando === caixa.chave) {
        listaCaixas.appendChild(blocoApagar(caixa));
      }
    });
    painel.appendChild(listaCaixas);
    if (online && caixas.length < 12) {
      painel.appendChild(formNovaCaixa(online));
    } else if (online) {
      painel.appendChild(
        h('p', { class: 'suave', text: 'Limite de 12 caixas.' }),
      );
    }

    // Sem nenhuma mudança de IA, a seção inteira fica escondida (não há como
    // saber se a conta tem IA sem mudar o banco; a lista vazia é o sinal).
    if (eventos.length) {
      painel.appendChild(
        h('h3', { class: 'secao-titulo', text: 'Mudanças das IAs (24 h)' }),
      );
      const lista = h('div', { class: 'lista-ia' });
      for (const evento of eventos.slice(0, 50)) {
        const titulo =
          (evento.depois && evento.depois.titulo) ||
          (evento.antes && evento.antes.titulo) ||
          (evento.tarefa_id ? String(evento.tarefa_id).slice(0, 8) : '');
        const origem = evento.origem || 'ia';
        lista.appendChild(
          h('p', {
            class: 'linha-ia',
            text: `${dataHora(evento.em)} · ${evento.acao || 'mudança'} · ${origem}${
              titulo ? ` · ${titulo}` : ''
            }`,
          }),
        );
      }
      painel.appendChild(lista);

      const desfazer = h('button', {
        class: 'botao',
        type: 'button',
        text: 'Desfazer todas',
      });
      desfazer.disabled = carregando;
      desfazer.addEventListener('click', async () => {
        carregando = true;
        render();
        try {
          await aoDesfazerIa();
          eventos = (await aoListarIa()) || [];
        } catch {
          // o app mostra o erro
        } finally {
          carregando = false;
          render();
        }
      });
      painel.appendChild(desfazer);
    }

    painel.appendChild(h('h3', { class: 'secao-titulo', text: 'Dados' }));
    const exportar = h('button', {
      class: 'botao',
      type: 'button',
      text: 'Exportar JSON',
    });
    exportar.addEventListener('click', () => aoExportar());
    painel.appendChild(exportar);

    if (modoLocal) {
      const previa = h('button', {
        class: 'botao botao-discreto botao-pequeno',
        type: 'button',
        text: 'Abrir prévia com dados de exemplo',
      });
      previa.addEventListener('click', () => {
        location.href = './previa.html';
      });
      painel.appendChild(previa);
    }
  }

  async function abrir() {
    if (!aberto) {
      aberto = true;
      travarPainel();
      if (!soltarVoltar) {
        soltarVoltar = comVoltar(() => {
          soltarVoltar = null;
          fechar();
        });
      }
    }
    painel.hidden = false;
    fundo.hidden = false;
    carregando = true;
    eventos = [];
    caixas = caixasOrdenadas(obterCaixas());
    apagando = null;
    erroCaixas = '';
    paletaAberta = null;
    paletaNovaAberta = false;
    novaTinta = null;
    render();
    try {
      eventos = (await aoListarIa()) || [];
    } catch {
      eventos = [];
    } finally {
      carregando = false;
      if (aberto) render();
    }
  }

  fundo.addEventListener('click', fechar);
  document.addEventListener('keydown', (evento) => {
    if (evento.key === 'Escape' && aberto) fechar();
  });

  return { abrir, fechar, estaAberto: () => aberto };
}
