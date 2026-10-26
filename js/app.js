// Ponto de entrada do PWA (caderno: caixas, faixas, notas e feitas).

import { dados, modoLocal } from './dados.js';
import {
  ROTULOS_FAIXA,
  camposParaFaixa,
  caixaLembrada,
  caixasOrdenadas,
  dataPorExtenso,
  ehExterna,
  faixaDe,
  hojeSP,
  organizarCaixa,
  rotuloCaixa,
  rotuloCurto,
  semAcento,
  tintaCaixa,
} from './logica.js';
import { criarLista } from './ui/lista.js';
import { criarNova, criarEscolherData } from './ui/nova.js';
import { criarNotas } from './ui/notas.js';
import { criarFeitas } from './ui/feitas.js';
import { criarDetalhes } from './ui/detalhes.js';
import { criarAjustes } from './ui/ajustes.js';
import { h, limpar } from './ui/dom.js';
import { icone } from './ui/icones.js';

const MODOS = [
  { chave: 'tarefas', rotulo: 'Tarefas' },
  { chave: 'notas', rotulo: 'Notas' },
  { chave: 'feitas', rotulo: 'Feitas' },
];

const estado = {
  tarefas: [],
  caixas: [],
  hoje: hojeSP(),
  caixa: lerLembrado('tarefas.caixa.v2', 'tudo'),
  modo: 'tarefas',
  busca: '',
  iaRecentes: new Set(),
  autenticado: modoLocal,
  membro: modoLocal ? 'dono' : null,
};

/** 'tudo' + as chaves das caixas, na ordem do usuário. */
function chavesDisponiveis() {
  return ['tudo', ...caixasOrdenadas(estado.caixas).map((caixa) => caixa.chave)];
}

function tintaDaCaixa(chave) {
  return chave === 'tudo' ? 'tudo' : tintaCaixa(estado.caixas, chave);
}

function assinaturaCaixas(lista) {
  return (Array.isArray(lista) ? lista : [])
    .map((caixa) => `${caixa.chave}:${caixa.nome}:${caixa.tinta}:${caixa.ordem}`)
    .join('|');
}

function lerLembrado(chave, padrao) {
  try {
    const valor = localStorage.getItem(chave);
    return valor || padrao;
  } catch {
    return padrao;
  }
}

function lembrar(chave, valor) {
  try {
    localStorage.setItem(chave, valor);
  } catch {
    // sem storage
  }
}

function mensagem(e) {
  const codigo = (e && (e.codigo || e.message)) || 'erro';
  if (codigo === 'conflito') return 'Esta tarefa mudou em outro aparelho.';
  if (codigo === 'nao_encontrada') return 'Tarefa não encontrada.';
  if (codigo === 'sem_acesso') return 'Esta conta não tem acesso.';
  if (codigo === 'limite') return 'Muitas mudanças em pouco tempo.';
  if (codigo === 'rede') return 'Sem conexão. A mudança ficou na fila.';
  if (String(codigo).startsWith('invalido:')) return 'Valor inválido.';
  return String(codigo);
}

// ---------------------------------------------------------------------------
// Elementos

const el = {
  faixaLocal: document.getElementById('faixa-local'),
  telaCarregando: document.getElementById('tela-carregando'),
  telaLogin: document.getElementById('tela-login'),
  telaSemAcesso: document.getElementById('tela-sem-acesso'),
  telaApp: document.getElementById('tela-app'),
  emailSemAcesso: document.getElementById('email-sem-acesso'),
  formEmail: document.getElementById('form-email'),
  email: document.getElementById('email'),
  btnEnviarCodigo: document.getElementById('btn-enviar-codigo'),
  formCodigo: document.getElementById('form-codigo'),
  codigo: document.getElementById('codigo'),
  codigoEnviado: document.getElementById('codigo-enviado'),
  btnEntrarCodigo: document.getElementById('btn-entrar-codigo'),
  btnReenviar: document.getElementById('btn-reenviar'),
  btnTrocarEmail: document.getElementById('btn-trocar-email'),
  loginStatus: document.getElementById('login-status'),
  btnSairSemAcesso: document.getElementById('btn-sair-sem-acesso'),
  dataHoje: document.getElementById('data-hoje'),
  abas: document.getElementById('abas'),
  nomeCaixa: document.getElementById('nome-caixa'),
  modos: document.getElementById('modos'),
  btnBusca: document.getElementById('btn-busca'),
  btnAjustes: document.getElementById('btn-ajustes'),
  btnNova: document.getElementById('btn-nova'),
  buscaCaixa: document.getElementById('busca-caixa'),
  busca: document.getElementById('busca'),
  folha: document.getElementById('folha'),
  lista: document.getElementById('lista'),
  notas: document.getElementById('notas'),
  feitas: document.getElementById('feitas'),
  menu: document.getElementById('menu'),
  menuFundo: document.getElementById('menu-fundo'),
  toast: document.getElementById('toast'),
  toastTexto: document.getElementById('toast-texto'),
  toastAcao: document.getElementById('toast-acao'),
};

