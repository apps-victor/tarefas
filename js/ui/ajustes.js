// Painel de ajustes: conta, mudanças das IAs e exportação.

import { h, limpar } from './dom.js';
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
  obterEmail,
  modoLocal,
}) {
  const painel = document.getElementById('ajustes');
  const fundo = document.getElementById('ajustes-fundo');
  let aberto = false;
  let eventos = [];
  let carregando = false;

  function fechar() {
    aberto = false;
    painel.hidden = true;
    fundo.hidden = true;
    limpar(painel);
  }

  function render() {
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

    painel.appendChild(
      h('h3', { class: 'secao-titulo', text: 'Mudanças das IAs (24 h)' }),
    );
    const lista = h('div', { class: 'lista-ia' });
    if (carregando) {
      lista.appendChild(h('p', { class: 'suave', text: 'Carregando…' }));
    } else if (!eventos.length) {
      lista.appendChild(
        h('p', { class: 'suave', text: 'Nenhuma mudança nas últimas 24 horas.' }),
      );
    } else {
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
    }
    painel.appendChild(lista);

    const desfazer = h('button', {
      class: 'botao',
      type: 'button',
      text: 'Desfazer todas',
    });
    desfazer.disabled = carregando || !eventos.length;
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

    painel.appendChild(h('h3', { class: 'secao-titulo', text: 'Dados' }));
    const exportar = h('button', {
      class: 'botao',
      type: 'button',
      text: 'Exportar JSON',
    });
    exportar.addEventListener('click', () => aoExportar());
    painel.appendChild(exportar);
  }

  async function abrir() {
    aberto = true;
    painel.hidden = false;
    fundo.hidden = false;
    document.body.classList.add('painel-aberto');
    carregando = true;
    eventos = [];
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
