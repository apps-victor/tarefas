// Camada de dados do app. Expõe a MESMA interface nos dois modos:
//   carregar, criar, atualizar, concluir, reabrir, adiar,
//   subCriar, subMarcar, subEditar, subApagar,
//   eventos, mudancasIa, desfazerIa, assinar
//
// Modo local (config.js vazio): tudo em localStorage, espelhando as RPCs,
// inclusive repetição, versão e idempotência por client_ref.
// Modo Supabase: cliente oficial, fila persistente de RPCs, cache local e
// Realtime. Escritas são otimistas e a fila é enviada em ordem.

import {
  supabaseUrl,
  supabaseAnonKey,
} from './config.js';
import { proximaData, hojeSP, normalizarData, somarDias } from './logica.js';

export const modoLocal = !supabaseUrl || !supabaseAnonKey;

const CHAVE_LOCAL = 'tarefas.local.v1';
const CHAVE_CACHE = 'tarefas.cache.v1';
const CHAVE_FILA = 'tarefas.fila.v1';
const CHAVE_MEMBRO = 'tarefas.membro.v1';
const CHAVE_DONO = 'tarefas.dono.v1';
const CHAVE_NOTAS = 'tarefas.notas.v1';

const AREAS = ['casa', 'lapig', 'buriti', 'pessoal'];
const PRIORIDADES = ['imediato', 'proximo', 'em_breve'];
const LIMITE_LISTA = 500;
// Feitas mais antigas que isso não vêm do servidor (a tela de Feitas mostra este período).
const DIAS_FEITAS = 45;
const LIMITE_NOTA = 20000;

function validarNota(area, texto) {
  if (!AREAS.includes(area)) throw erro('invalido:area');
  if (typeof texto !== 'string' || texto.length > LIMITE_NOTA) {
    throw erro('invalido:texto');
  }
}

// ---------------------------------------------------------------------------
// Utilidades

export function erro(codigo, mensagem) {
  const e = new Error(mensagem || codigo);
  e.codigo = codigo;
  return e;
}

function clone(valor) {
  if (valor === undefined || valor === null) return valor;
  return JSON.parse(JSON.stringify(valor));
}