// ---------------------------------------------------------------------------
// Botão "voltar" do Android: fecha a folha aberta em vez de sair do app.

const pilhaVoltar = [];
const fimDaVolta = [];
let ignorarVoltar = 0;

function comVoltar(fechar) {
  // O aviso de baixo ficaria por cima da folha que está abrindo.
  if (typeof ocultarToast === 'function') ocultarToast();
  try {
    history.pushState({ folha: true }, '');
  } catch {
    return () => Promise.resolve();
  }
  pilhaVoltar.push(fechar);
  // Devolve uma promessa que termina quando o history.back() chega ao destino,
  // para quem fecha a folha saber quando a rolagem do navegador já foi restaurada.
  return () => {
    const i = pilhaVoltar.lastIndexOf(fechar);
    if (i < 0) return Promise.resolve();
    pilhaVoltar.splice(i, 1);
    ignorarVoltar += 1;
    const fim = new Promise((ok) => fimDaVolta.push(ok));
    history.back();
    return fim;
  };
}

window.addEventListener('popstate', () => {
  if (ignorarVoltar > 0) {
    ignorarVoltar -= 1;
    const fim = fimDaVolta.shift();
    if (fim) fim();
    return;
  }
  const fechar = pilhaVoltar.pop();
  if (fechar) fechar();
});

// ---------------------------------------------------------------------------
// Toast

let timerToast = null;
let acaoToast = null;

function ocultarToast() {
  el.toast.hidden = true;
  acaoToast = null;
  if (timerToast) clearTimeout(timerToast);
  timerToast = null;
}

function toast(texto, acao, ms = 5000) {
  if (timerToast) clearTimeout(timerToast);
  el.toastTexto.textContent = texto;
  acaoToast = acao && acao.acao ? acao.acao : null;
  if (acaoToast) {
    el.toastAcao.hidden = false;
    el.toastAcao.textContent = acao.rotulo || 'Desfazer';
  } else {
    el.toastAcao.hidden = true;
  }
  el.toast.hidden = false;
  timerToast = setTimeout(ocultarToast, ms);
}

el.toastAcao.addEventListener('click', async () => {
  const acao = acaoToast;
  ocultarToast();
  if (acao) {
    try {
      await acao();
    } catch (e) {
      toast(mensagem(e));
    }
  }
});

// ---------------------------------------------------------------------------
// Caixas (abas), modos e busca

function trocarCaixa(caixa, { direcao = 0 } = {}) {
  if (!chavesDisponiveis().includes(caixa) || caixa === estado.caixa) return;
  estado.caixa = caixa;
  lembrar('tarefas.caixa.v2', caixa);
  renderAreas();
  renderTudo();
  if (direcao && typeof el.folha.animate === 'function') {
    try {
      el.folha.animate(
        [
          { transform: `translateX(${direcao * 28}px)`, opacity: 0.2 },
          { transform: 'translateX(0)', opacity: 1 },
        ],
        { duration: 220, easing: 'cubic-bezier(.2,.7,.2,1)' },
      );
    } catch {
      // sem animação
    }
  }
  window.scrollTo({ top: 0 });
}

function trocarModo(modo) {
  if (modo === estado.modo) return;
  estado.modo = modo;
  renderAreas();
  renderTudo();
  window.scrollTo({ top: 0 });
}

function renderAreas() {
  el.telaApp.dataset.caixa = estado.caixa;
  el.telaApp.className = `caderno tinta-${tintaDaCaixa(estado.caixa)}`;
  el.telaApp.dataset.modo = estado.modo;
  el.nomeCaixa.textContent =
    estado.caixa === 'tudo' ? 'Tudo' : rotuloCaixa(estado.caixas, estado.caixa);

  const chaves = chavesDisponiveis();
  limpar(el.abas);
  for (const caixa of chaves) {
    const ativa = estado.caixa === caixa;
    const aba = h('button', {
      class: `aba tinta-${tintaDaCaixa(caixa)}${ativa ? ' ativa' : ''}`,
      type: 'button',
      'aria-pressed': ativa ? 'true' : 'false',
      dataset: { aba: caixa },
    });
    aba.appendChild(
      h('span', {
        text: caixa === 'tudo' ? 'Tudo' : rotuloCaixa(estado.caixas, caixa),
      }),
    );
    aba.addEventListener('click', () => {
      const de = chaves.indexOf(estado.caixa);
      trocarCaixa(caixa, { direcao: chaves.indexOf(caixa) > de ? 1 : -1 });
    });
    el.abas.appendChild(aba);
  }

  limpar(el.modos);
  for (const modo of MODOS) {
    const ativo = estado.modo === modo.chave;
    const botao = h('button', {
      class: `modo${ativo ? ' ativo' : ''}`,
      type: 'button',
      role: 'tab',
      'aria-selected': ativo ? 'true' : 'false',
      text: modo.rotulo,
    });
    botao.addEventListener('click', () => trocarModo(modo.chave));
    el.modos.appendChild(botao);
  }
}

