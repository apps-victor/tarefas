// Interpreta uma frase livre de tarefa, em português.
// Puro (sem DOM, sem rede): usado pelo PWA e pelo MCP.
//
//   interpretar('lavar banheiro sáb 7h #casa toda semana', '2026-10-22')
//   → { titulo: 'lavar banheiro', area: 'casa', quando: '2026-10-24',
//       hora: '07:00', repetir: {freq:'semanal',intervalo:1,dias_semana:[6]},
//       foco: false, avisos: [] }

import {
  CAIXAS_PADRAO,
  DIAS_SEMANA,
  diaSemana,
  diasNoMes,
  diferencaDias,
  primeiraCaixa,
  primeiraOcorrencia,
  formatarISO,
  hojeSP,
  normalizarData,
  resolverCaixaPorPalavra,
  somarDias,
} from './logica.js';

const ACENTOS = {
  á: 'a',
  à: 'a',
  â: 'a',
  ã: 'a',
  ä: 'a',
  å: 'a',
  é: 'e',
  è: 'e',
  ê: 'e',
  ë: 'e',
  í: 'i',
  ì: 'i',
  î: 'i',
  ï: 'i',
  ó: 'o',
  ò: 'o',
  ô: 'o',
  õ: 'o',
  ö: 'o',
  ú: 'u',
  ù: 'u',
  û: 'u',
  ü: 'u',
  ç: 'c',
  ñ: 'n',
  ý: 'y',
  ÿ: 'y',
};

const NUMEROS_DIA = {
  domingo: 0,
  segunda: 1,
  terca: 2,
  quarta: 3,
  quinta: 4,
  sexta: 5,
  sabado: 6,
};

const NUMEROS_ABREV = {
  dom: 0,
  seg: 1,
  ter: 2,
  qua: 3,
  qui: 4,
  sex: 5,
  sab: 6,
};

/**
 * Minúsculas e sem acento, mantendo um caractere por caractere original
 * (para que os índices dos trechos encontrados valham no texto original).
 */
function normalizar(texto) {
  let saida = '';
  for (let i = 0; i < texto.length; i += 1) {
    const baixo = texto[i].toLowerCase();
    const um = baixo.length === 1 ? baixo : texto[i];
    saida += ACENTOS[um] || um;
  }
  return saida;
}

function doisDigitos(n) {
  return String(n).padStart(2, '0');
}

function montarISO(ano, mes, dia) {
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (
    d.getUTCFullYear() !== ano ||
    d.getUTCMonth() !== mes - 1 ||
    d.getUTCDate() !== dia
  ) {
    return null;
  }
  return formatarISO(d);
}

function proximoDiaSemana(alvo, hoje) {
  const atual = diaSemana(hoje);
  const falta = (alvo - atual + 7) % 7;
  return somarDias(hoje, falta);
}

/**
 * @param {string} texto
 * @param {string} hoje data local no formato 'AAAA-MM-DD'
 * @param {Array<{chave,nome,tinta,ordem,fixa}>} [caixas] caixas do dono; sem
 *   elas, usa as 5 de hoje (compatibilidade com chamadas antigas).
 */
