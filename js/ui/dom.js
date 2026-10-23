// Pequenos utilitários de DOM. Nunca usa innerHTML com dados.

export function h(tag, atributos = {}, filhos = []) {
  const no = document.createElement(tag);
  for (const [chave, valor] of Object.entries(atributos || {})) {
    if (valor == null || valor === false) continue;
    if (chave === 'class') {
      no.className = valor;
    } else if (chave === 'text') {
      no.textContent = valor;
    } else if (chave === 'dataset') {
      Object.assign(no.dataset, valor);
    } else if (chave === 'value' || chave === 'checked') {
      no[chave] = valor;
    } else if (chave === 'hidden') {
      no.hidden = Boolean(valor);
    } else if (chave.startsWith('on') && typeof valor === 'function') {
      no.addEventListener(chave.slice(2).toLowerCase(), valor);
    } else {
      no.setAttribute(chave, valor === true ? '' : String(valor));
    }
  }
  const lista = Array.isArray(filhos) ? filhos : [filhos];
  for (const filho of lista) {
    if (filho == null || filho === false) continue;
    if (typeof filho === 'string' || typeof filho === 'number') {
      no.appendChild(document.createTextNode(String(filho)));
    } else {
      no.appendChild(filho);
    }
  }
  return no;
}

export function limpar(no) {
  while (no.firstChild) no.removeChild(no.firstChild);
}

// Detalhes e Ajustes travam a rolagem da página. A contagem evita que fechar
// um painel destrave a página enquanto o outro ainda está aberto.
let paineisAbertos = 0;

export function travarPainel() {
  paineisAbertos += 1;
  document.body.classList.add('painel-aberto');
}

export function liberarPainel() {
  paineisAbertos = Math.max(0, paineisAbertos - 1);
  if (!paineisAbertos) document.body.classList.remove('painel-aberto');
}

export function rotuloArea(area) {
  if (area === 'lapig') return 'LAPIG';
  if (!area) return 'Pessoal';
  return area.charAt(0).toUpperCase() + area.slice(1);
}
