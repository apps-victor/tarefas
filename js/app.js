// Ponto de entrada do PWA.

import { dados, modoLocal } from './dados.js';
import {
  AREAS,
  ROTULOS_AREA,
  agrupar,
  dataPorExtenso,
  hojeSP,
  rotuloCurto,
  semAcento,
  somarDias,
} from './logica.js';
import { criarLista } from './ui/lista.js';
import { criarBarra } from './ui/criar.js';
import { criarDetalhes } from './ui/detalhes.js';
import { criarAjustes } from './ui/ajustes.js';
import { h, limpar } from './ui/dom.js';
import { icone } from './ui/icones.js';

const estado = {
  tarefas: [],
  hoje: hojeSP(),
  filtro: lerFiltro(),
  busca: '',
  iaRecentes: new Set(),
  autenticado: modoLocal,
  membro: modoLocal ? 'dono' : null,
};

function lerFiltro() {
  try {
    const valor = localStorage.getItem('tarefas.filtro.v1');
    return valor && ['tudo', ...AREAS].includes(valor) ? valor : 'tudo';
  } catch {
    return 'tudo';
  }
}

function salvarFiltro(valor) {
  try {
    localStorage.setItem('tarefas.filtro.v1', valor);
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
  areas: document.getElementById('areas'),
  btnBusca: document.getElementById('btn-busca'),
  btnAjustes: document.getElementById('btn-ajustes'),
  buscaCaixa: document.getElementById('busca-caixa'),
  busca: document.getElementById('busca'),
  lista: document.getElementById('lista'),
  vazio: document.getElementById('vazio'),
  menu: document.getElementById('menu'),
  menuFundo: document.getElementById('menu-fundo'),
  toast: document.getElementById('toast'),
  toastTexto: document.getElementById('toast-texto'),
  toastAcao: document.getElementById('toast-acao'),
};

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
// Áreas e busca

function renderAreas() {
  limpar(el.areas);
  const opcoes = [
    { chave: 'tudo', rotulo: 'Tudo' },
    ...AREAS.map((area) => ({ chave: area, rotulo: ROTULOS_AREA[area] })),
  ];
  for (const opcao of opcoes) {
    const ativo = estado.filtro === opcao.chave;
    const botao = h('button', {
      class: `area-chip${ativo ? ' ativo' : ''}`,
      type: 'button',
      'aria-pressed': ativo ? 'true' : 'false',
    });
    if (opcao.chave !== 'tudo') {
      botao.appendChild(
        h('span', {
          class: `bolinha area-${opcao.chave}`,
          'aria-hidden': 'true',
        }),
      );
    }
    botao.appendChild(h('span', { text: opcao.rotulo }));
    botao.addEventListener('click', () => {
      estado.filtro = opcao.chave;
      salvarFiltro(opcao.chave);
      renderAreas();
      renderTudo();
    });
    el.areas.appendChild(botao);
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

// ---------------------------------------------------------------------------
// Render da lista

function tarefasFiltradas() {
  let lista = estado.tarefas;
  if (estado.filtro !== 'tudo') {
    lista = lista.filter((t) => t.area === estado.filtro);
  }
  const termo = semAcento(estado.busca.trim());
  if (termo) {
    lista = lista.filter(
      (t) =>
        semAcento(t.titulo).includes(termo) ||
        semAcento(t.notas).includes(termo),
    );
  }
  return lista;
}

function renderTudo() {
  el.dataHoje.textContent = dataPorExtenso(estado.hoje);
  const grupos = agrupar(tarefasFiltradas(), estado.hoje);
  lista.render(grupos, {
    hoje: estado.hoje,
    iaRecentes: estado.iaRecentes,
  });
  const total = grupos.reduce((soma, g) => soma + g.tarefas.length, 0);
  el.vazio.hidden = total > 0;
  el.vazio.textContent = estado.busca.trim()
    ? 'Nada encontrado.'
    : 'Nada para hoje.';
}

async function recarregar() {
  try {
    estado.tarefas = await dados.carregar();
    if (!modoLocal) {
      try {
        const eventos = (await dados.mudancasIa(24)) || [];
        estado.iaRecentes = new Set(
          eventos.map((e) => e.tarefa_id).filter(Boolean),
        );
      } catch {
        // sem eventos agora; mantém o último mapa
      }
    }
    renderTudo();
  } catch (e) {
    toast(mensagem(e));
  }
}

// ---------------------------------------------------------------------------
// Ações sobre tarefas

async function criarTarefa(campos) {
  try {
    await dados.criar({
      ...campos,
      titulo: campos.titulo || 'Sem título',
    });
    await recarregar();
  } catch (e) {
    toast(mensagem(e));
    throw e;
  }
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
    if (tarefa.repetir) {
      const texto = proxima
        ? `Concluída · Próxima: ${rotuloCurto(proxima)}`
        : 'Concluída';
      toast(
        texto,
        {
          rotulo: 'Desfazer',
          acao: async () => {
            await dados.desfazerConclusao(tarefa.id, antes);
            await recarregar();
          },
        },
        5000,
      );
    } else {
      toast('Concluída', {
        rotulo: 'Desfazer',
        acao: async () => {
          await dados.reabrir(tarefa.id);
          await recarregar();
        },
      });
    }
    await recarregar();
  } catch (e) {
    toast(mensagem(e));
  }
}

async function adiarTarefa(tarefa, para) {
  const anterior = tarefa.quando || null;
  try {
    await dados.adiar(tarefa.id, para);
    toast(`Adiada para ${rotuloCurto(para)}`, {
      rotulo: 'Desfazer',
      acao: async () => {
        const atual = estado.tarefas.find((t) => t.id === tarefa.id);
        if (!atual) return;
        await dados.atualizar(atual.id, atual.versao, { quando: anterior });
        await recarregar();
      },
    });
    await recarregar();
  } catch (e) {
    toast(mensagem(e));
  }
}

async function salvarTarefa(tarefa, campos) {
  try {
    await dados.atualizar(tarefa.id, tarefa.versao, campos);
    await recarregar();
    return estado.tarefas.find((t) => t.id === tarefa.id) || null;
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
  const atual = estado.tarefas.find((t) => t.id === tarefa.id);
  if (!atual) return null;
  try {
    await dados.atualizar(atual.id, atual.versao, { estado: 'arquivada' });
    await recarregar();
    toast('Arquivada', {
      rotulo: 'Desfazer',
      acao: async () => {
        await dados.reabrir(tarefa.id);
        await recarregar();
      },
    });
    return estado.tarefas.find((t) => t.id === tarefa.id) || null;
  } catch (e) {
    toast(mensagem(e));
    throw e;
  }
}

async function reabrirTarefa(tarefa) {
  try {
    await dados.reabrir(tarefa.id);
    await recarregar();
    return estado.tarefas.find((t) => t.id === tarefa.id) || null;
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

function fecharMenu() {
  el.menu.hidden = true;
  el.menuFundo.hidden = true;
  limpar(el.menu);
}

function itemMenu(texto, aoClicar) {
  const botao = h('button', { class: 'menu-item', type: 'button', text: texto });
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
  el.menu.appendChild(
    h('p', { class: 'menu-titulo', text: tarefa.titulo }),
  );

  el.menu.appendChild(
    itemMenu(tarefa.foco ? 'Remover foco' : 'Foco', async () => {
      const atual = estado.tarefas.find((t) => t.id === tarefa.id);
      if (!atual) return;
      await dados.atualizar(atual.id, atual.versao, { foco: !atual.foco });
      await recarregar();
    }),
  );

  const esperando = tarefa.estado === 'esperando';
  el.menu.appendChild(
    itemMenu(esperando ? 'Tirar de esperando' : 'Esperando', async () => {
      const atual = estado.tarefas.find((t) => t.id === tarefa.id);
      if (!atual) return;
      await dados.atualizar(atual.id, atual.versao, {
        estado: esperando ? 'aberta' : 'esperando',
      });
      await recarregar();
    }),
  );

  el.menu.appendChild(
    itemMenu('Adiar para amanhã', async () => {
      await adiarTarefa(tarefa, somarDias(estado.hoje, 1));
    }),
  );

  const escolher = h('div', { class: 'menu-adiar' });
  const data = h('input', {
    class: 'entrada entrada-data-menu',
    type: 'date',
    value: somarDias(estado.hoje, 1),
    'aria-label': 'Adiar para',
  });
  data.addEventListener('change', async () => {
    if (!data.value) return;
    fecharMenu();
    await adiarTarefa(tarefa, data.value);
  });
  escolher.appendChild(h('span', { class: 'suave', text: 'Adiar para…' }));
  escolher.appendChild(data);
  el.menu.appendChild(escolher);

  el.menu.appendChild(
    itemMenu('Arquivar', async () => {
      await arquivarTarefa(tarefa);
    }),
  );

  el.menuFundo.hidden = false;
  el.menu.hidden = false;
}

el.menuFundo.addEventListener('click', fecharMenu);

// ---------------------------------------------------------------------------
// Módulos de interface

const lista = criarLista({
  aoConcluir: concluirTarefa,
  aoAbrir: (tarefa) => detalhes.abrir(tarefa),
  aoAbrirLink: abrirLink,
  aoAdiar: (tarefa) => adiarTarefa(tarefa, somarDias(estado.hoje, 1)),
  aoMenu: abrirMenu,
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
});

criarBarra({
  aoCriar: criarTarefa,
  obterHoje: () => estado.hoje,
  aoAviso: (texto) => toast(texto),
});

async function listarMudancasIa() {
  if (modoLocal) return [];
  try {
    return (await dados.mudancasIa(24)) || [];
  } catch {
    return [];
  }
}

const ajustes = criarAjustes({
  modoLocal,
  obterEmail: () => {
    const usuario = dados.usuario();
    return (usuario && usuario.email) || '';
  },
  aoSair: async () => {
    await dados.sair();
  },
  aoListarIa: listarMudancasIa,
  aoDesfazerIa: async () => {
    const quantidade = await dados.desfazerIa(24);
    toast(
      quantidade > 0
        ? `${quantidade} mudança(s) desfeita(s)`
        : 'Nada para desfazer',
    );
    await recarregar();
    return quantidade;
  },
  aoExportar: () => {
    try {
      const dadosJson = JSON.stringify(dados.exportar(), null, 2);
      const blob = new Blob([dadosJson], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = h('a', {
        href: url,
        download: `tarefas-${estado.hoje}.json`,
      });
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast('Exportado');
    } catch {
      toast('Não foi possível exportar.');
    }
  },
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
  renderAreas();

  if (modoLocal) {
    mostrarTela('app');
    await recarregar();
  } else {
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

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {
      // sem service worker (http simples, navegador antigo)
    });
  });
}

iniciar();
