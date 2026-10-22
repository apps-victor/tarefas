// Lógica compartilhada (ES module puro, sem DOM). Usada pelo PWA e pelo MCP.
// Datas são strings 'AAAA-MM-DD' no fuso local (America/Sao_Paulo).
// Cálculos de calendário usam UTC para não depender do fuso do aparelho.

export const AREAS = ['casa', 'lapig', 'buriti', 'pessoal'];

export const ROTULOS_AREA = {
  casa: 'Casa',
  lapig: 'LAPIG',
  buriti: 'Buriti',
  pessoal: 'Pessoal',
};

export const DIAS_SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

export const DIAS_SEMANA_LONGOS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

const MESES = [
  'janeiro',
  'fevereiro',
  'março',
  'abril',
  'maio',
  'junho',
  'julho',
  'agosto',
  'setembro',
  'outubro',
  'novembro',
  'dezembro',
];

// ---------------------------------------------------------------------------
// Datas (tudo em UTC internamente; strings públicas 'AAAA-MM-DD')

/** Converte 'AAAA-MM-DD' em Date UTC. Retorna null se inválida. */
export function paraData(valor) {
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return null;
    return new Date(
      Date.UTC(valor.getUTCFullYear(), valor.getUTCMonth(), valor.getUTCDate()),
    );
  }
  if (typeof valor !== 'string') return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(valor.trim());
  if (!m) return null;
  const ano = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null;
  }
  return d;
}

/** Date (UTC) → 'AAAA-MM-DD'. */
export function formatarISO(data) {
  if (!(data instanceof Date) || Number.isNaN(data.getTime())) return null;
  const ano = String(data.getUTCFullYear()).padStart(4, '0');
  const mes = String(data.getUTCMonth() + 1).padStart(2, '0');
  const dia = String(data.getUTCDate()).padStart(2, '0');
  return `${ano}-${mes}-${dia}`;
}

/** Normaliza qualquer data aceita (Date ou string) para 'AAAA-MM-DD'. */
export function normalizarData(valor) {
  const d = paraData(valor);
  return d ? formatarISO(d) : null;
}

export function somarDias(iso, quantidade) {
  const d = paraData(iso);
  if (!d) return null;
  d.setUTCDate(d.getUTCDate() + Number(quantidade || 0));
  return formatarISO(d);
}

export function diaSemana(iso) {
  const d = paraData(iso);
  return d ? d.getUTCDay() : null;
}

/** Quantidade de dias de `a` menos `b` (a - b). */
export function diferencaDias(a, b) {
  const da = paraData(a);
  const db = paraData(b);
  if (!da || !db) return null;
  return Math.round((da.getTime() - db.getTime()) / 86400000);
}

export function diasNoMes(ano, mes) {
  return new Date(Date.UTC(ano, mes, 0)).getUTCDate();
}

/** Domingo da semana de `iso` (semana começa no domingo). */
export function inicioSemana(iso) {
  const dow = diaSemana(iso);
  if (dow === null) return null;
  return somarDias(iso, -dow);
}

/** Segunda-feira da semana de `iso` (mesma âncora de date_trunc('week') do SQL). */
export function inicioSemanaSegunda(iso) {
  const dow = diaSemana(iso);
  if (dow === null) return null;
  return somarDias(iso, -((dow + 6) % 7));
}

/** Data de hoje em America/Sao_Paulo, 'AAAA-MM-DD'. */
export function hojeSP(agora = new Date()) {
  try {
    const formato = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Sao_Paulo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    if (typeof formato.formatToParts === 'function') {
      const partes = formato.formatToParts(agora);
      const mapa = {};
      for (const parte of partes) {
        if (parte.type !== 'literal') mapa[parte.type] = parte.value;
      }
      if (mapa.year && mapa.month && mapa.day) {
        return `${mapa.year}-${mapa.month}-${mapa.day}`;
      }
    }
    return formato.format(agora);
  } catch {
    // Fallback improvável (runtime sem Intl com timezone).
    return formatarISO(
      new Date(
        Date.UTC(agora.getFullYear(), agora.getMonth(), agora.getDate()),
      ),
    );
  }
}

/** Data (em America/Sao_Paulo) de um instante ISO, ex.: feita_em. */
export function dataSP(instante) {
  if (!instante) return null;
  const d = instante instanceof Date ? instante : new Date(instante);
  if (Number.isNaN(d.getTime())) return null;
  return hojeSP(d);
}

/** "quinta, 22 de outubro" (sem ano). */
export function dataPorExtenso(iso) {
  const d = paraData(iso);
  if (!d) return '';
  return `${DIAS_SEMANA_LONGOS[d.getUTCDay()]}, ${d.getUTCDate()} de ${
    MESES[d.getUTCMonth()]
  }`;
}

/** "sáb 24/10" */
export function rotuloCurto(iso) {
  const d = paraData(iso);
  if (!d) return '';
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${DIAS_SEMANA[d.getUTCDay()]} ${dia}/${mes}`;
}

/** "24/10" */
export function rotuloDiaMes(iso) {
  const d = paraData(iso);
  if (!d) return '';
  const dia = String(d.getUTCDate()).padStart(2, '0');
  const mes = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${dia}/${mes}`;
}