el.btnBusca.addEventListener('click', () => {
  const abrir = el.buscaCaixa.hidden;
  el.buscaCaixa.hidden = !abrir;
  if (abrir) el.busca.focus();
  else {
    el.busca.value = '';
    estado.busca = '';
    renderTudo();
  }
});

el.busca.addEventListener('input', () => {
  estado.busca = el.busca.value;
  renderTudo();
});

el.busca.addEventListener('keydown', (evento) => {
  if (evento.key === 'Escape') {
    el.busca.value = '';
    estado.busca = '';
    el.buscaCaixa.hidden = true;
    renderTudo();
  }
});

// Deslizar o dedo para o lado troca de caixa (longe da borda, para não brigar
// com o gesto "voltar" do Android).
(() => {
  let inicio = null;
  el.folha.addEventListener(
    'touchstart',
    (evento) => {
      const t = evento.touches[0];
      const largura = window.innerWidth;
      if (evento.touches.length !== 1 || t.clientX < 28 || t.clientX > largura - 28) {
        inicio = null;
        return;
      }
      if (evento.target.closest('textarea, input')) {
        inicio = null;
        return;
      }
      inicio = { x: t.clientX, y: t.clientY, em: Date.now() };
    },
    { passive: true },
  );
  el.folha.addEventListener(
    'touchend',
    (evento) => {
      if (!inicio || lista.estaArrastando()) return;
      const t = evento.changedTouches[0];
      const dx = t.clientX - inicio.x;
      const dy = t.clientY - inicio.y;
      const rapido = Date.now() - inicio.em < 600;
      inicio = null;
      if (!rapido || Math.abs(dx) < 70 || Math.abs(dy) > Math.abs(dx) * 0.6) return;
      const chaves = chavesDisponiveis();
      const i = chaves.indexOf(estado.caixa);
      const proxima = dx < 0 ? chaves[i + 1] : chaves[i - 1];
      if (proxima) trocarCaixa(proxima, { direcao: dx < 0 ? 1 : -1 });
    },
    { passive: true },
  );
})();

// ---------------------------------------------------------------------------
// Render

function daCaixa(lista) {
  let saida = lista;
  if (estado.caixa !== 'tudo') saida = saida.filter((t) => t.area === estado.caixa);
  const termo = semAcento(estado.busca.trim());
  if (termo) {
    saida = saida.filter(
      (t) => semAcento(t.titulo).includes(termo) || semAcento(t.notas).includes(termo),
    );
  }
  return saida;
}

function renderTudo() {
  el.dataHoje.textContent = dataPorExtenso(estado.hoje);
  el.lista.hidden = estado.modo !== 'tarefas';
  el.notas.hidden = estado.modo !== 'notas';
  el.feitas.hidden = estado.modo !== 'feitas';
  el.btnNova.hidden = estado.modo === 'notas';
  if (estado.modo === 'tarefas') {
    lista.render(organizarCaixa(daCaixa(estado.tarefas), estado.hoje), {
      caixa: estado.caixa,
      caixas: estado.caixas,
      hoje: estado.hoje,
      busca: estado.busca.trim(),
      iaRecentes: estado.iaRecentes,
    });
  } else if (estado.modo === 'feitas') {
    feitas.mostrar(daCaixa(estado.tarefas), { caixa: estado.caixa, hoje: estado.hoje });
  } else if (estado.modo === 'notas' && el.notas.dataset.caixa !== estado.caixa) {
    el.notas.dataset.caixa = estado.caixa;
    notas.mostrar(estado.caixa);
  }
  if (estado.modo !== 'notas') delete el.notas.dataset.caixa;
}

async function recarregar() {
  try {
    const antesCaixas = assinaturaCaixas(estado.caixas);
    try {
      estado.caixas = await dados.caixas();
    } catch (e) {
      if (!e || !e.rede) throw e;
      // offline: fica a lista do cache
    }
    if (assinaturaCaixas(estado.caixas) !== antesCaixas) {
      // Nomes, tintas ou ordem mudaram: os blocos de notas precisam renascer.
      delete el.notas.dataset.caixa;
    }
    const anterior = estado.caixa;
    estado.caixa = caixaLembrada(estado.caixa, estado.caixas);
    if (anterior !== estado.caixa) lembrar('tarefas.caixa.v2', estado.caixa);

    estado.tarefas = await dados.carregar();
    if (!modoLocal) {
      try {
        const eventos = (await dados.mudancasIa(24)) || [];
        estado.iaRecentes = new Set(eventos.map((e) => e.tarefa_id).filter(Boolean));
      } catch {
        // sem eventos agora; mantém o último mapa
      }
    }
    renderAreas();
    renderTudo();
  } catch (e) {
    toast(mensagem(e));
  }
}