function novoId() {
  const c = globalThis.crypto;
  if (c && typeof c.randomUUID === 'function') return c.randomUUID();
  return `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function agoraISO() {
  return new Date().toISOString();
}

function doisDigitos(n) {
  return String(n).padStart(2, '0');
}

export function criarArmazenamentoMemoria() {
  const dados = new Map();
  return {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => {
      dados.set(chave, String(valor));
    },
    removeItem: (chave) => {
      dados.delete(chave);
    },
  };
}

function criarArmazenamento() {
  try {
    if (typeof localStorage !== 'undefined') {
      const teste = '__tarefas_teste__';
      localStorage.setItem(teste, '1');
      localStorage.removeItem(teste);
      return {
        getItem: (chave) => localStorage.getItem(chave),
        setItem: (chave, valor) => localStorage.setItem(chave, String(valor)),
        removeItem: (chave) => localStorage.removeItem(chave),
      };
    }
  } catch {
    // navegador sem storage (Safari privado, cota etc.)
  }
  return criarArmazenamentoMemoria();
}

function lerJSON(arm, chave, padrao) {
  try {
    const bruto = arm.getItem(chave);
    if (!bruto) return padrao;
    const valor = JSON.parse(bruto);
    return valor == null ? padrao : valor;
  } catch {
    return padrao;
  }
}

function gravarJSON(arm, chave, valor) {
  try {
    arm.setItem(chave, JSON.stringify(valor));
  } catch {
    // cota cheia: mantém em memória nesta sessão
  }
}

function normalizarLista(dado) {
  if (typeof dado === 'string') {
    try {
      return normalizarLista(JSON.parse(dado));
    } catch {
      return [];
    }
  }
  if (Array.isArray(dado)) return dado.filter(Boolean);
  if (dado && Array.isArray(dado.tarefas)) return dado.tarefas.filter(Boolean);
  if (dado && dado.id) return [dado];
  return [];
}

function normalizarLinha(dado) {
  if (typeof dado === 'string') {
    try {
      return JSON.parse(dado);
    } catch {
      return null;
    }
  }
  return dado || null;
}

function normalizarHora(valor) {
  if (valor == null || valor === '') return null;
  const m = /^(\d{1,2}):(\d{2})(?::\d{2})?$/.exec(String(valor).trim());
  if (!m) throw erro('invalido:hora');
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) throw erro('invalido:hora');
  return `${doisDigitos(h)}:${doisDigitos(min)}`;
}

function validarRepetir(repetir) {
  if (repetir == null) return null;
  if (typeof repetir !== 'object' || Array.isArray(repetir)) {
    throw erro('invalido:repetir');
  }
  if (!['diaria', 'semanal', 'mensal'].includes(repetir.freq)) {
    throw erro('invalido:repetir');
  }
  const intervalo = Number(repetir.intervalo == null ? 1 : repetir.intervalo);
  if (!Number.isInteger(intervalo) || intervalo < 1 || intervalo > 365) {
    throw erro('invalido:repetir');
  }
  const saida = { freq: repetir.freq, intervalo };
  if (repetir.dias_semana != null) {
    if (!Array.isArray(repetir.dias_semana) || !repetir.dias_semana.length) {
      throw erro('invalido:repetir');
    }
    const dias = repetir.dias_semana.map(Number);
    if (dias.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) {
      throw erro('invalido:repetir');
    }
    saida.dias_semana = [...new Set(dias)].sort((a, b) => a - b);
  }
  if (repetir.dia_mes != null) {
    const dia = Number(repetir.dia_mes);
    if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
      throw erro('invalido:repetir');
    }
    saida.dia_mes = dia;
  }
  return saida;
}

const CAMPOS_CRIACAO = [
  'titulo',
  'notas',
  'area',
  'quando',
  'hora',
  'repetir',
  'link',
  'foco',
  'prioridade',
  'estado',
  'ref_externa',
  'client_ref',
];

const CAMPOS_ATUALIZACAO = [
  'titulo',
  'notas',
  'area',
  'quando',
  'hora',
  'repetir',
  'link',
  'foco',
  'prioridade',
  'estado',
];

function validarCampos(campos, { criacao = false } = {}) {
  if (!campos || typeof campos !== 'object' || Array.isArray(campos)) {
    throw erro('invalido:campos');
  }
  const permitidos = criacao ? CAMPOS_CRIACAO : CAMPOS_ATUALIZACAO;
  const saida = {};
  for (const chave of permitidos) {
    if (Object.prototype.hasOwnProperty.call(campos, chave)) {
      saida[chave] = campos[chave];
    }
  }

  if (criacao && !Object.prototype.hasOwnProperty.call(saida, 'titulo')) {
    throw erro('invalido:titulo');
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'titulo')) {
    if (typeof saida.titulo !== 'string') throw erro('invalido:titulo');
    const titulo = saida.titulo.trim();
    if (titulo.length < 1 || titulo.length > 300 || /[<>]/.test(titulo)) {
      throw erro('invalido:titulo');
    }
    saida.titulo = titulo;
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'notas')) {
    if (saida.notas == null) {
      saida.notas = null;
    } else if (
      typeof saida.notas !== 'string' ||
      saida.notas.length > 5000
    ) {
      throw erro('invalido:notas');
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'area')) {
    if (saida.area == null) {
      if (criacao) delete saida.area;
      else throw erro('invalido:area');
    } else if (!AREAS.includes(saida.area)) {
      throw erro('invalido:area');
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'quando')) {
    if (saida.quando == null) {
      saida.quando = null;
    } else {
      const d = normalizarData(saida.quando);
      if (!d) throw erro('invalido:quando');
      saida.quando = d;
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'hora')) {
    saida.hora = normalizarHora(saida.hora);
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'repetir')) {
    saida.repetir = validarRepetir(saida.repetir);
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'link')) {
    if (saida.link == null || saida.link === '') {
      saida.link = null;
    } else if (
      typeof saida.link !== 'string' ||
      saida.link.length > 2000 ||
      !/^https?:\/\/[^\s<>"]+$/.test(saida.link)
    ) {
      throw erro('invalido:link');
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'foco')) {
    if (saida.foco == null) {
      saida.foco = false;
    } else if (typeof saida.foco !== 'boolean') {
      throw erro('invalido:foco');
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'prioridade')) {
    if (saida.prioridade == null && criacao) {
      delete saida.prioridade;
    } else if (!PRIORIDADES.includes(saida.prioridade)) {
      throw erro('invalido:prioridade');
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'estado')) {
    const aceitos = criacao
      ? ['aberta', 'esperando']
      : ['aberta', 'esperando', 'arquivada'];
    if (saida.estado == null) {
      if (criacao) delete saida.estado;
      else throw erro('invalido:estado');
    } else if (!aceitos.includes(saida.estado)) {
      throw erro('invalido:estado');
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'ref_externa')) {
    if (saida.ref_externa != null) {
      if (typeof saida.ref_externa !== 'string') {
        throw erro('invalido:ref_externa');
      }
      const ref = saida.ref_externa.trim();
      if (!ref || ref.length > 300) throw erro('invalido:ref_externa');
      saida.ref_externa = ref;
    }
  }
  if (Object.prototype.hasOwnProperty.call(saida, 'client_ref')) {
    if (saida.client_ref != null) {
      if (typeof saida.client_ref !== 'string') {
        throw erro('invalido:client_ref');
      }
      const ref = saida.client_ref.trim();
      if (!ref || ref.length > 200) throw erro('invalido:client_ref');
      saida.client_ref = ref;
    }
  }
  return saida;
}

// ---------------------------------------------------------------------------
// Operações (espelham as RPCs; usadas no modo local e nas escritas otimistas)

function registrarEvento(estado, tarefaId, acao, antes, depois, origem = 'eu') {
  if (!Array.isArray(estado.eventos)) estado.eventos = [];
  estado.seq = Number(estado.seq || 0) + 1;
  estado.eventos.push({
    id: estado.seq,
    tarefa_id: tarefaId,
    dono: null,
    quem: null,
    origem,
    acao,
    antes: antes ? clone(antes) : null,
    depois: depois ? clone(depois) : null,
    em: agoraISO(),
  });
  // Evita crescimento sem fim no localStorage.
  if (estado.eventos.length > 5000) {
    estado.eventos.splice(0, estado.eventos.length - 5000);
  }
}

function acharTarefa(estado, id) {
  return (estado.tarefas || []).find((t) => t && t.id === id) || null;
}

function acharSubtarefa(estado, id) {
  for (const tarefa of estado.tarefas || []) {
    for (const sub of tarefa.subtarefas || []) {
      if (sub && sub.id === id) return { tarefa, sub };
    }
  }
  return null;
}

/** Cópia histórica mais recente de uma conclusão de tarefa repetida. */
function acharHistoricoRecente(estado, tarefaId) {
  return (
    (estado.tarefas || [])
      .filter((t) => t && t.repete_de === tarefaId && t.estado === 'feita')
      .sort((a, b) =>
        String(b.criada_em || '').localeCompare(String(a.criada_em || '')),
      )[0] || null
  );
}

function tocarTarefa(tarefa) {
  tarefa.versao = Number(tarefa.versao || 0) + 1;
  tarefa.atualizada_em = agoraISO();
}

function criarNaLista(estado, campos, { dono, origem = 'eu' } = {}) {
  const c = validarCampos(campos, { criacao: true });

  if (c.client_ref) {
    const existente = (estado.tarefas || []).find(
      (t) => t && t.client_ref === c.client_ref,
    );
    if (existente) return clone(existente);
  }
  if (c.ref_externa) {
    const existente = (estado.tarefas || []).find(
      (t) => t && t.ref_externa === c.ref_externa,
    );
    if (existente) throw erro('invalido:ref_externa');
  }

  const quandoAgora = agoraISO();
  const tarefa = {
    id: novoId(),
    dono: dono || null,
    titulo: c.titulo,
    notas: c.notas == null ? null : c.notas,
    area: c.area || 'pessoal',
    quando: c.quando || null,
    hora: c.hora || null,
    repetir: c.repetir || null,
    estado: c.estado || 'aberta',
    estado_desde: quandoAgora,
    foco: c.foco === true,
    prioridade: c.prioridade || 'proximo',
    link: c.link || null,
    origem:
      c.ref_externa && String(c.ref_externa).startsWith('cf:')
        ? 'buriti'
        : origem,
    ref_externa: c.ref_externa || null,
    client_ref: c.client_ref || null,
    repete_de: null,
    feita_em: null,
    criada_em: quandoAgora,
    atualizada_em: quandoAgora,
    versao: 1,
    subtarefas: [],
  };
  estado.tarefas = estado.tarefas || [];
  estado.tarefas.push(tarefa);
  registrarEvento(estado, tarefa.id, 'criar', null, tarefa, origem);
  return clone(tarefa);
}

function atualizarNaLista(estado, id, versao, campos, origem = 'eu') {
  const tarefa = acharTarefa(estado, id);
  if (!tarefa) throw erro('nao_encontrada');
  if (Number(versao) !== Number(tarefa.versao)) throw erro('conflito');
  const c = validarCampos(campos, { criacao: false });
  if (!Object.keys(c).length) return clone(tarefa);
  const antes = clone(tarefa);
  for (const chave of Object.keys(c)) {
    tarefa[chave] = c[chave];
  }
  if (c.estado && c.estado !== antes.estado) {
    tarefa.estado_desde = agoraISO();
  }
  if (c.estado === 'aberta' || c.estado === 'esperando') {
    tarefa.feita_em = null;
  }
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'atualizar', antes, tarefa, origem);
  return clone(tarefa);
}

function concluirNaLista(estado, id, origem = 'eu') {
  const tarefa = acharTarefa(estado, id);
  if (!tarefa) throw erro('nao_encontrada');
  if (tarefa.estado === 'arquivada') throw erro('invalido:estado');
  if (tarefa.estado === 'feita') {
    return { tarefa: clone(tarefa), historico: null };
  }
  const quandoAgora = agoraISO();
  const antes = clone(tarefa);

  if (tarefa.repetir) {
    const historico = {
      ...clone(tarefa),
      id: novoId(),
      estado: 'feita',
      estado_desde: quandoAgora,
      feita_em: quandoAgora,
      repete_de: tarefa.id,
      client_ref: null,
      ref_externa: null,
      criada_em: quandoAgora,
      atualizada_em: quandoAgora,
      versao: 1,
      subtarefas: [],
    };
    estado.tarefas.push(historico);
    registrarEvento(estado, historico.id, 'criar', null, historico, origem);

    tarefa.quando = proximaData(tarefa.repetir, tarefa.quando, hojeSP());
    tarefa.estado = 'aberta';
    tarefa.feita_em = null;
    if (antes.estado !== 'aberta') tarefa.estado_desde = quandoAgora;
    tarefa.subtarefas = (tarefa.subtarefas || []).map((sub) => ({
      ...sub,
      feita: false,
    }));
    tocarTarefa(tarefa);
    registrarEvento(estado, tarefa.id, 'concluir', antes, tarefa, origem);
    return { tarefa: clone(tarefa), historico: clone(historico) };
  }

  tarefa.estado = 'feita';
  tarefa.feita_em = quandoAgora;
  tarefa.estado_desde = quandoAgora;
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'concluir', antes, tarefa, origem);
  return { tarefa: clone(tarefa), historico: null };
}

function reabrirNaLista(estado, id, origem = 'eu') {
  const tarefa = acharTarefa(estado, id);
  if (!tarefa) throw erro('nao_encontrada');
  if (tarefa.estado !== 'feita' && tarefa.estado !== 'arquivada') {
    throw erro('invalido:estado');
  }
  const antes = clone(tarefa);
  tarefa.estado = 'aberta';
  tarefa.feita_em = null;
  tarefa.estado_desde = agoraISO();
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'reabrir', antes, tarefa, origem);
  return clone(tarefa);
}

function adiarNaLista(estado, id, para, origem = 'eu') {
  const tarefa = acharTarefa(estado, id);
  if (!tarefa) throw erro('nao_encontrada');
  const data = normalizarData(para);
  if (!data) throw erro('invalido:quando');
  const antes = clone(tarefa);
  tarefa.quando = data;
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'adiar', antes, tarefa, origem);
  return clone(tarefa);
}

function textoSubtarefa(texto) {
  const t = typeof texto === 'string' ? texto : '';
  if (t.length < 1 || t.length > 300 || !t.trim()) {
    throw erro('invalido:texto');
  }
  return t;
}

function subCriarNaLista(estado, tarefaId, texto, origem = 'eu') {
  const tarefa = acharTarefa(estado, tarefaId);
  if (!tarefa) throw erro('nao_encontrada');
  const t = textoSubtarefa(texto);
  const subtarefas = Array.isArray(tarefa.subtarefas) ? tarefa.subtarefas : [];
  const ordem = subtarefas.reduce(
    (maior, sub) => Math.max(maior, Number(sub.ordem) || 0),
    0,
  );
  const sub = {
    id: novoId(),
    tarefa_id: tarefa.id,
    texto: t,
    feita: false,
    ordem: ordem + 1,
    criada_em: agoraISO(),
  };
  tarefa.subtarefas = [...subtarefas, sub];
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'sub_criar', null, sub, origem);
  return clone(sub);
}

function subMarcarNaLista(estado, id, feita, origem = 'eu') {
  const achado = acharSubtarefa(estado, id);
  if (!achado) throw erro('nao_encontrada');
  const { tarefa, sub } = achado;
  const antes = clone(sub);
  sub.feita = feita === true;
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'sub_marcar', antes, sub, origem);
  return clone(sub);
}

function subEditarNaLista(estado, id, texto, origem = 'eu') {
  const achado = acharSubtarefa(estado, id);
  if (!achado) throw erro('nao_encontrada');
  const t = textoSubtarefa(texto);
  const { tarefa, sub } = achado;
  const antes = clone(sub);
  sub.texto = t;
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'sub_editar', antes, sub, origem);
  return clone(sub);
}

function subApagarNaLista(estado, id, origem = 'eu') {
  const achado = acharSubtarefa(estado, id);
  if (!achado) throw erro('nao_encontrada');
  const { tarefa, sub } = achado;
  const antes = clone(sub);
  tarefa.subtarefas = (tarefa.subtarefas || []).filter((s) => s.id !== sub.id);
  tocarTarefa(tarefa);
  registrarEvento(estado, tarefa.id, 'sub_apagar', antes, null, origem);
  return null;
}

function compararTarefas(a, b) {
  const qa = normalizarData(a.quando);
  const qb = normalizarData(b.quando);
  if (qa !== qb) {
    if (!qa) return 1;
    if (!qb) return -1;
    return qa < qb ? -1 : 1;
  }
  const ha = a.hora || null;
  const hb = b.hora || null;
  if (ha !== hb) {
    if (ha === null) return 1;
    if (hb === null) return -1;
    return ha < hb ? -1 : 1;
  }
  const ca = a.criada_em || '';
  const cb = b.criada_em || '';
  if (ca === cb) return 0;
  return ca < cb ? -1 : 1;
}

function ordenarTarefas(lista) {
  return [...lista].sort(compararTarefas);
}

// ---------------------------------------------------------------------------
// Modo local

export class RepositorioLocal {
  constructor(armazenamento, { origem = 'eu' } = {}) {
    this.arm = armazenamento || criarArmazenamento();
    this.origem = origem;
    this.ouvintes = new Set();
    this.ouvintesErro = new Set();
    this.estado = this._ler();
    if (typeof window !== 'undefined') {
      this._aoStorage = (evento) => {
        if (evento.key !== CHAVE_LOCAL) return;
        this.estado = this._ler();
        this._emitir('storage');
      };
      window.addEventListener('storage', this._aoStorage);
    }
  }

  _ler() {
    const valor = lerJSON(this.arm, CHAVE_LOCAL, null);
    if (valor && Array.isArray(valor.tarefas)) {
      return {
        tarefas: valor.tarefas,
        eventos: Array.isArray(valor.eventos) ? valor.eventos : [],
        seq: Number(valor.seq) || 0,
        notas: valor.notas && typeof valor.notas === 'object' ? valor.notas : {},
      };
    }
    return { tarefas: [], eventos: [], seq: 0, notas: {} };
  }

  _salvar() {
    gravarJSON(this.arm, CHAVE_LOCAL, this.estado);
  }

  _emitir(tipo) {
    const pacote = { tipo, tarefas: clone(this.estado.tarefas) };
    for (const cb of this.ouvintes) {
      try {
        cb(pacote);
      } catch {
        // um ouvinte quebrado não derruba os outros
      }
    }
  }

  _erro(codigo) {
    for (const cb of this.ouvintesErro) {
      try {
        cb(codigo);
      } catch {
        // ignora
      }
    }
  }

  async iniciar() {
    return { autenticado: true, membro: 'dono' };
  }

  async enviarCodigo() {
    throw erro('modo_local');
  }

  async entrarComCodigo() {
    throw erro('modo_local');
  }

  async sair() {}

  usuario() {
    return null;
  }

  aoMudarSessao() {
    return () => {};
  }

  aoErro(cb) {
    this.ouvintesErro.add(cb);
    return () => this.ouvintesErro.delete(cb);
  }

  async carregar() {
    return ordenarTarefas(this.estado.tarefas).slice(0, LIMITE_LISTA).map(clone);
  }

  async notas() {
    return clone(this.estado.notas || {});
  }

  async salvarNota(area, texto) {
    validarNota(area, texto);
    const notas = this.estado.notas || (this.estado.notas = {});
    const atual = notas[area];
    notas[area] = {
      texto,
      versao: Number((atual && atual.versao) || 0) + 1,
      atualizada_em: agoraISO(),
    };
    this._salvar();
    return clone(notas[area]);
  }

  async criar(campos) {
    const tarefa = criarNaLista(this.estado, campos, {
      dono: 'local',
      origem: this.origem,
    });
    this._salvar();
    this._emitir('dados');
    return tarefa;
  }

  async atualizar(id, versao, campos) {
    const tarefa = atualizarNaLista(
      this.estado,
      id,
      versao,
      campos,
      this.origem,
    );
    this._salvar();
    this._emitir('dados');
    return tarefa;
  }

  async concluir(id) {
    const resultado = concluirNaLista(this.estado, id, this.origem);
    this._salvar();
    this._emitir('dados');
    return resultado;
  }

  async desfazerConclusao(id, antes = {}) {
    const tarefa = acharTarefa(this.estado, id);
    if (!tarefa) throw erro('nao_encontrada');
    const snapshot = clone(tarefa);

    if (Object.prototype.hasOwnProperty.call(antes, 'quando')) {
      tarefa.quando = antes.quando;
    }
    if (
      antes.estado &&
      antes.estado !== tarefa.estado &&
      ['aberta', 'esperando'].includes(antes.estado)
    ) {
      tarefa.estado = antes.estado;
      tarefa.estado_desde = antes.estado_desde || agoraISO();
      tarefa.feita_em = null;
    }
    if (Array.isArray(antes.subtarefas)) {
      const mapa = new Map(
        antes.subtarefas.map((sub) => [sub.id, sub.feita === true]),
      );
      tarefa.subtarefas = (tarefa.subtarefas || []).map((sub) =>
        mapa.has(sub.id) ? { ...sub, feita: mapa.get(sub.id) } : sub,
      );
    }

    // No modo local a cópia histórica é removida de verdade.
    const historico = acharHistoricoRecente(this.estado, id);
    if (historico) {
      this.estado.tarefas = this.estado.tarefas.filter(
        (t) => t.id !== historico.id,
      );
    }

    tocarTarefa(tarefa);
    registrarEvento(
      this.estado,
      tarefa.id,
      'desfazer_concluir',
      snapshot,
      tarefa,
      this.origem,
    );
    this._salvar();
    this._emitir('dados');
    return clone(tarefa);
  }

  async reabrir(id) {
    const tarefa = reabrirNaLista(this.estado, id, this.origem);
    this._salvar();
    this._emitir('dados');
    return tarefa;
  }

  async adiar(id, para) {
    const tarefa = adiarNaLista(this.estado, id, para, this.origem);
    this._salvar();
    this._emitir('dados');
    return tarefa;
  }

  async subCriar(tarefaId, texto) {
    const sub = subCriarNaLista(
      this.estado,
      tarefaId,
      texto,
      this.origem,
    );
    this._salvar();
    this._emitir('dados');
    return sub;
  }

  async subMarcar(id, feita) {
    const sub = subMarcarNaLista(this.estado, id, feita, this.origem);
    this._salvar();
    this._emitir('dados');
    return sub;
  }

  async subEditar(id, texto) {
    const sub = subEditarNaLista(this.estado, id, texto, this.origem);
    this._salvar();
    this._emitir('dados');
    return sub;
  }

  async subApagar(id) {
    subApagarNaLista(this.estado, id, this.origem);
    this._salvar();
    this._emitir('dados');
  }

  async eventos(id) {
    return this.estado.eventos
      .filter((e) => e.tarefa_id === id)
      .sort((a, b) => b.id - a.id)
      .slice(0, 50)
      .map(clone);
  }

  async mudancasIa() {
    return [];
  }

  async desfazerIa() {
    return 0;
  }

  assinar(cb) {
    this.ouvintes.add(cb);
    return () => this.ouvintes.delete(cb);
  }

  exportar() {
    return clone(this.estado.tarefas);
  }
}

// ---------------------------------------------------------------------------
// Modo Supabase

function traduzirErro(e) {
  if (e && e.codigo) return e;
  const texto = String((e && e.message) || e || '');
  for (const codigo of ['sem_acesso', 'nao_encontrada', 'conflito', 'limite']) {
    if (new RegExp(`(^|[^a-z_])${codigo}([^a-z_]|$)`).test(texto)) {
      return erro(codigo);
    }
  }
  const invalido = /invalido:[a-z_]+/.exec(texto);
  if (invalido) return erro(invalido[0]);
  const semRede =
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    (e && e.name === 'TypeError') ||
    /failed to fetch|networkerror|load failed|fetch/i.test(texto);
  if (semRede) {
    const rede = erro('rede');
    rede.rede = true;
    return rede;
  }
  return new Error(texto || 'erro');
}

// ---------------------------------------------------------------------------
// Autenticação por e-mail + código (OTP)

const MENSAGENS_AUTH = {
  muitos_pedidos: 'Espere um pouco antes de pedir outro código.',
  codigo: 'Código incorreto ou expirado. Peça outro código.',
  email: 'E-mail inválido.',
  rede: 'Sem conexão. Tente de novo.',
  auth: 'Não foi possível entrar. Tente de novo.',
};

export function normalizarEmail(email) {
  return typeof email === 'string' ? email.trim() : '';
}

export function emailValido(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizarEmail(email));
}

/** Converte erros do Supabase Auth em erros curtos e em português. */
export function traduzirErroAuth(e) {
  if (e && e.codigo && MENSAGENS_AUTH[e.codigo]) return e;
  const texto = String((e && e.message) || e || '');
  const status = Number((e && (e.status || e.statusCode)) || 0);
  const bruto = String((e && e.code) || '');
  const semRede =
    (typeof navigator !== 'undefined' && navigator.onLine === false) ||
    (e && e.name === 'TypeError') ||
    /failed to fetch|networkerror|load failed|fetch/i.test(texto);

  let codigo = 'auth';
  if (semRede) {
    codigo = 'rede';
  } else if (
    status === 429 ||
    /rate.?limit|too many|security purposes|only request this after/i.test(
      texto,
    ) ||
    /rate.?limit/i.test(bruto)
  ) {
    codigo = 'muitos_pedidos';
  } else if (/email/i.test(texto) && /invalid|validate/i.test(texto)) {
    codigo = 'email';
  } else if (
    /otp|token/i.test(bruto) ||
    /token|code|otp/i.test(texto) ||
    /expired|invalid|incorrect/i.test(texto)
  ) {
    codigo = 'codigo';
  }
  return erro(codigo, MENSAGENS_AUTH[codigo]);
}

export class RepositorioSupabase {
  constructor(url, chave, armazenamento) {
    const lib = globalThis.supabase;
    if (!lib || typeof lib.createClient !== 'function') {
      throw new Error('vendor/supabase.js não foi carregado antes de dados.js');
    }
    this.cliente = lib.createClient(url, chave, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        flowType: 'pkce',
      },
    });
    this.arm = armazenamento || criarArmazenamento();
    this.tarefas = lerJSON(this.arm, CHAVE_CACHE, []);
    if (!Array.isArray(this.tarefas)) this.tarefas = [];
    this.fila = lerJSON(this.arm, CHAVE_FILA, []);
    if (!Array.isArray(this.fila)) this.fila = [];
    this.ouvintes = new Set();
    this.ouvintesErro = new Set();
    this.ouvintesSessao = new Set();
    this.sessao = null;
    this.membro = null;
    this.canal = null;
    this.enviando = false;
    this.sincronizando = false;
    this.timerSync = null;
    this.timerRetentativa = null;
    this._persistenciaPedida = false;

    this.cliente.auth.onAuthStateChange((evento, sessao) => {
      if (evento === 'SIGNED_OUT' && !sessao) {
        // Pode ser só uma falha de refresh: tenta ler a sessão uma vez.
        setTimeout(async () => {
          try {
            const { data } = await this.cliente.auth.getSession();
            if (data && data.session) {
              this.sessao = data.session;
              this._notificarSessao(evento);
              return;
            }
          } catch {
            // segue como deslogado
          }
          this.sessao = null;
          this.membro = null;
          this.fila = [];
          this._salvarFila();
          this._removerCanal();
          this._notificarSessao(evento);
        }, 0);
        return;
      }

      this.sessao = sessao || null;
      setTimeout(async () => {
        if (sessao) {
          this._ajustarDono(sessao);
          try {
            await this._verificarMembro();
          } catch {
            // mantém o último papel conhecido
          }
          this._assinarRealtime();
          this.processarFila();
          this._limparUrlAuth();
        } else {
          this.membro = null;
          this._removerCanal();
        }
        this._notificarSessao(evento);
      }, 0);
    });

    if (typeof window !== 'undefined') {
      this._aoOnline = () => this.processarFila();
      window.addEventListener('online', this._aoOnline);
      this.timerRetentativa = setInterval(() => {
        if (this.fila.length) this.processarFila();
      }, 20000);
    }
  }

  // ---------------------------------------------------------------- sessão

  async iniciar() {
    if (
      !this._persistenciaPedida &&
      typeof navigator !== 'undefined' &&
      navigator.storage &&
      typeof navigator.storage.persist === 'function'
    ) {
      this._persistenciaPedida = true;
      try {
        await navigator.storage.persist();
      } catch {
        // sem persistência; segue
      }
    }

    let sessao = null;
    try {
      const { data } = await this.cliente.auth.getSession();
      sessao = (data && data.session) || null;
    } catch {
      sessao = null;
    }
    if (!sessao) {
      // "Falha de refresh / SIGNED_OUT inesperado: tentar getSession() uma vez
      // antes de mostrar a tela de login."
      try {
        const { data } = await this.cliente.auth.getSession();
        sessao = (data && data.session) || null;
      } catch {
        sessao = null;
      }
    }
    this.sessao = sessao;
    if (sessao) {
      this._ajustarDono(sessao);
      try {
        await this._verificarMembro();
      } catch {
        // offline: usa o último papel conhecido
      }
      this._assinarRealtime();
      this.processarFila();
      this._limparUrlAuth();
    }
    return { autenticado: Boolean(sessao), membro: this.membro };
  }

  _ajustarDono(sessao) {
    const uid = sessao && sessao.user && sessao.user.id;
    if (!uid) return;
    const anterior = this.arm.getItem(CHAVE_DONO);
    if (anterior && anterior !== uid) {
      // Outra conta no mesmo navegador: não mistura cache, fila nem notas.
      this.tarefas = [];
      this.fila = [];
      this._salvarCache();
      this._salvarFila();
      this.arm.removeItem(CHAVE_NOTAS);
    }
    this.arm.setItem(CHAVE_DONO, uid);
  }

  _redirecionamento() {
    if (typeof location === 'undefined') return null;
    return location.origin + location.pathname;
  }

  async enviarCodigo(email) {
    const alvo = normalizarEmail(email);
    if (!emailValido(alvo)) throw erro('email', MENSAGENS_AUTH.email);
    const opcoes = { shouldCreateUser: true };
    const redirect = this._redirecionamento();
    if (redirect) opcoes.emailRedirectTo = redirect;
    const { error } = await this.cliente.auth.signInWithOtp({
      email: alvo,
      options: opcoes,
    });
    if (error) throw traduzirErroAuth(error);
    return alvo;
  }

  async entrarComCodigo(email, codigo) {
    const alvo = normalizarEmail(email);
    if (!emailValido(alvo)) throw erro('email', MENSAGENS_AUTH.email);
    const token = String(codigo == null ? '' : codigo).replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(token)) {
      throw erro('codigo', 'Digite o código que chegou no e-mail.');
    }
    const { data, error } = await this.cliente.auth.verifyOtp({
      email: alvo,
      token,
      type: 'email',
    });
    if (error) throw traduzirErroAuth(error);

    const sessao = (data && data.session) || null;
    if (sessao) {
      this.sessao = sessao;
      this._ajustarDono(sessao);
      try {
        await this._verificarMembro();
      } catch {
        // offline: segue com o último papel conhecido
      }
      this._assinarRealtime();
      this.processarFila();
      this._limparUrlAuth();
      this._notificarSessao('SIGNED_IN');
    }
    return { autenticado: Boolean(this.sessao), membro: this.membro };
  }

  async sair() {
    try {
      await this.cliente.auth.signOut();
    } catch {
      // mesmo se falhar a rede, limpa a sessão local
    }
    this.sessao = null;
    this.membro = null;
    this.fila = [];
    this._salvarFila();
    this._removerCanal();
    this._notificarSessao('SIGNED_OUT');
  }

  usuario() {
    return (this.sessao && this.sessao.user) || null;
  }

  aoMudarSessao(cb) {
    this.ouvintesSessao.add(cb);
    return () => this.ouvintesSessao.delete(cb);
  }

  aoErro(cb) {
    this.ouvintesErro.add(cb);
    return () => this.ouvintesErro.delete(cb);
  }

  _notificarSessao(evento) {
    const pacote = {
      evento,
      autenticado: Boolean(this.sessao),
      membro: this.membro,
    };
    for (const cb of this.ouvintesSessao) {
      try {
        cb(pacote);
      } catch {
        // ignora
      }
    }
  }

  async _verificarMembro() {
    try {
      const papel = await this._rpc('tf_sou_membro');
      this.membro = papel || null;
      if (papel) this.arm.setItem(CHAVE_MEMBRO, String(papel));
      else this.arm.removeItem(CHAVE_MEMBRO);
    } catch (e) {
      if (e && e.rede) {
        const ultimo = this.arm.getItem(CHAVE_MEMBRO);
        this.membro = ultimo || null;
        return;
      }
      this.membro = null;
    }
  }

  _limparUrlAuth() {
    if (typeof location === 'undefined' || typeof history === 'undefined') return;
    if (!/[?&](code|error|error_description)=/.test(location.search)) return;
    try {
      history.replaceState({}, '', location.pathname + location.hash);
    } catch {
      // histórico indisponível
    }
  }

  // ------------------------------------------------------------------ RPC

  async _rpc(nome, argumentos) {
    try {
      const { data, error } = await this.cliente.rpc(nome, argumentos);
      if (error) throw error;
      return data;
    } catch (e) {
      throw traduzirErro(e);
    }
  }

  _dono() {
    return (this.sessao && this.sessao.user && this.sessao.user.id) || null;
  }

  // ------------------------------------------------------------- cache/fila

  _salvarCache() {
    gravarJSON(this.arm, CHAVE_CACHE, this.tarefas);
  }

  _salvarFila() {
    gravarJSON(this.arm, CHAVE_FILA, this.fila);
  }

  _emitir(tipo) {
    const pacote = { tipo, tarefas: clone(this.tarefas) };
    for (const cb of this.ouvintes) {
      try {
        cb(pacote);
      } catch {
        // ignora
      }
    }
  }

  _erro(codigo) {
    for (const cb of this.ouvintesErro) {
      try {
        cb(codigo);
      } catch {
        // ignora
      }
    }
  }

  async carregar() {
    if (!this.sessao) return clone(this.tarefas);
    if (this.fila.length) {
      this.processarFila();
      return clone(this.tarefas);
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      return clone(this.tarefas);
    }
    try {
      const lista = normalizarLista(
        await this._rpc('tf_listar', { p: this._filtroLista() }),
      );
      if (!this.fila.length) {
        this.tarefas = lista;
        this._salvarCache();
      }
    } catch (e) {
      if (!e || !e.rede) throw e;
      // offline: devolve o cache
    }
    return clone(this.tarefas);
  }

  _agendarSincronizacao(atraso = 250) {
    if (this.timerSync) clearTimeout(this.timerSync);
    this.timerSync = setTimeout(() => {
      this.timerSync = null;
      this._sincronizar();
    }, atraso);
  }

  async _sincronizar() {
    if (this.sincronizando || !this.sessao || this.enviando || this.fila.length) {
      return;
    }
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    this.sincronizando = true;
    try {
      const lista = normalizarLista(
        await this._rpc('tf_listar', { p: this._filtroLista() }),
      );
      if (!this.fila.length && !this.enviando) {
        this.tarefas = lista;
        this._salvarCache();
        this._emitir('realtime');
      }
    } catch {
      // tenta de novo no próximo evento
    } finally {
      this.sincronizando = false;
    }
  }

  _estadoOtimista() {
    return { tarefas: clone(this.tarefas), eventos: [], seq: 0 };
  }

  _aplicarOtimista(operacao) {
    const estado = this._estadoOtimista();
    const resultado = operacao(estado);
    this.tarefas = ordenarTarefas(estado.tarefas);
    this._salvarCache();
    this._emitir('dados');
    return resultado;
  }

  _enfileirar(item) {
    this.fila.push(item);
    this._salvarFila();
    this.processarFila();
  }

  // -------------------------------------------------------------- escritas

  async criar(campos) {
    const validos = validarCampos(campos, { criacao: true });
    const tarefa = this._aplicarOtimista((estado) =>
      criarNaLista(estado, validos, { dono: this._dono(), origem: 'eu' }),
    );
    this._enfileirar({
      tipo: 'criar',
      campos: validos,
      tempId: tarefa.id,
      chave: novoId(),
    });
    return tarefa;
  }

  async atualizar(id, versao, campos) {
    const validos = validarCampos(campos, { criacao: false });
    const tarefa = this._aplicarOtimista((estado) =>
      atualizarNaLista(estado, id, versao, validos, 'eu'),
    );
    this._enfileirar({ tipo: 'atualizar', id, versao, campos: validos });
    return tarefa;
  }

  async concluir(id) {
    const resultado = this._aplicarOtimista((estado) =>
      concluirNaLista(estado, id, 'eu'),
    );
    this._enfileirar({
      tipo: 'concluir',
      id,
      tempHistoricoId: (resultado.historico && resultado.historico.id) || null,
    });
    return resultado;
  }

  async desfazerConclusao(id, antes = {}) {
    const atual = this.tarefas.find((t) => t && t.id === id);
    if (!atual) throw erro('nao_encontrada');

    const campos = {};
    if (Object.prototype.hasOwnProperty.call(antes, 'quando')) {
      campos.quando = antes.quando;
    }
    if (
      antes.estado &&
      antes.estado !== atual.estado &&
      ['aberta', 'esperando'].includes(antes.estado)
    ) {
      campos.estado = antes.estado;
    }
    if (Object.keys(campos).length) {
      await this.atualizar(id, atual.versao, campos);
    }

    // tf_atualizar não recebe subtarefas; a cópia histórica é arquivada e
    // cada subtarefa que estava feita volta a ser marcada por tf_sub_marcar.
    const historico = acharHistoricoRecente({ tarefas: this.tarefas }, id);
    if (historico) {
      await this.atualizar(historico.id, historico.versao, {
        estado: 'arquivada',
      });
    }
    for (const sub of Array.isArray(antes.subtarefas)
      ? antes.subtarefas
      : []) {
      if (sub.feita !== true) continue;
      const tarefaAtual = this.tarefas.find((t) => t.id === id);
      const atualSub = (tarefaAtual?.subtarefas || []).find(
        (s) => s.id === sub.id,
      );
      if (atualSub && atualSub.feita !== true) {
        await this.subMarcar(sub.id, true);
      }
    }
    return this.tarefas.find((t) => t.id === id) || null;
  }

  async reabrir(id) {
    const tarefa = this._aplicarOtimista((estado) =>
      reabrirNaLista(estado, id, 'eu'),
    );
    this._enfileirar({ tipo: 'reabrir', id });
    return tarefa;
  }

  async adiar(id, para) {
    const tarefa = this._aplicarOtimista((estado) =>
      adiarNaLista(estado, id, para, 'eu'),
    );
    this._enfileirar({ tipo: 'adiar', id, para: tarefa.quando });
    return tarefa;
  }

  async subCriar(tarefaId, texto) {
    const sub = this._aplicarOtimista((estado) =>
      subCriarNaLista(estado, tarefaId, texto, 'eu'),
    );
    this._enfileirar({
      tipo: 'subCriar',
      tarefaId,
      texto: sub.texto,
      tempSubId: sub.id,
    });
    return sub;
  }

  async subMarcar(id, feita) {
    const marcada = feita === true;
    const sub = this._aplicarOtimista((estado) =>
      subMarcarNaLista(estado, id, marcada, 'eu'),
    );
    this._enfileirar({ tipo: 'subMarcar', id, feita: marcada });
    return sub;
  }

  async subEditar(id, texto) {
    const sub = this._aplicarOtimista((estado) =>
      subEditarNaLista(estado, id, texto, 'eu'),
    );
    this._enfileirar({ tipo: 'subEditar', id, texto: sub.texto });
    return sub;
  }

  async subApagar(id) {
    this._aplicarOtimista((estado) => subApagarNaLista(estado, id, 'eu'));
    this._enfileirar({ tipo: 'subApagar', id });
  }

  // ------------------------------------------------------------- fila RPC

  _executar(item) {
    switch (item.tipo) {
      case 'criar':
        return this._rpc('tf_criar', { p: item.campos });
      case 'atualizar':
        return this._rpc('tf_atualizar', {
          p_id: item.id,
          p_versao: item.versao,
          p: item.campos,
        });
      case 'concluir':
        return this._rpc('tf_concluir', { p_id: item.id });
      case 'reabrir':
        return this._rpc('tf_reabrir', { p_id: item.id });
      case 'adiar':
        return this._rpc('tf_adiar', { p_id: item.id, p_para: item.para });
      case 'subCriar':
        return this._rpc('tf_sub_criar', {
          p_tarefa: item.tarefaId,
          p_texto: item.texto,
        });
      case 'subMarcar':
        return this._rpc('tf_sub_marcar', {
          p_id: item.id,
          p_feita: item.feita,
        });
      case 'subEditar':
        return this._rpc('tf_sub_editar', {
          p_id: item.id,
          p_texto: item.texto,
        });
      case 'subApagar':
        return this._rpc('tf_sub_apagar', { p_id: item.id });
      case 'nota':
        return this._rpc('tf_nota_salvar', {
          p_area: item.area,
          p_texto: item.texto,
        });
      default:
        return Promise.resolve(null);
    }
  }

  async processarFila() {
    if (this.enviando || !this.sessao) return;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
    this.enviando = true;
    try {
      while (this.fila.length) {
        const item = this.fila[0];
        try {
          const resposta = await this._executar(item);
          this.fila.shift();
          this._salvarFila();
          this._aplicarResposta(item, resposta);
        } catch (e) {
          if (e && e.rede) break;
          this.fila.shift();
          this._salvarFila();
          this._erro((e && (e.codigo || e.message)) || 'erro');
          if (e && e.codigo === 'conflito') this._agendarSincronizacao(0);
        }
      }
    } finally {
      this.enviando = false;
    }
    if (!this.fila.length) this._agendarSincronizacao(200);
  }

  _aplicarResposta(item, resposta) {
    if (item.tipo === 'criar') {
      const linha = normalizarLinha(resposta);
      const real = linha && linha.id;
      if (real) this._substituirId(item.tempId, real, linha, 'tarefa');
      return;
    }
    if (item.tipo === 'subCriar') {
      const linha = normalizarLinha(resposta);
      if (linha && linha.id) {
        this._substituirId(item.tempSubId, linha.id, linha, 'sub');
      }
      return;
    }
    if (item.tipo === 'concluir') {
      const resultado = normalizarLinha(resposta);
      const historico = resultado && resultado.historico;
      if (item.tempHistoricoId && historico && historico.id) {
        this._substituirId(
          item.tempHistoricoId,
          historico.id,
          historico,
          'tarefa',
        );
      }
      return;
    }
    // Demais respostas: a sincronização abaixo traz o estado autoritativo.
  }

  _substituirId(temp, real, linha, tipo) {
    if (!temp || !real) return;
    if (tipo === 'tarefa') {
      const indice = this.tarefas.findIndex((t) => t && t.id === temp);
      if (indice >= 0) {
        const atual = this.tarefas[indice];
        this.tarefas[indice] =
          linha && typeof linha === 'object'
            ? {
                ...linha,
                subtarefas: Array.isArray(linha.subtarefas)
                  ? linha.subtarefas
                  : atual.subtarefas || [],
              }
            : { ...atual, id: real };
      }
    } else {
      for (const tarefa of this.tarefas) {
        const lista = tarefa.subtarefas || [];
        const indice = lista.findIndex((s) => s && s.id === temp);
        if (indice >= 0) {
          lista[indice] =
            linha && typeof linha === 'object'
              ? { ...linha, tarefa_id: tarefa.id }
              : { ...lista[indice], id: real };
          tarefa.subtarefas = lista;
          break;
        }
      }
    }
    for (const item of this.fila) {
      if (item.id === temp) item.id = real;
      if (item.tarefaId === temp) item.tarefaId = real;
      if (item.tempId === temp) item.tempId = real;
      if (item.tempSubId === temp) item.tempSubId = real;
      if (item.tempHistoricoId === temp) item.tempHistoricoId = real;
    }
    this._salvarCache();
    this._salvarFila();
    this._emitir('dados');
  }

  // ---------------------------------------------------------------- consulta

  _filtroLista() {
    return {
      limite: LIMITE_LISTA,
      estado: ['aberta', 'esperando', 'feita'],
      feitas_desde: somarDias(hojeSP(), -DIAS_FEITAS),
    };
  }

  // ------------------------------------------------------------------- notas

  _lerNotasCache() {
    return lerJSON(this.arm, CHAVE_NOTAS, {}) || {};
  }

  async notas() {
    const cache = this._lerNotasCache();
    const pendentes = new Set(
      this.fila.filter((i) => i.tipo === 'nota').map((i) => i.area),
    );
    if (!this.sessao) return cache;
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return cache;
    try {
      const remoto = (await this._rpc('tf_notas', {})) || {};
      // O que ainda está na fila vale mais que o servidor.
      for (const area of pendentes) {
        if (cache[area]) remoto[area] = cache[area];
      }
      gravarJSON(this.arm, CHAVE_NOTAS, remoto);
      return clone(remoto);
    } catch (e) {
      if (!e || !e.rede) throw e;
      return cache;
    }
  }

  async salvarNota(area, texto) {
    validarNota(area, texto);
    const cache = this._lerNotasCache();
    const atual = cache[area];
    cache[area] = {
      texto,
      versao: Number((atual && atual.versao) || 0) + 1,
      atualizada_em: agoraISO(),
    };
    gravarJSON(this.arm, CHAVE_NOTAS, cache);
    // Só a última versão de cada caixa precisa subir.
    this.fila = this.fila.filter((i) => !(i.tipo === 'nota' && i.area === area));
    this._enfileirar({ tipo: 'nota', area, texto });
    return clone(cache[area]);
  }

  async eventos(id) {
    const dados = await this._rpc('tf_eventos', { p_tarefa: id });
    return normalizarLista(dados);
  }

  async mudancasIa(horas = 24) {
    const dados = await this._rpc('tf_mudancas_ia', {
      p_horas: Number(horas) || 24,
    });
    return normalizarLista(dados);
  }

  async desfazerIa(horas = 24) {
    const quantidade = await this._rpc('tf_desfazer_ia', {
      p_horas: Number(horas) || 24,
    });
    this._agendarSincronizacao(0);
    return Number(quantidade) || 0;
  }

  assinar(cb) {
    this.ouvintes.add(cb);
    this._assinarRealtime();
    return () => this.ouvintes.delete(cb);
  }

  exportar() {
    return clone(this.tarefas);
  }

  // --------------------------------------------------------------- realtime

  _assinarRealtime() {
    if (this.canal || !this.sessao) return;
    const uid = this._dono();
    let canal = this.cliente.channel(`tarefas-${uid || 'anon'}`);
    canal = canal.on(
      'postgres_changes',
      {
        event: '*',
        schema: 'public',
        table: 'tarefas',
        ...(uid ? { filter: `dono=eq.${uid}` } : {}),
      },
      () => this._agendarSincronizacao(),
    );
    canal = canal.on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'subtarefas' },
      () => this._agendarSincronizacao(),
    );
    this.canal = canal.subscribe();
  }

  _removerCanal() {
    if (!this.canal) return;
    try {
      this.cliente.removeChannel(this.canal);
    } catch {
      // ignora
    }
    this.canal = null;
  }
}

// ---------------------------------------------------------------------------
// Instância usada pelo app

export const dados = modoLocal
  ? new RepositorioLocal()
  : new RepositorioSupabase(supabaseUrl, supabaseAnonKey);

export const enviarCodigo = (email) => dados.enviarCodigo(email);
export const entrarComCodigo = (email, codigo) =>
  dados.entrarComCodigo(email, codigo);
export const sair = () => dados.sair();
export const iniciar = () => dados.iniciar();