/** '07:30' → '7h30'; '07:00' → '7h'. */
export function formatarHora(hora) {
  if (!hora || typeof hora !== 'string') return '';
  const m = /^(\d{1,2}):(\d{2})/.exec(hora);
  if (!m) return hora;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return min === 0 ? `${h}h` : `${h}h${String(min).padStart(2, '0')}`;
}

// ---------------------------------------------------------------------------
// Repetição

function repetirNormalizado(repetir) {
  if (!repetir || typeof repetir !== 'object') return null;
  const freq = repetir.freq;
  if (freq !== 'diaria' && freq !== 'semanal' && freq !== 'mensal') return null;
  const intervalo = Math.min(
    365,
    Math.max(1, Math.floor(Number(repetir.intervalo) || 1)),
  );
  const saida = { freq, intervalo };
  if (Array.isArray(repetir.dias_semana)) {
    const dias = [
      ...new Set(
        repetir.dias_semana
          .map((n) => Number(n))
          .filter((n) => Number.isInteger(n) && n >= 0 && n <= 6),
      ),
    ].sort((a, b) => a - b);
    if (dias.length) saida.dias_semana = dias;
  }
  if (Number.isInteger(Number(repetir.dia_mes))) {
    const dia = Number(repetir.dia_mes);
    if (dia >= 1 && dia <= 31) saida.dia_mes = dia;
  }
  return saida;
}

/**
 * Próxima ocorrência DEPOIS de `base` (e nunca ≤ hoje), pela regra de repetição.
 * Mesma regra usada pelo app e pelo SQL.
 * - semanal: dias_semana (padrão: dia da semana de `base`) a cada `intervalo` semanas;
 * - mensal: dia_mes (padrão: dia de `base`), com dia 31 caindo no último dia do mês;
 * - diária: base + intervalo.
 */
export function proximaData(repetir, base, hoje) {
  const r = repetirNormalizado(repetir);
  if (!r) return null;
  const h = normalizarData(hoje) || hojeSP();
  const b = normalizarData(base);
  const referencia = b || h;

  if (r.freq === 'diaria') {
    let d = somarDias(referencia, r.intervalo);
    let voltas = 0;
    while (d && d <= h && voltas < 4000) {
      d = somarDias(d, r.intervalo);
      voltas += 1;
    }
    return d;
  }

  if (r.freq === 'semanal') {
    const ancora = referencia;
    const dias = r.dias_semana && r.dias_semana.length
      ? r.dias_semana
      : [diaSemana(ancora)];
    const semanaBase = inicioSemanaSegunda(ancora);
    const inicio = b && b > h ? b : h;
    const limite = 370 * r.intervalo + 14;
    for (let k = 1; k <= limite; k += 1) {
      const d = somarDias(inicio, k);
      if (!dias.includes(diaSemana(d))) continue;
      const semanas = Math.round(
        diferencaDias(inicioSemanaSegunda(d), semanaBase) / 7,
      );
      if (semanas % r.intervalo === 0 && d > h) return d;
    }
    return null;
  }

  // mensal
  const diaMes = r.dia_mes || Number(ancora.slice(8, 10));
  let ano = Number(referencia.slice(0, 4));
  let mes = Number(referencia.slice(5, 7));
  for (let k = 0; k < 1200; k += 1) {
    mes += r.intervalo;
    while (mes > 12) {
      mes -= 12;
      ano += 1;
    }
    const dia = Math.min(diaMes, diasNoMes(ano, mes));
    const d = formatarISO(new Date(Date.UTC(ano, mes - 1, dia)));
    if (d > referencia && d > h) return d;
  }
  return null;
}

/**
 * Primeira ocorrência a partir de hoje (inclusive), usada quando a tarefa
 * repetida é criada sem data explícita.
 */