// ---------------------------------------------------------------------------
// Ações sobre tarefas

function atual(tarefa) {
  return estado.tarefas.find((t) => t.id === tarefa.id) || null;
}

async function criarTarefa(campos) {
  lista.reservar(campos.client_ref);
  try {
    const criada = await dados.criar(campos);
    await recarregar();
    // No modo Supabase o id otimista pode ter virado o real durante a fila.
    return (
      estado.tarefas.find(
        (t) => campos.client_ref && t.client_ref === campos.client_ref,
      ) || criada
    );
  } catch (e) {
    lista.reservar(null);
    toast(mensagem(e));
    throw e;
  }
}

/** Depois de anotar: mostra a tarefa na caixa dela, rolando até ela. */
function mostrarCriada(criada) {
  if (!criada) return;
  if (estado.modo !== 'tarefas') trocarModo('tarefas');
  if (estado.busca.trim()) {
    estado.busca = '';
    el.busca.value = '';
    el.buscaCaixa.hidden = true;
    renderTudo();
  }
  if (estado.caixa !== 'tudo' && estado.caixa !== criada.area) {
    trocarCaixa(criada.area);
  }
  lista.destacar(criada.id);
}

async function concluirTarefa(tarefa) {
  const antes = {
    quando: tarefa.quando == null ? null : tarefa.quando,
    estado: tarefa.estado,
    estado_desde: tarefa.estado_desde,
    subtarefas: (tarefa.subtarefas || []).map((sub) => ({
      id: sub.id,
      feita: sub.feita === true,
    })),
  };
  try {
    const resultado = await dados.concluir(tarefa.id);
    const proxima = resultado && resultado.tarefa && resultado.tarefa.quando;
    const desfazer = tarefa.repetir
      ? async () => {
          await dados.desfazerConclusao(tarefa.id, antes);
          await recarregar();
        }
      : async () => {
          await dados.reabrir(tarefa.id);
          await recarregar();
        };
    toast(
      tarefa.repetir && proxima ? `Feito · volta ${rotuloCurto(proxima)}` : 'Feito',
      { rotulo: 'Desfazer', acao: desfazer },
    );
    await recarregar();
  } catch (e) {
    toast(mensagem(e));
    // A linha já começou a sair; recarrega para ela voltar se não concluiu.
    await recarregar();
  }
}

async function salvarTarefa(tarefa, campos) {
  try {
    await dados.atualizar(tarefa.id, tarefa.versao, campos);
    await recarregar();
    return atual(tarefa);
  } catch (e) {
    if (e && e.codigo === 'conflito') {
      await recarregar();
      toast('Esta tarefa mudou em outro aparelho.');
    } else {
      toast(mensagem(e));
    }
    throw e;
  }
}

/** Grava campos e oferece "Desfazer" voltando os valores anteriores. */
async function mudarComDesfazer(tarefa, campos, texto) {
  const agora = atual(tarefa);
  if (!agora) return;
  const anteriores = {};
  for (const chave of Object.keys(campos)) {
    anteriores[chave] = agora[chave] === undefined ? null : agora[chave];
  }
  try {
    await dados.atualizar(agora.id, agora.versao, campos);
    await recarregar();
    toast(texto, {
      rotulo: 'Desfazer',
      acao: async () => {
        const depois = atual(tarefa);
        if (!depois) return;
        await dados.atualizar(depois.id, depois.versao, anteriores);
        await recarregar();
      },
    });
  } catch (e) {
    toast(mensagem(e));
  }
}

async function moverTarefa(tarefa, { faixa, area }) {
  if (area) {
    await mudarComDesfazer(
      tarefa,
      { area },
      `Foi para ${rotuloCaixa(estado.caixas, area)}`,
    );
    return;
  }
  if (faixa === 'com_data') {
    const data = await escolherData.escolher({ atual: tarefa.quando || null });
    if (!data) return;
    const campos = { quando: data };
    if (tarefa.estado === 'esperando') campos.estado = 'aberta';
    await mudarComDesfazer(tarefa, campos, `Marcada para ${rotuloCurto(data)}`);
    return;
  }
  const campos = camposParaFaixa(tarefa, faixa);
  if (!campos) return;
  const perdeuData = Object.prototype.hasOwnProperty.call(campos, 'quando');
  await mudarComDesfazer(
    tarefa,
    campos,
    `${ROTULOS_FAIXA[faixa]}${perdeuData ? ' · data tirada' : ''}`,
  );
}

