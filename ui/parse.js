'use strict';
/* Leitura de arquivos de banco: OFX, CSV e planilhas. Sem dependência do resto do app, para poder ser testado sozinho. */
const Parse = (() => {
  const pad = n => String(n).padStart(2, '0');
  const iso = (y, m, d) => (y >= 1990 && y < 2100 && m >= 1 && m <= 12 && d >= 1 && d <= 31) ? `${y}-${pad(m)}-${pad(d)}` : null;

  function decode(buf) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
    catch (e) { return new TextDecoder('windows-1252').decode(buf); }
  }

  // Aceita 1.234,56 · 1,234.56 · 1234.56 · -R$ 10,00 · (10,00) · 10,00-
  function num(v) {
    if (typeof v === 'number') return isFinite(v) ? v : NaN;
    if (v == null || v instanceof Date) return NaN;
    let s = String(v).trim().replace(/−/g, '-');
    if (!s) return NaN;
    const neg = /^\(.*\)$/.test(s) || s.includes('-');
    s = s.replace(/[R$\s ()+-]/g, '');
    if (!/^[\d.,]+$/.test(s) || !/\d/.test(s)) return NaN;
    const lc = s.lastIndexOf(','), ld = s.lastIndexOf('.');
    if (lc > -1 && ld > -1) s = lc > ld ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
    else if (lc > -1) s = (s.match(/,/g).length === 1) ? s.replace(',', '.') : s.replace(/,/g, '');
    else if (ld > -1 && ((s.match(/\./g).length > 1) || /^\d{1,3}\.\d{3}$/.test(s))) s = s.replace(/\./g, '');
    const n = parseFloat(s);
    return isFinite(n) ? (neg ? -n : n) : NaN;
  }

  function date(v, anoPadrao) {
    if (v instanceof Date && !isNaN(v)) { const d = new Date(v.getTime() + 6 * 3600e3); return iso(d.getFullYear(), d.getMonth() + 1, d.getDate()); }
    if (v == null || typeof v === 'number') return null;
    const s = String(v).trim();
    let m = s.match(/^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/);
    if (m) return iso(+m[1], +m[2], +m[3]);
    m = s.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})(?!\d)/);
    if (m) return iso(m[3].length === 2 ? 2000 + +m[3] : +m[3], +m[2], +m[1]);
    m = s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m && anoPadrao) return iso(anoPadrao, +m[2], +m[1]);
    return null;
  }

  function csv(text) {
    text = text.replace(/^﻿/, '');
    const head = text.split(/\r?\n/).slice(0, 8).join('\n');
    const cnt = ch => (head.match(new RegExp(ch === '\t' ? '\t' : '\\' + ch, 'g')) || []).length;
    const sep = [';', '\t', ','].sort((a, b) => cnt(b) - cnt(a))[0];
    const rows = []; let row = [], cur = '', q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
      else if (c === '"' && cur === '') q = true;
      else if (c === sep) { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; rows.push(row); row = []; }
      else cur += c;
    }
    if (cur !== '' || row.length) { row.push(cur); rows.push(row); }
    return rows.map(r => r.map(c => c.trim())).filter(r => r.some(c => c !== ''));
  }

  function ofx(text) {
    const out = [];
    const blocks = text.split(/<STMTTRN>/i).slice(1);
    const tag = (b, t) => { const m = b.match(new RegExp('<' + t + '>([^<\\r\\n]*)', 'i')); return m ? m[1].trim() : ''; };
    for (let b of blocks) {
      b = b.split(/<\/STMTTRN>|<\/BANKTRANLIST>/i)[0];
      const d = tag(b, 'DTPOSTED'), valor = parseFloat(tag(b, 'TRNAMT').replace(',', '.'));
      const data = iso(+d.slice(0, 4), +d.slice(4, 6), +d.slice(6, 8));
      if (!data || !isFinite(valor)) continue;
      const desc = [tag(b, 'MEMO'), tag(b, 'NAME')].filter((x, i, a) => x && a.indexOf(x) === i).join(' · ') || tag(b, 'TRNTYPE') || 'Sem descrição';
      out.push({ data, desc, valor: Math.round(valor * 100) / 100, fitid: tag(b, 'FITID') });
    }
    return out;
  }

  // Devolve {header:[nomes], rows:[[...]]} separando a linha de cabeçalho quando existir.
  function table(rows) {
    if (!rows.length) return { header: [], rows: [] };
    const width = Math.max(...rows.slice(0, 50).map(r => r.length));
    // pula linhas de título soltas no topo (menos de 2 células preenchidas)
    let start = 0;
    while (start < rows.length - 1 && rows[start].filter(c => c !== '' && c != null).length < 2) start++;
    const first = rows[start];
    const isHeader = first.every(c => c == null || c === '' || (typeof c === 'string' && date(c) === null && isNaN(num(c))));
    const header = Array.from({ length: width }, (_, i) => isHeader && first[i] ? String(first[i]) : 'Coluna ' + (i + 1));
    return { header, rows: rows.slice(isHeader ? start + 1 : start) };
  }

  const norm = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function guess(t) {
    const h = t.header.map(norm), sample = t.rows.slice(0, 40);
    const find = re => h.findIndex(x => re.test(x));
    const share = (i, fn) => sample.length ? sample.filter(r => fn(r[i])).length / sample.length : 0;
    let data = find(/^(data|date|dt)\b|data/), valor = find(/valor|amount|montante|quantia|preco/), desc = find(/descri|histor|lancamento|title|titulo|estabelec|memo|nome|conta|item|despesa/);
    const dia = find(/\bdia\b|venc/), quem = find(/quem|pagador|respons|pessoa/);
    if (data < 0) data = h.findIndex((_, i) => share(i, v => date(v) !== null) > .6);
    if (valor < 0) for (let i = h.length - 1; i >= 0; i--) if (i !== data && share(i, v => !isNaN(num(v))) > .6) { valor = i; break; }
    if (desc < 0) { let best = -1, len = 0; h.forEach((_, i) => { if (i === data || i === valor) return; const l = sample.reduce((s, r) => s + (typeof r[i] === 'string' && isNaN(num(r[i])) ? r[i].length : 0), 0); if (l > len) { len = l; best = i; } }); desc = best; }
    return { data, desc, valor, dia, quem };
  }

  // Compra parcelada na descrição da fatura: "Parcela 2/10", "PARC 02 DE 10", "LOJA 03/12".
  function parcela(desc) {
    const d = String(desc || '');
    const m = d.match(/[-–(\s]*parc(?:ela)?s?\.?\s*(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})\)?/i) || d.match(/[-–(\s]*\b(\d{1,2})\s+de\s+(\d{1,2})\b\)?/i) || d.match(/[-–(\s]+(\d{1,2})\s*\/\s*(\d{1,2})\)?\s*$/);
    if (!m) return null;
    const k = +m[1], n = +m[2];
    if (!(n >= 2 && n <= 72 && k >= 1 && k <= n)) return null;
    const base = (d.slice(0, m.index) + ' ' + d.slice(m.index + m[0].length)).replace(/\s+/g, ' ').replace(/[\s\-–]+$/, '').trim();
    return { k, n, base: base || d };
  }

  return { decode, num, date, csv, ofx, table, guess, norm, parcela };
})();
if (typeof module !== 'undefined') module.exports = Parse;