export function primeiraOcorrencia(repetir, hoje) {
  const r = repetirNormalizado(repetir);
  if (!r) return null;
  const h = normalizarData(hoje) || hojeSP();

  if (r.freq === 'diaria') return h;

  if (r.freq === 'semanal') {
    const dias = r.dias_semana && r.dias_semana.length
      ? r.dias_semana
      : [diaSemana(h)];
    const semanaBase = inicioSemanaSegunda(h);
    const limite = 7 * r.intervalo + 7;
    for (let k = 0; k <= limite; k += 1) {
      const d = somarDias(h, k);
      if (!dias.includes(diaSemana(d))) continue;
      const semanas = Math.round(
        diferencaDias(inicioSemanaSegunda(d), semanaBase) / 7,
      );
      if (semanas % r.intervalo === 0) return d;
    }
    return null;
  }

  const diaMes = r.dia_mes || Number(h.slice(8, 10));
  let ano = Number(h.slice(0, 4));
  let mes = Number(h.slice(5, 7));
  for (let k = 0; k < 1200; k += 1) {
    const dia = Math.min(diaMes, diasNoMes(ano, mes));
    const d = formatarISO(new Date(Date.UTC(ano, mes - 1, dia)));
    if (d >= h) return d;
    mes += r.intervalo;
    while (mes > 12) {
      mes -= 12;
      ano += 1;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Agrupamento da tela

export const TITULOS_GRUPO = {
  foco: 'Foco',
  hoje: 'Hoje',
  amanha: 'Amanhã',
  semana: 'Esta semana',
  depois: 'Depois',
  sem_data: 'Sem data',
  esperando: 'Esperando',
  feitas_hoje: 'Feitas hoje',
};

export const GRUPOS_RECOLHIDOS = ['sem_data', 'esperando', 'feitas_hoje'];

function compararTarefas(a, b) {
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

function domingoDaSemana(hoje) {
  const dow = diaSemana(hoje);
  if (dow === null) return null;
  const falta = (7 - dow) % 7;
  return somarDias(hoje, falta === 0 ? 7 : falta);
}

function subtarefasDe(tarefa) {
  return Array.isArray(tarefa && tarefa.subtarefas) ? tarefa.subtarefas : [];
}

/**
 * Agrupa tarefas para a tela.
 * Retorna [{ chave, titulo, tarefas }] na ordem fixa, sem grupos vazios.
 * Tarefas em `foco` recebem `atraso_dias`? Não: o atraso aparece só no grupo Hoje.
 * Tarefas em `esperando` recebem `dias` desde estado_desde.
 */
export function agrupar(tarefas, hoje) {
  const h = normalizarData(hoje) || hojeSP();
  const amanha = somarDias(h, 1);
  const domingo = domingoDaSemana(h);
  const lista = Array.isArray(tarefas) ? tarefas : [];

  const grupos = {
    foco: [],
    hoje: [],
    amanha: [],
    semana: [],
    depois: [],
    sem_data: [],
    esperando: [],
    feitas_hoje: [],
  };

  const abertas = lista.filter((t) => t && t.estado === 'aberta');
  const usadas = new Set();

  // Foco: no máximo 3 abertas com foco.
  const comFoco = abertas.filter((t) => t.foco === true).sort(compararTarefas);
  for (const t of comFoco.slice(0, 3)) {
    grupos.foco.push({ ...t, subtarefas: subtarefasDe(t) });
    usadas.add(t.id);
  }

  for (const t of abertas) {
    if (usadas.has(t.id)) continue;
    const tarefa = { ...t, subtarefas: subtarefasDe(t) };
    const quando = normalizarData(t.quando);
    if (!quando) {
      grupos.sem_data.push(tarefa);
    } else if (quando <= h) {
      tarefa.atraso_dias = diferencaDias(h, quando);
      grupos.hoje.push(tarefa);
    } else if (quando === amanha) {
      grupos.amanha.push(tarefa);
    } else if (domingo && quando <= domingo) {
      grupos.semana.push(tarefa);
    } else {
      grupos.depois.push(tarefa);
    }
  }

  for (const t of lista) {
    if (!t || t.estado !== 'esperando') continue;
    const desde =
      dataSP(t.estado_desde) || dataSP(t.atualizada_em) || dataSP(t.criada_em);
    const dias = desde ? Math.max(0, diferencaDias(h, desde) || 0) : 0;
    grupos.esperando.push({ ...t, dias, subtarefas: subtarefasDe(t) });
  }

  for (const t of lista) {
    if (!t || t.estado !== 'feita') continue;
    const feita = dataSP(t.feita_em);
    if (feita === h) {
      grupos.feitas_hoje.push({ ...t, subtarefas: subtarefasDe(t) });
    }
  }

  const ordem = [
    'foco',
    'hoje',
    'amanha',
    'semana',
    'depois',
    'sem_data',
    'esperando',
    'feitas_hoje',
  ];

  return ordem
    .map((chave) => {
      grupos[chave].sort(compararTarefas);
      return {
        chave,
        titulo: TITULOS_GRUPO[chave],
        tarefas: grupos[chave],
      };
    })
    .filter((g) => g.tarefas.length > 0);
}

// ---------------------------------------------------------------------------
// Utilitários de apresentação

/** 'hoje' | 'amanhã' | 'sex' | '30/10' */
export function rotuloData(data, hoje) {
  const d = normalizarData(data);
  if (!d) return '';
  const h = normalizarData(hoje) || hojeSP();
  const dif = diferencaDias(d, h);
  if (dif === 0) return 'hoje';
  if (dif === 1) return 'amanhã';
  if (dif >= 2 && dif <= 6) return DIAS_SEMANA[diaSemana(d)];
  return rotuloDiaMes(d);
}

export function progresso(subtarefas) {
  const lista = Array.isArray(subtarefas) ? subtarefas : [];
  const feitas = lista.filter((s) => s && s.feita === true).length;
  return { feitas, total: lista.length };
}

/** Host de um link http(s), sem 'www.'. '' quando não é link seguro. */
export function dominio(link) {
  if (!link || typeof link !== 'string') return '';
  try {
    const url = new URL(link.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.hostname.replace(/^www\./i, '');
  } catch {
    return '';
  }
}

/** Texto sem acento e minúsculo, para busca. */
export function semAcento(texto) {
  if (texto == null) return '';
  return String(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}