async function comSub(tarefaId, operacao) {
  try {
    await operacao();
    await recarregar();
    return estado.tarefas.find((t) => t.id === tarefaId) || null;
  } catch (e) {
    toast(mensagem(e));
    throw e;
  }
}

async function arquivarTarefa(tarefa) {
  const agora = atual(tarefa);
  if (!agora) return null;
  try {
    await dados.atualizar(agora.id, agora.versao, { estado: 'arquivada' });
    await recarregar();
    toast('Arquivada', {
      rotulo: 'Desfazer',
      acao: async () => {
        await dados.reabrir(tarefa.id);
        await recarregar();
      },
    });
    return atual(tarefa);
  } catch (e) {
    toast(mensagem(e));
    throw e;
  }
}

async function reabrirTarefa(tarefa) {
  try {
    await dados.reabrir(tarefa.id);
    await recarregar();
    return atual(tarefa);
  } catch (e) {
    toast(mensagem(e));
    throw e;
  }
}

function abrirLink(tarefa) {
  if (!tarefa.link) return;
  window.open(tarefa.link, '_blank', 'noopener,noreferrer');
}

// ---------------------------------------------------------------------------
// Menu da linha

let soltarMenu = null;

function fecharMenu() {
  el.menu.hidden = true;
  el.menuFundo.hidden = true;
  limpar(el.menu);
  if (soltarMenu) {
    const soltar = soltarMenu;
    soltarMenu = null;
    soltar();
  }
}

function itemMenu(texto, aoClicar, classe = '') {
  const botao = h('button', {
    class: `menu-item${classe ? ` ${classe}` : ''}`,
    type: 'button',
    text: texto,
  });
  botao.addEventListener('click', async () => {
    fecharMenu();
    try {
      await aoClicar();
    } catch (e) {
      toast(mensagem(e));
    }
  });
  return botao;
}

function abrirMenu(tarefa) {
  limpar(el.menu);
  el.menu.className = `menu tinta-${tintaDaCaixa(tarefa.area)}`;
  el.menu.appendChild(h('p', { class: 'menu-titulo', text: tarefa.titulo }));

  const faixaAtual = faixaDe(tarefa);
  el.menu.appendChild(h('p', { class: 'menu-secao', text: 'Mover para' }));
  const faixas = h('div', { class: 'menu-chips' });
  for (const faixa of ['imediato', 'proximo', 'em_breve', 'com_data', 'esperando']) {
    const botao = itemMenu(
      faixa === 'com_data' && faixaAtual === 'com_data' ? 'Outra data' : ROTULOS_FAIXA[faixa],
      () => moverTarefa(tarefa, { faixa }),
      `chip${faixa === faixaAtual && faixa !== 'com_data' ? ' ativo' : ''}`,
    );
    faixas.appendChild(botao);
  }
  el.menu.appendChild(faixas);

  el.menu.appendChild(h('p', { class: 'menu-secao', text: 'Caixa' }));
  const caixas = h('div', { class: 'menu-chips' });
  for (const caixa of caixasOrdenadas(estado.caixas)) {
    caixas.appendChild(
      itemMenu(
        caixa.nome,
        () =>
          caixa.chave === tarefa.area ? null : moverTarefa(tarefa, { area: caixa.chave }),
        `chip chip-caixa tinta-${tintaCaixa(estado.caixas, caixa.chave)}${
          caixa.chave === tarefa.area ? ' ativo' : ''
        }`,
      ),
    );
  }
  el.menu.appendChild(caixas);

  // O círculo tracejado abre o link; concluir um item de fora é por aqui.
  if (ehExterna(tarefa) && tarefa.estado !== 'feita') {
    el.menu.appendChild(
      itemMenu('Marcar como feito', () => concluirTarefa(atual(tarefa) || tarefa), 'menu-destaque'),
    );
  }
  el.menu.appendChild(itemMenu('Abrir detalhes', () => detalhes.abrir(atual(tarefa) || tarefa)));
  el.menu.appendChild(itemMenu('Arquivar', () => arquivarTarefa(tarefa), 'menu-discreto'));

  el.menuFundo.hidden = false;
  el.menu.hidden = false;
  soltarMenu = comVoltar(() => {
    soltarMenu = null;
    fecharMenu();
  });
}

el.menuFundo.addEventListener('click', fecharMenu);

// ---------------------------------------------------------------------------
// Módulos de interface

const escolherData = criarEscolherData({ obterHoje: () => estado.hoje, comVoltar });

const lista = criarLista({
  aoConcluir: concluirTarefa,
  aoReabrir: reabrirTarefa,
  aoAbrir: (tarefa) => detalhes.abrir(atual(tarefa) || tarefa),
  aoAbrirLink: abrirLink,
  aoMenu: abrirMenu,
  aoMover: moverTarefa,
  aoNovaNaFaixa: (faixa, caixa) => nova.abrir({ faixa, caixa }),
  aoSubMarcar: (tarefaId, subId, feita) =>
    comSub(tarefaId, () => dados.subMarcar(subId, feita)),
  obterCaixas: () => estado.caixas,
});