export function interpretar(texto, hoje, caixas) {
  const original = typeof texto === 'string' ? texto : '';
  const normal = normalizar(original);
  const h = normalizarData(hoje) || hojeSP();
  const listaCaixas =
    Array.isArray(caixas) && caixas.length ? caixas : CAIXAS_PADRAO;

  const consumido = new Array(original.length).fill(false);
  const trechos = {};
  const avisos = [];

  const livre = (ini, fim) => {
    for (let i = ini; i < fim; i += 1) if (consumido[i]) return false;
    return true;
  };
  const marcar = (ini, fim) => {
    for (let i = ini; i < fim; i += 1) consumido[i] = true;
  };
  const varrer = (regex, aoAchar) => {
    regex.lastIndex = 0;
    let m = regex.exec(normal);
    while (m !== null) {
      if (m[0].length === 0) {
        regex.lastIndex += 1;
      } else {
        const ini = m.index;
        const fim = ini + m[0].length;
        if (livre(ini, fim)) {
          marcar(ini, fim);
          aoAchar(m, ini, fim);
        }
      }
      m = regex.exec(normal);
    }
  };
  const aviso = (textoAviso) => {
    if (!avisos.includes(textoAviso)) avisos.push(textoAviso);
  };

  // ------------------------------------------------------------------ foco
  let foco = false;
  for (let i = 0; i < normal.length; i += 1) {
    if (normal[i] !== '!') continue;
    const antesOk = i === 0 || /\s/.test(normal[i - 1]);
    const depoisOk = i === normal.length - 1 || /\s/.test(normal[i + 1]);
    if (antesOk && depoisOk && livre(i, i + 1)) {
      foco = true;
      marcar(i, i + 1);
      if (!trechos.foco) trechos.foco = [i, i + 1];
    }
  }

  // ------------------------------------------------------------------ área
  let area = null;
  const areas = [];
  const reArea = /#([a-z0-9_]+)/g;
  let achadoArea = reArea.exec(normal);
  while (achadoArea !== null) {
    const ini = achadoArea.index;
    const fim = ini + achadoArea[0].length;
    if (livre(ini, fim)) {
      const achado = resolverCaixaPorPalavra(listaCaixas, achadoArea[1]);
      if (achado.caixa) {
        marcar(ini, fim);
        areas.push({
          area: achado.caixa.chave,
          nome: achado.caixa.nome,
          ini,
          fim,
        });
      } else if (achado.ambigua) {
        aviso(
          `caixa ambígua: mais de uma caixa começa com "${achadoArea[1]}"; use o nome completo ou a chave`,
        );
      }
    }
    achadoArea = reArea.exec(normal);
  }
  if (areas.length) {
    area = areas[0].area;
    trechos.area = [areas[0].ini, areas[0].fim];
    if (areas.length > 1) {
      aviso(`mais de uma área; usei ${areas[0].nome}`);
    }
  }
  if (!area) area = primeiraCaixa(listaCaixas).chave;

  // -------------------------------------------------------------- repetição
  const padroesRepetir = [
    {
      re: /\btodo\s+dia\s+(\d{1,2})\b/g,
      valor: (m) => ({
        freq: 'mensal',
        intervalo: 1,
        dia_mes: Number(m[1]),
      }),
    },
    {
      re: /\btodo\s+dia\b/g,
      valor: () => ({ freq: 'diaria', intervalo: 1 }),
    },
    {
      re: /\bdiariamente\b/g,
      valor: () => ({ freq: 'diaria', intervalo: 1 }),
    },
    {
      re: /\btoda\s+semana\b/g,
      valor: () => ({ freq: 'semanal', intervalo: 1 }),
    },
    {
      re: /\bsemanalmente\b/g,
      valor: () => ({ freq: 'semanal', intervalo: 1 }),
    },
    {
      re: /\btoda\s+(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:\s*-?\s*feira)?\b/g,
      valor: (m) => ({
        freq: 'semanal',
        intervalo: 1,
        dias_semana: [NUMEROS_DIA[m[1]]],
      }),
    },
    {
      re: /\btoda\s+(dom|seg|ter|qua|qui|sex|sab)\b/g,
      valor: (m) => ({
        freq: 'semanal',
        intervalo: 1,
        dias_semana: [NUMEROS_ABREV[m[1]]],
      }),
    },
    {
      re: /\btodo\s+mes\b/g,
      valor: () => ({ freq: 'mensal', intervalo: 1 }),
    },
    {
      re: /\bmensalmente\b/g,
      valor: () => ({ freq: 'mensal', intervalo: 1 }),
    },
  ];

  const repeticoesAchadas = [];
  for (const padrao of padroesRepetir) {
    varrer(padrao.re, (m, ini, fim) => {
      repeticoesAchadas.push({
        valor: padrao.valor(m),
        ini,
        fim,
        trecho: original.slice(ini, fim),
      });
    });
  }
  repeticoesAchadas.sort((a, b) => a.ini - b.ini);
  let repetir = repeticoesAchadas.length ? repeticoesAchadas[0].valor : null;
  if (repeticoesAchadas.length) {
    trechos.repetir = [repeticoesAchadas[0].ini, repeticoesAchadas[0].fim];
    if (repeticoesAchadas.length > 1) {
      aviso('mais de uma repetição; usei a primeira');
    }
  }

  // ------------------------------------------------------------------ data
  const datas = [];

  const dataDeTexto = (iso, ini, fim) => {
    if (iso) {
      datas.push({ iso, ini, fim, trecho: original.slice(ini, fim) });
    }
  };

  varrer(/\bdepois\s+de\s+amanha\b/g, (m, ini, fim) => {
    dataDeTexto(somarDias(h, 2), ini, fim);
  });
  varrer(/\bamanha\b/g, (m, ini, fim) => {
    dataDeTexto(somarDias(h, 1), ini, fim);
  });
  varrer(/\bhoje\b/g, (m, ini, fim) => {
    dataDeTexto(h, ini, fim);
  });
  varrer(
    /\b(segunda|terca|quarta|quinta|sexta|sabado|domingo)(?:\s*-?\s*feira)?\b/g,
    (m, ini, fim) => {
      dataDeTexto(proximoDiaSemana(NUMEROS_DIA[m[1]], h), ini, fim);
    },
  );
  varrer(/\b(dom|seg|ter|qua|qui|sex|sab)\b/g, (m, ini, fim) => {
    dataDeTexto(proximoDiaSemana(NUMEROS_ABREV[m[1]], h), ini, fim);
  });

  // dd/mm e dd/mm/aaaa
  varrer(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/g, (m, ini, fim) => {
    const dia = Number(m[1]);
    const mes = Number(m[2]);
    const anoTexto = m[3];
    const trecho = original.slice(ini, fim);
    if (anoTexto) {
      const iso = montarISO(Number(anoTexto), mes, dia);
      if (!iso) {
        aviso(`data inválida: ${trecho}`);
        return;
      }
      dataDeTexto(iso, ini, fim);
      return;
    }
    if (dia < 1 || dia > 31 || mes < 1 || mes > 12) {
      aviso(`data inválida: ${trecho}`);
      return;
    }
    const anoAtual = Number(h.slice(0, 4));
    const noAnoAtual = montarISO(anoAtual, mes, dia);
    if (noAnoAtual) {
      if (noAnoAtual >= h) {
        dataDeTexto(noAnoAtual, ini, fim);
        return;
      }
      // Data recente que já passou continua no ano corrente: é uma tarefa
      // atrasada, não uma tarefa do ano que vem. Só pula o ano quando o dia
      // passou há mais de 180 dias.
      const passou = diferencaDias(h, noAnoAtual);
      if (passou !== null && passou <= 180) {
        dataDeTexto(noAnoAtual, ini, fim);
        return;
      }
    }
    for (let k = 1; k <= 8; k += 1) {
      const iso = montarISO(anoAtual + k, mes, dia);
      if (iso) {
        dataDeTexto(iso, ini, fim);
        return;
      }
    }
    aviso(`data inválida: ${trecho}`);
  });

  // dia N
  varrer(/\bdia\s+(\d{1,2})\b/g, (m, ini, fim) => {
    const dia = Number(m[1]);
    const trecho = original.slice(ini, fim);
    if (dia < 1 || dia > 31) {
      aviso(`data inválida: ${trecho}`);
      return;
    }
    let ano = Number(h.slice(0, 4));
    let mes = Number(h.slice(5, 7));
    for (let k = 0; k < 40; k += 1) {
      if (dia <= diasNoMes(ano, mes)) {
        const iso = montarISO(ano, mes, dia);
        if (iso && iso >= h) {
          dataDeTexto(iso, ini, fim);
          return;
        }
      }
      mes += 1;
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
    }
    aviso(`data inválida: ${trecho}`);
  });

  datas.sort((a, b) => a.ini - b.ini);
  let quando = null;
  if (datas.length) {
    quando = datas[0].iso;
    trechos.data = [datas[0].ini, datas[0].fim];
    if (datas.length > 1) {
      const lista = datas.map((d) => d.trecho).join(', ');
      aviso(`mais de uma data (${lista}); usei ${datas[0].trecho}`);
    }
  }

  // ------------------------------------------------------------------ hora
  const horas = [];
  const registrarHora = (m, ini, fim, hh, mm) => {
    const H = Number(hh);
    const M = Number(mm || 0);
    const trecho = original.slice(ini, fim);
    if (H > 23 || M > 59) {
      aviso(`hora inválida: ${trecho}`);
      return;
    }
    horas.push({ hora: `${doisDigitos(H)}:${doisDigitos(M)}`, ini, fim });
  };

  varrer(
    /\b(?:as\s+)?(\d{1,2})(?::(\d{2})|h(\d{2})?)\b(?!\s*horas?\b)/g,
    (m, ini, fim) => {
      registrarHora(m, ini, fim, m[1], m[2] !== undefined ? m[2] : m[3]);
    },
  );
  varrer(/\bas\s+(\d{1,2})\b(?!\s*horas?\b)/g, (m, ini, fim) => {
    registrarHora(m, ini, fim, m[1], 0);
  });

  horas.sort((a, b) => a.ini - b.ini);
  let hora = null;
  if (horas.length) {
    hora = horas[0].hora;
    trechos.hora = [horas[0].ini, horas[0].fim];
    if (horas.length > 1) {
      aviso('mais de uma hora; usei a primeira');
    }
  }

  // ----------------------------------------------- repetição + data juntas
  if (repetir) {
    if (repetir.freq === 'semanal') {
      if (repetir.dias_semana && repetir.dias_semana.length) {
        const alvo = repetir.dias_semana[0];
        if (quando) {
          if (diaSemana(quando) !== alvo) {
            aviso(
              `a data não cai em ${DIAS_SEMANA[alvo]}; usei a próxima ${DIAS_SEMANA[alvo]}`,
            );
            quando = proximoDiaSemana(alvo, h);
          }
        } else {
          quando = proximoDiaSemana(alvo, h);
        }
      } else {
        const base = quando || h;
        repetir = { ...repetir, dias_semana: [diaSemana(base)] };
        quando = base;
      }
    } else if (repetir.freq === 'mensal') {
      if (!repetir.dia_mes) {
        repetir = {
          ...repetir,
          dia_mes: quando ? Number(quando.slice(8, 10)) : Number(h.slice(8, 10)),
        };
      }
      if (
        quando &&
        Number(quando.slice(8, 10)) !== Number(repetir.dia_mes)
      ) {
        aviso(
          `a data não cai no dia ${repetir.dia_mes}; usei o próximo dia ${repetir.dia_mes}`,
        );
        quando = primeiraOcorrencia(repetir, h);
      }
      if (!quando) quando = primeiraOcorrencia(repetir, h);
    } else if (!quando) {
      quando = h;
    }
  }

  // ----------------------------------------------------------------- título
  let titulo = '';
  for (let i = 0; i < original.length; i += 1) {
    if (!consumido[i]) titulo += original[i];
  }
  titulo = titulo
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[,;:\-–—\s]+|[,;:\-–—\s]+$/g, '')
    .trim();
  if (!titulo) aviso('sem título');

  return {
    titulo,
    area,
    quando,
    hora,
    repetir,
    foco,
    avisos,
    // Índices dos pedaços reconhecidos no texto original (a interface usa
    // para remover uma ficha quando o usuário toca nela).
    trechos,
  };
}