const nova = criarNova({
  aoCriar: criarTarefa,
  aoMostrar: mostrarCriada,
  obterHoje: () => estado.hoje,
  obterCaixas: () => estado.caixas,
  comVoltar,
  aoAviso: (texto) => toast(texto),
});

const notas = criarNotas({
  aoLer: () => dados.notas(),
  aoSalvar: (area, texto) => dados.salvarNota(area, texto),
  obterCaixas: () => estado.caixas,
});

const feitas = criarFeitas({
  aoReabrir: async (tarefa) => {
    await reabrirTarefa(tarefa);
    toast('Voltou para a lista');
  },
  obterCaixas: () => estado.caixas,
});

el.btnNova.addEventListener('click', () => nova.abrir({ caixa: estado.caixa }));

document.addEventListener('keydown', (evento) => {
  if (evento.key !== 'n' || evento.ctrlKey || evento.metaKey || evento.altKey) return;
  const alvo = evento.target;
  if (alvo && alvo.closest && alvo.closest('input, textarea, select, [contenteditable]')) return;
  if (
    el.telaApp.hidden ||
    nova.estaAberto() ||
    detalhes.estaAberto() ||
    ajustes.estaAberto() ||
    !el.menu.hidden ||
    !document.getElementById('escolher-data').hidden
  ) {
    return;
  }
  evento.preventDefault();
  nova.abrir({ caixa: estado.caixa });
});

const detalhes = criarDetalhes({
  aoSalvar: salvarTarefa,
  aoSubCriar: (tarefaId, texto) =>
    comSub(tarefaId, () => dados.subCriar(tarefaId, texto)),
  aoSubMarcar: (tarefaId, subId, feita) =>
    comSub(tarefaId, () => dados.subMarcar(subId, feita)),
  aoSubEditar: (tarefaId, subId, texto) =>
    comSub(tarefaId, () => dados.subEditar(subId, texto)),
  aoSubApagar: (tarefaId, subId) =>
    comSub(tarefaId, () => dados.subApagar(subId)),
  aoArquivar: arquivarTarefa,
  aoReabrir: reabrirTarefa,
  aoEventos: async (id) => {
    try {
      return await dados.eventos(id);
    } catch {
      return [];
    }
  },
  obterCaixas: () => estado.caixas,
  comVoltar,
});

async function listarMudancasIa() {
  if (modoLocal) return [];
  try {
    return (await dados.mudancasIa(24)) || [];
  } catch {
    return [];
  }
}

// Recarrega a versão publicada. Antes, pede ao service worker para buscar e
// ativar a versão nova (o sw.js faz skipWaiting), senão o reload poderia
// devolver o js/css antigos do cache.
async function atualizarApp() {
  if ('serviceWorker' in navigator) {
    try {
      const registro = await navigator.serviceWorker.getRegistration();
      if (registro) {
        try {
          await Promise.race([
            registro.update(),
            new Promise((ok) => setTimeout(ok, 4000)),
          ]);
        } catch {
          // sem rede: recarrega o que estiver em cache
        }
        const inicio = Date.now();
        let viu = false;
        let pediu = false;
        while (Date.now() - inicio < 6000) {
          const novo = registro.installing || registro.waiting;
          if (novo) {
            viu = true;
            if (novo.state === 'activated' || novo.state === 'redundant') break;
            if (novo === registro.waiting && !pediu) {
              pediu = true;
              novo.postMessage('pular-espera');
            }
          } else if (viu || Date.now() - inicio > 1200) {
            break;
          }
          await new Promise((ok) => setTimeout(ok, 100));
        }
        if (registro.waiting) {
          registro.waiting.postMessage('pular-espera');
          await new Promise((ok) => setTimeout(ok, 300));
        }
      }
    } catch {
      // segue para o reload normal
    }
  }
  location.reload();
}

async function mudarCaixas(operacao) {
  const resultado = await operacao();
  await recarregar();
  return resultado;
}

const ajustes = criarAjustes({
  modoLocal,
  obterEmail: () => {
    const usuario = dados.usuario();
    return (usuario && usuario.email) || '';
  },
  obterCaixas: () => estado.caixas,
  contarTarefas: (chave) =>
    estado.tarefas.filter((tarefa) => tarefa.area === chave).length,
  aoCriarCaixa: (nome, tinta) =>
    mudarCaixas(() => dados.criarCaixa(nome, tinta)),
  aoEditarCaixa: (chave, campos) =>
    mudarCaixas(() => dados.editarCaixa(chave, campos)),
  aoOrdenarCaixas: (chaves) => mudarCaixas(() => dados.ordenarCaixas(chaves)),
  aoApagarCaixa: (chave, destino) =>
    mudarCaixas(() => dados.apagarCaixa(chave, destino)),
  aoSair: async () => {
    await dados.sair();
  },
  aoListarIa: listarMudancasIa,
  aoDesfazerIa: async () => {
    try {
      const quantidade = await dados.desfazerIa(24);
      toast(quantidade > 0 ? `${quantidade} mudança(s) desfeita(s)` : 'Nada para desfazer');
      await recarregar();
      return quantidade;
    } catch (e) {
      toast(mensagem(e));
      throw e;
    }
  },
  aoAtualizar: atualizarApp,
  aoExportar: () => {
    try {
      const dadosJson = JSON.stringify(dados.exportar(), null, 2);
      const blob = new Blob([dadosJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = h('a', { href: url, download: `tarefas-${estado.hoje}.json` });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Exportado');
    } catch {
      toast('Não foi possível exportar.');
    }
  },
  comVoltar,
});

el.btnAjustes.addEventListener('click', () => ajustes.abrir());

// ---------------------------------------------------------------------------
// Login / sessões

const CHAVE_EMAIL = 'tarefas.email.v1';
let telaAtual = null;
let esperaReenvio = 0;
let timerReenvio = null;

function lerEmailLembrado() {
  try {
    return localStorage.getItem(CHAVE_EMAIL) || '';
  } catch {
    return '';
  }
}

function lembrarEmail(email) {
  try {
    localStorage.setItem(CHAVE_EMAIL, email);
  } catch {
    // sem storage
  }
}

function mensagemLogin(e) {
  return (e && e.message) || 'Não foi possível entrar. Tente de novo.';
}

function definirStatusLogin(texto) {
  el.loginStatus.textContent = texto || '';
}

function atualizarReenviar() {
  if (esperaReenvio > 0) {
    el.btnReenviar.disabled = true;
    el.btnReenviar.textContent = `Reenviar em ${esperaReenvio} s`;
  } else {
    el.btnReenviar.disabled = false;
    el.btnReenviar.textContent = 'Reenviar código';
  }
}

function pararEspera() {
  if (timerReenvio) clearInterval(timerReenvio);
  timerReenvio = null;
  esperaReenvio = 0;
}

function iniciarEspera(segundos = 60) {
  if (timerReenvio) clearInterval(timerReenvio);
  esperaReenvio = Number(segundos) || 0;
  atualizarReenviar();
  timerReenvio = setInterval(() => {
    esperaReenvio -= 1;
    if (esperaReenvio <= 0) {
      pararEspera();
      atualizarReenviar();
      return;
    }
    atualizarReenviar();
  }, 1000);
}

function mostrarEtapaLogin(etapa, { focar = false } = {}) {
  const codigo = etapa === 'codigo';
  el.formEmail.hidden = codigo;
  el.formCodigo.hidden = !codigo;
  definirStatusLogin('');
  if (focar) {
    if (codigo) {
      el.codigo.focus();
    } else {
      el.email.focus();
      el.email.select();
    }
  }
}

async function enviarCodigo(reenvio = false) {
  if (reenvio && esperaReenvio > 0) return;
  const digitado = el.email.value.trim();
  if (!digitado) {
    mostrarEtapaLogin('email', { focar: true });
    definirStatusLogin('Digite seu e-mail.');
    return;
  }
  lembrarEmail(digitado);

  const botao = reenvio ? el.btnReenviar : el.btnEnviarCodigo;
  botao.disabled = true;
  try {
    const email = await dados.enviarCodigo(digitado);
    el.email.value = email;
    lembrarEmail(email);
    el.codigo.value = '';
    el.codigoEnviado.textContent = `Enviamos um código para ${email}. Ele também traz um link: tocar no link também funciona.`;
    mostrarEtapaLogin('codigo', { focar: true });
    iniciarEspera(60);
  } catch (e) {
    definirStatusLogin(mensagemLogin(e));
    if (!reenvio) el.email.focus();
  } finally {
    if (reenvio) atualizarReenviar();
    else el.btnEnviarCodigo.disabled = false;
  }
}

async function entrarComCodigo() {
  const email = el.email.value.trim();
  const token = el.codigo.value.replace(/\s+/g, '');
  if (!/^\d{6,10}$/.test(token)) {
    definirStatusLogin('Digite o código que chegou no e-mail.');
    el.codigo.focus();
    return;
  }

  el.btnEntrarCodigo.disabled = true;
  definirStatusLogin('Entrando…');
  try {
    const resultado = await dados.entrarComCodigo(email, token);
    lembrarEmail(email);
    pararEspera();
    await aplicarSessao(resultado);
  } catch (e) {
    el.codigo.value = '';
    definirStatusLogin(mensagemLogin(e));
    el.codigo.focus();
  } finally {
    el.btnEntrarCodigo.disabled = false;
  }
}

function mostrarTela(nome) {
  el.telaCarregando.hidden = true;
  el.telaLogin.hidden = nome !== 'login';
  el.telaSemAcesso.hidden = nome !== 'sem-acesso';
  el.telaApp.hidden = nome !== 'app';
  if (nome === 'login' && telaAtual !== 'login') {
    pararEspera();
    atualizarReenviar();
    el.codigo.value = '';
    el.codigoEnviado.textContent = '';
    definirStatusLogin('');
    mostrarEtapaLogin('email');
  }
  telaAtual = nome;
}

async function aplicarSessao(pacote) {
  const autenticado = Boolean(pacote && pacote.autenticado);
  const membro = pacote && pacote.membro;
  estado.autenticado = autenticado;
  estado.membro = membro || null;
  if (!autenticado) {
    mostrarTela('login');
    return;
  }
  if (!membro) {
    const usuario = dados.usuario();
    el.emailSemAcesso.textContent = (usuario && usuario.email) || '';
    mostrarTela('sem-acesso');
    return;
  }
  mostrarTela('app');
  renderAreas();
  await recarregar();
}

el.formEmail.addEventListener('submit', (evento) => {
  evento.preventDefault();
  enviarCodigo(false);
});

el.formCodigo.addEventListener('submit', (evento) => {
  evento.preventDefault();
  entrarComCodigo();
});

el.btnReenviar.addEventListener('click', () => enviarCodigo(true));

el.btnTrocarEmail.addEventListener('click', () => {
  pararEspera();
  atualizarReenviar();
  el.codigo.value = '';
  mostrarEtapaLogin('email', { focar: true });
});

el.btnSairSemAcesso.addEventListener('click', () => dados.sair());

dados.aoMudarSessao((pacote) => {
  aplicarSessao(pacote);
});

dados.aoErro((codigo) => {
  toast(mensagem({ codigo }));
});

dados.assinar((pacote) => {
  if (pacote && Array.isArray(pacote.caixas)) {
    const antesCaixas = assinaturaCaixas(estado.caixas);
    estado.caixas = pacote.caixas;
    if (assinaturaCaixas(estado.caixas) !== antesCaixas) {
      delete el.notas.dataset.caixa;
    }
    const antes = estado.caixa;
    estado.caixa = caixaLembrada(estado.caixa, estado.caixas);
    if (antes !== estado.caixa) lembrar('tarefas.caixa.v2', estado.caixa);
    renderAreas();
  }
  if (pacote && Array.isArray(pacote.tarefas)) {
    estado.tarefas = pacote.tarefas;
    renderTudo();
  } else {
    recarregar();
  }
});

// ---------------------------------------------------------------------------
// Início

async function iniciar() {
  el.faixaLocal.hidden = !modoLocal;
  el.email.value = lerEmailLembrado();
  el.btnBusca.appendChild(icone('busca', { tamanho: 20 }));
  el.btnAjustes.appendChild(icone('ajustes', { tamanho: 20 }));
  el.btnNova.appendChild(icone('mais_simples', { tamanho: 26 }));
  renderAreas();

  if (modoLocal) {
    mostrarTela('app');
    await recarregar();
  } else {
    // Com dono, papel e tarefas no cache, o app aparece antes da rede. A sessão
    // é confirmada logo depois; se não existir mais, cai no login como hoje.
    const rapida = dados.partidaRapida();
    if (rapida) {
      estado.autenticado = true;
      estado.membro = rapida.membro || 'dono';
      estado.tarefas = rapida.tarefas || [];
      if (Array.isArray(rapida.caixas) && rapida.caixas.length) {
        estado.caixas = rapida.caixas;
      }
      estado.caixa = caixaLembrada(estado.caixa, estado.caixas);
      mostrarTela('app');
      renderAreas();
      renderTudo();
    }
    try {
      const resultado = await dados.iniciar();
      await aplicarSessao(resultado);
    } catch {
      mostrarTela('login');
    }
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    const agora = hojeSP();
    if (agora !== estado.hoje) estado.hoje = agora;
    if (estado.autenticado) await recarregar();
  });

  window.addEventListener('online', () => {
    if (estado.autenticado) recarregar();
  });

  // Mantém "hoje" correto se o app ficar aberto atravessando a meia-noite.
  setInterval(() => {
    const agora = hojeSP();
    if (agora === estado.hoje) return;
    estado.hoje = agora;
    renderTudo();
    if (estado.autenticado) recarregar();
  }, 60000);
}

// No servidor de teste (localhost) fica sem service worker, para nunca servir arquivo velho.
if ('serviceWorker' in navigator && location.protocol !== 'file:' && location.hostname !== 'localhost') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // sem service worker (http simples, navegador antigo)
    });
  });
}

iniciar();
