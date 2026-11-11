'use strict';
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const nf = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = v => (v < 0 ? '− ' : '') + 'R$ ' + nf.format(Math.abs(v));
const big = (v, cls) => { const [i, c] = nf.format(Math.abs(v)).split(','); return `<div class="big ${cls}">${v < 0 ? '−' : ''}<span class="cur">R$</span> ${i}<span class="ct">,${c}</span></div>`; };
const pct = v => Math.round(v * 100) + '%';
const pct1 = v => nf.format(v).replace(/,(\d)\d$/, ',$1') + '%';
const r2 = v => Math.round(v * 100) / 100;
const sum = l => r2(l.reduce((s, x) => s + (+x.valor || 0), 0));
const money = v => v ? nf.format(v).replace(/\./g, '') : '';
const inMoney = s => { s = String(s).trim(); if (!s) return 0; const n = Parse.num(s); return n >= 0 ? r2(n) : NaN; };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const ls = { get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }, set(k, v) { try { localStorage.setItem(k, v); } catch (e) { } } };
const ymAdd = (ym, n) => { let [y, m] = ym.split('-').map(Number); m += n; while (m < 1) { m += 12; y--; } while (m > 12) { m -= 12; y++; } return y + '-' + String(m).padStart(2, '0'); };
const ymDiff = (a, b) => (+b.slice(0, 4) - +a.slice(0, 4)) * 12 + (+b.slice(5) - +a.slice(5));
const ymCurto = ym => MESES[+ym.slice(5) - 1].slice(0, 3).toLowerCase() + '/' + ym.slice(0, 4);
const ymNome = ym => MESES[+ym.slice(5) - 1].toLowerCase();
const dm = iso => iso.slice(8) + '/' + iso.slice(5, 7);

// Fora do programa instalado (aberto direto no navegador), guarda no próprio navegador.
const store = window.api || (() => { const K = 'casa-em-dia'; return { status: async () => ({ path: 'navegador' }), pick: async () => ({ path: 'navegador' }), load: async () => ({ path: 'navegador', json: ls.get(K) }), save: async j => ls.set(K, j), reveal: async () => { }, onChanged() { } }; })();

const vazio = () => ({ v: 1, config: null, contas: {}, cartoes: {}, lanc: {}, fatManual: {}, meses: {}, reservas: {}, financ: {}, extras: {} });
const norm = d => ({ ...vazio(), ...(d && typeof d === 'object' && !Array.isArray(d) ? d : {}) });
let D = vazio();

const now = new Date();
const S = { ym: now.getFullYear() + '-' + String(now.getMonth() + 1).padStart(2, '0'), view: 'visao', eu: ls.get('eu') === 'b' ? 'b' : 'a', path: null, ready: false, loadErr: null, dia: null, mor: 'eu', fluxo: 'todos', editing: null, confirm: null };
const DEF = { nomes: { a: 'Pessoa 1', b: 'Pessoa 2' }, salarios: { a: 0, b: 0 }, diaadia: { a: 0, b: 0 }, divisao: 'proporcional', pctA: 50 };
const cfg = () => { const c = D.config || {}; return { ...DEF, ...c, nomes: { ...DEF.nomes, ...c.nomes }, salarios: { ...DEF.salarios, ...c.salarios }, diaadia: { ...DEF.diaadia, ...c.diaadia } }; };
const outro = k => k === 'a' ? 'b' : 'a';

/* ---------- cálculo ---------- */
function faturaTotal(cid, ym) {
  const m = (D.fatManual[cid] || {})[ym]; if (m != null) return m;
  let t = 0; for (const l of Object.values(D.lanc)) if (l.cartao === cid && l.fatura === ym) t -= l.valor;
  return r2(Math.max(0, t));
}
function bills(ym) {
  const l = Object.entries(D.contas).map(([id, x]) => ({ ...x, id, nome: String(x.nome || 'Sem nome'), valor: +x.valor || 0 })).filter(x => x.recorrente ? (!x.inicio || x.inicio <= ym) && (!x.fim || ym <= x.fim) : x.mes === ym).map(x => x.inicio && x.fim ? { ...x, parc: ymDiff(x.inicio, ym) + 1, parcN: ymDiff(x.inicio, x.fim) + 1 } : x);
  for (const [id, c] of Object.entries(D.cartoes)) { const v = faturaTotal(id, ym); if (v > 0) l.push({ id: 'fat-' + id, nome: 'Fatura ' + c.nome, valor: v, dia: c.dia, tipo: c.tipo, pagador: c.dono, moradia: false, fatura: id, div: c.div, pctA: c.pctA }); }
  for (const [id, f] of Object.entries(D.financ)) { if (f.gerar === false) continue; const pm = parcelaFin(f, ym); if (pm) l.push({ id: 'fin-' + id, nome: f.nome, valor: pm.valor, dia: +f.dia || 0, tipo: f.tipo || 'casa', pagador: f.pagador || 'a', moradia: !!f.moradia, div: f.div || 'igual', pctA: null, fin: id, recorrente: true, parc: pm.parc, parcN: pm.parcN }); }
  return l.sort((x, y) => (x.dia || 99) - (y.dia || 99) || x.nome.localeCompare(y.nome));
}
function calc(ym = S.ym) {
  const c = cfg(), list = bills(ym), casa = list.filter(x => x.tipo === 'casa'), T = sum(casa), sA = +c.salarios.a || 0, sB = +c.salarios.b || 0;
  const rA = c.divisao === 'igual' ? .5 : c.divisao === 'custom' ? Math.min(100, Math.max(0, +c.pctA || 0)) / 100 : (sA + sB > 0 ? sA / (sA + sB) : .5);
  // Cada conta pode ter a sua divisão; sem escolha, vale a divisão do casal.
  const fracA = x => x.div === 'igual' ? .5 : x.div === 'pct' ? Math.min(100, Math.max(0, +x.pctA || 0)) / 100 : rA;
  const parte = (x, p) => { const a = r2(x.valor * fracA(x)); return p === 'a' ? a : r2(x.valor - a); };
  const pago = { a: sum(casa.filter(x => x.pagador === 'a')), b: sum(casa.filter(x => x.pagador === 'b')) };
  const dA = r2(casa.reduce((t, x) => t + parte(x, 'a'), 0)), devido = { a: dA, b: r2(T - dA) }, ef = T ? dA / T : rA;
  const pessoal = { a: sum(list.filter(x => x.tipo === 'pessoal' && x.pagador === 'a')), b: sum(list.filter(x => x.tipo === 'pessoal' && x.pagador === 'b')) };
  const rs = Object.values(D.reservas), reserva = { a: r2(rs.reduce((t, x) => t + (+(x.aporte || {}).a || 0), 0)), b: r2(rs.reduce((t, x) => t + (+(x.aporte || {}).b || 0), 0)) };
  const mes = D.meses[ym] || {};
  const ex = Object.values(D.extras).filter(x => x.mes === ym), extra = { a: sum(ex.filter(x => x.pessoa === 'a')), b: sum(ex.filter(x => x.pessoa === 'b')) };
  return { extra, reserva, c, list, casa, T, ratio: { a: ef, b: 1 - ef }, fracA, parte, pago, devido, pessoal, pagas: mes.pagas || {}, acerto: !!mes.acerto };
}
const divLbl = (x, k) => x.div === 'igual' ? 'meio a meio' : x.div === 'pct' ? `${Math.round(k.fracA(x) * 100)}% / ${100 - Math.round(k.fracA(x) * 100)}%` : 'divisão do casal';

/* ---------- telas ---------- */
function plastic(id, c, extra) {
  const tot = faturaTotal(id, S.ym), livre = (+c.limite || 0) - tot, m = +S.ym.slice(5);
  return `<button class="plastic cor-${esc(c.cor || 'grafite')} ${extra || ''}" data-go="cartoes" aria-label="Cartão ${esc(c.nome)}">
    <div class="pn">${esc(c.nome)}<span>${c.tipo === 'casa' ? 'Da casa' : esc(cfg().nomes[c.dono])}</span></div><div class="chipc"></div>
    <div class="pf"><div><small>Vence</small><b>${String(c.dia || 1).padStart(2, '0')}/${String(m).padStart(2, '0')}</b></div><div><small>Limite livre</small><b>${c.limite ? brl(livre) : '—'}</b></div></div></button>`;
}

function vVisao() {
  const k = calc(), { c } = k, eu = S.eu, ou = outro(eu), sal0 = +c.salarios[eu] || 0, ext = k.extra[eu], sal = r2(sal0 + ext), dd = +c.diaadia[eu] || 0;
  const res = k.reserva[eu], sobra = r2(sal - k.devido[eu] - k.pessoal[eu] - dd - res);
  const base0 = Math.max(sal, k.devido[eu] + k.pessoal[eu] + dd + res), p = v => sal > 0 ? v / sal : 0, w = v => base0 > 0 ? Math.max(0, v / base0 * 100) : 0;
  const minhas = k.list.filter(x => x.tipo === 'casa' || x.pagador === eu), abertas = minhas.filter(x => !k.pagas[x.id]);
  const dias = [...new Set(minhas.map(x => x.dia).filter(Boolean))].sort((a, b) => a - b);
  if (S.dia && !dias.includes(S.dia)) S.dia = null;
  const vis = S.dia ? minhas.filter(x => x.dia === S.dia) : minhas;
  const d = r2(k.devido.a - k.pago.a); let acerto = '';
  if (k.T && Math.abs(d) < .01) acerto = `<span>As contas pagas já batem com a divisão. Ninguém deve nada.</span>`;
  else if (k.T) { const deve = d > 0 ? 'a' : 'b', v = Math.abs(d);
    acerto = `<span>${deve === eu ? `Você devolve <b>${brl(v)}</b> para ${esc(c.nomes[ou])} no Pix` : `${esc(c.nomes[deve])} te devolve <b>${brl(v)}</b> no Pix`}</span><button class="btn sm ${k.acerto ? '' : 'ghost'}" data-act="acerto">${k.acerto ? '✓ Feito' : 'Marcar feito'}</button>`; }
  const pa = k.T ? k.pago.a / k.T * 100 : 50;
  const mor = k.casa.filter(x => x.moradia), morT = sum(mor), casal = S.mor === 'casal';
  const base = casal ? (+c.salarios.a || 0) + (+c.salarios.b || 0) : sal0, morV = casal ? morT : r2(mor.reduce((t, x) => t + k.parte(x, eu), 0)), mp = base > 0 ? morV / base : 0;
  const cards = Object.entries(D.cartoes), prox = [0, 1, 2].map(n => { const ym = ymAdd(S.ym, n); return { ym, v: r2(cards.reduce((s, [id]) => s + faturaTotal(id, ym), 0)) }; }), mx = Math.max(1, ...prox.map(x => x.v));

  return `${D.config ? '' : `<div class="banner">Comece em <b>Nossa renda</b>: coloque os nomes e os salários de vocês. Depois adicione as contas ou importe uma planilha.</div>`}
  <div class="grid"><div class="col">
    <section class="card">
      <h2>Saldo previsto <small>· ${esc(c.nomes[eu])}</small></h2>
      <div class="hero">${big(sobra, 'xl')}
        <div class="note">${sal > 0 ? `<div class="${sobra >= 0 ? 'good' : 'badc'}">${sobra >= 0 ? '↗' : '↘'} ${pct(p(sobra))} ${ext > 0 ? 'da renda do mês' : 'do salário'} ${sobra >= 0 ? 'livre' : 'no vermelho'}</div>` : `<div class="badc">Informe os salários em Nossa renda</div>`}
        <div class="sub">valor estimado depois de pagar as contas e guardar a reserva do mês</div></div></div>
      <div class="bar" role="img" aria-label="Para onde vai o salário"><i style="width:${w(k.devido[eu])}%;background:var(--navy)"></i><i style="width:${w(k.pessoal[eu])}%;background:var(--accent)"></i><i style="width:${w(dd)}%;background:var(--faint)"></i><i style="width:${w(res)}%;background:var(--warn)"></i><i style="width:${w(Math.max(0, sobra))}%;background:var(--ok)"></i></div>
      <div class="legend">
        <div><div class="k">Salário</div><div class="v">${brl(sal0)}</div></div>${ext > 0 ? `<div><div class="k"><span class="dot g"></span>Recebimentos extras</div><div class="v good">+ ${brl(ext)}</div></div>` : ''}
        <div><div class="k"><span class="dot n"></span>Sua parte da casa</div><div class="v">− ${brl(k.devido[eu])} <small>· ${pct(p(k.devido[eu]))}</small></div></div>
        <div><div class="k"><span class="dot a"></span>Contas pessoais</div><div class="v">− ${brl(k.pessoal[eu])} <small>· ${pct(p(k.pessoal[eu]))}</small></div></div>
        <div><div class="k"><span class="dot f"></span>Dia a dia</div><div class="v">− ${brl(dd)} <small>· ${pct(p(dd))}</small></div></div>
        <div><div class="k"><span class="dot w"></span>Reserva</div><div class="v">− ${brl(res)} <small>· ${pct(p(res))}</small></div></div>
        <div><div class="k"><span class="dot g"></span>= Sobra</div><div class="v ${sobra >= 0 ? 'good' : 'badc'}">${brl(sobra)}</div></div>
      </div>
    </section>
    <div class="pair">
      <section class="card">
        <h2>Divisão da casa</h2>
        <div class="sub" style="margin-top:14px">Total das contas</div>${big(k.T, 'lg')}
        <div class="split"><div><div class="k"><span class="dot a"></span>${esc(c.nomes.a)} paga</div><div class="v">${brl(k.pago.a)}</div></div>
          <div><div class="k">${esc(c.nomes.b)} paga<span class="dot b"></span></div><div class="v">${brl(k.pago.b)}</div></div></div>
        <div class="swrap"><div class="sbar"><i class="a" style="width:${pa}%">${k.T ? pct1(pa) : ''}</i><i class="b" style="width:${100 - pa}%">${k.T ? pct1(100 - pa) : ''}</i></div>
          <div class="mark" style="left:calc(${k.ratio.a * 100}% - 1px)" title="Divisão combinada"></div></div>
        <div class="sub" style="margin-top:10px">A linha marca a divisão combinada neste mês: ${pct(k.ratio.a)} / ${pct(k.ratio.b)}</div>
        <div class="sec">Quem paga cada conta</div>
        <div class="rows">${k.casa.length ? k.casa.map(x => `<div class="row"><span class="dot ${x.pagador}"></span><button class="nm" data-edit="${esc(x.id)}">${esc(x.nome)}</button><span class="num">${brl(x.valor)}</span></div>`).join('') : `<div class="empty">Sem contas da casa neste mês.</div>`}</div>
        ${acerto ? `<div class="settle">${acerto}</div>` : ''}
      </section>
      <section class="card">
        <h2>Cartões</h2>
        <div class="sub" style="margin-top:14px">Faturas que vencem em ${ymNome(S.ym)}</div>${big(prox[0].v, 'lg')}
        ${cards.length ? `<div style="margin-top:12px"><button class="btn sm ghost" data-go="cartoes">Ver faturas</button></div>
          <div class="plastics">${cards.map(([id, x]) => plastic(id, x)).join('')}</div>
          <div class="sec up" style="margin-top:20px">Próximas faturas</div>
          <div class="nexts">${prox.map((x, i) => `<div class="nx ${i ? '' : 'on'}"><b>${MESES[+x.ym.slice(5) - 1].slice(0, 3)}</b><div class="col2"><i style="height:${x.v / mx * 100}%"></i></div><span class="num">${brl(x.v)}</span></div>`).join('')}</div>`
      : `<div class="empty">Nenhum cartão cadastrado.<br><br><button class="btn sm" data-act="novo-cartao">Cadastrar cartão</button></div>`}
      </section>
    </div>
  </div><div class="col">
    <section class="card">
      <h2>Contas a pagar</h2>
      <div style="margin:12px 0 6px">${big(sum(abertas), 'lg')}</div>
      <div class="sub"><b>${minhas.length - abertas.length} de ${minhas.length}</b> pagas neste mês</div>
      ${dias.length ? `<div class="chips"><button class="chip ${S.dia ? '' : 'on'}" data-dia="0">Tudo<small></small></button>${dias.map(x => { const n = abertas.filter(y => y.dia === x).length; return `<button class="chip ${S.dia === x ? 'on' : ''}" data-dia="${x}" aria-label="Dia ${x}, ${n} em aberto">${String(x).padStart(2, '0')}<small>${'•'.repeat(Math.min(n, 5))}</small></button>`; }).join('')}</div>` : ''}
      <div class="rows">${vis.length ? vis.map(x => `<div class="row ${k.pagas[x.id] ? 'done' : ''}">
        <button class="chk ${k.pagas[x.id] ? 'on' : ''}" data-pagar="${esc(x.id)}" aria-label="${k.pagas[x.id] ? 'Desmarcar' : 'Marcar'} ${esc(x.nome)} como paga"><svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round"><path d="M5 12l5 5 9-10"/></svg></button>
        <button class="nm" data-edit="${esc(x.id)}">${esc(x.nome)}</button><span class="dot ${x.pagador}" title="${esc(c.nomes[x.pagador])} paga"></span><span class="num">${brl(x.valor)}</span></div>`).join('') : `<div class="empty">Nenhuma conta neste mês.<br>Use “Adicionar conta” ou “Importar arquivo”.</div>`}</div>
    </section>
    <section class="card">
      <h2>Moradia</h2>
      <div class="sub" style="margin-top:14px">${casal ? 'Quanto vocês gastam pra morar' : 'Quanto você gasta pra morar'}</div>${big(morV, 'lg')}
      <div style="margin:8px 0 14px">${base > 0 ? `<span class="${mp <= .3 ? 'good' : 'badc'}">${mp <= .3 ? '✓' : '!'} ${pct(mp)} do salário</span> <span class="sub">referência: até 30%</span>` : `<span class="sub">Informe os salários para ver o percentual</span>`}</div>
      <div class="seg"><button class="${casal ? '' : 'on'}" data-mor="eu">Só meu salário</button><button class="${casal ? 'on' : ''}" data-mor="casal">Salário do casal</button></div>
      <div class="meter ${mp > .3 ? 'over' : ''}"><i style="width:${Math.min(100, mp / .6 * 100)}%"></i><b></b></div>
      <div class="ends"><span>0%</span><span>60% do salário</span></div>
      <div class="sec">O que entra na conta</div>
      <div class="rows">${mor.length ? mor.map(x => `<div class="row"><span class="nm">${esc(x.nome)}</span><span class="num">${brl(casal ? x.valor : k.parte(x, eu))}</span></div>`).join('') : `<div class="empty">Marque “Conta de moradia” nas contas que entram aqui (aluguel, condomínio, luz…).</div>`}</div>
    </section>
  </div></div>`;
}

function vFluxo() {
  const c = cfg(), all = Object.entries(D.lanc).map(([id, l]) => ({ ...l, id })).filter(l => l.origem === 'conta' && l.data.startsWith(S.ym));
  const l = all.filter(x => S.fluxo === 'todos' || x.pessoa === S.fluxo).sort((x, y) => y.data.localeCompare(x.data) || x.desc.localeCompare(y.desc));
  const ent = sum(l.filter(x => x.valor > 0)), sai = sum(l.filter(x => x.valor < 0)), bl = bills(S.ym);
  return `<section class="card"><div class="hd"><h2>Fluxo de caixa <small>· extratos importados de ${ymNome(S.ym)}</small></h2>
      <div class="seg three" style="min-width:280px"><button class="${S.fluxo === 'todos' ? 'on' : ''}" data-fluxo="todos">Os dois</button><button class="${S.fluxo === 'a' ? 'on' : ''}" data-fluxo="a">${esc(c.nomes.a)}</button><button class="${S.fluxo === 'b' ? 'on' : ''}" data-fluxo="b">${esc(c.nomes.b)}</button></div></div>
    <div class="stats" style="margin-top:18px"><div><div class="sub">Entradas</div>${big(ent, 'md')}</div><div><div class="sub">Saídas</div>${big(-sai, 'md')}</div><div><div class="sub">Saldo do mês</div>${big(r2(ent + sai), 'md')}</div></div></section>
  <section class="card"><div class="hd"><h2>Lançamentos <small>· ${l.length}</small></h2>${l.length ? `<button class="btn sm danger" data-wipe="mes">${S.confirm === 'wipe:mes' ? 'Confirmar: apagar' : 'Apagar os de ' + ymNome(S.ym)}</button>` : ''}<button class="btn sm ghost" data-act="importar">Importar extrato</button></div>
    <div class="rows" style="margin-top:8px">${l.length ? l.map(x => `<div class="row"><span class="dt">${dm(x.data)}</span><span class="dot ${x.pessoa}"></span><span class="nm">${esc(x.desc)}</span>
      ${x.valor < 0 ? `<select data-link="${esc(x.id)}" aria-label="Vincular a uma conta"><option value="">Sem conta vinculada</option>${bl.map(b => `<option value="${esc(b.id)}" ${x.conta === b.id ? 'selected' : ''}>${esc(b.nome)}</option>`).join('')}</select>` : ''}
      <span class="num ${x.valor > 0 ? 'pos' : ''}">${brl(x.valor)}</span>${delBtn(x.id)}</div>`).join('') : `<div class="empty">Nenhum lançamento em ${ymNome(S.ym)}.<br>Baixe o extrato no site do banco (OFX ou CSV) e clique em “Importar extrato”.</div>`}</div>
    ${l.length ? `<p class="sub" style="margin:12px 0 0">Vincular um lançamento a uma conta marca essa conta como paga no mês.</p>` : ''}</section>`;
}
const delBtn = id => S.confirm === 'del:' + id ? `<button class="btn sm danger" data-del="${esc(id)}">Excluir?</button>` : `<button class="x" data-del="${esc(id)}" aria-label="Excluir lançamento">×</button>`;

function vCartoes() {
  const c = cfg(), cards = Object.entries(D.cartoes);
  if (!cards.length) return `<section class="card empty"><p>Nenhum cartão cadastrado ainda.<br>Cadastre o cartão e depois importe a fatura (CSV ou OFX) ou digite o valor.</p><button class="btn" data-act="novo-cartao">Cadastrar cartão</button></section>`;
  return `<div class="hd"><span class="grow"></span><button class="btn ghost" data-act="novo-cartao">+ Novo cartão</button></div>` + cards.map(([id, x]) => {
    const tot = faturaTotal(id, S.ym), manual = (D.fatManual[id] || {})[S.ym], l = Object.entries(D.lanc).map(([lid, v]) => ({ ...v, id: lid })).filter(v => v.cartao === id && v.fatura === S.ym).sort((p, q) => q.data.localeCompare(p.data));
    return `<section class="card"><div class="cardview"><div>${plastic(id, x, 'wide')}<div style="margin-top:12px"><button class="btn sm ghost" data-kedit="${esc(id)}">Editar cartão</button></div></div>
      <div><div class="hd"><h2>Fatura que vence em ${ymNome(S.ym)} <small>· ${x.tipo === 'casa' ? 'dividida entre os dois' : 'pessoal de ' + esc(c.nomes[x.dono])}</small></h2></div>
        <div style="margin:10px 0">${big(tot, 'lg')}</div>
        <div class="inline"><label class="sub" for="fm-${esc(id)}">Valor digitado:</label><input type="text" inputmode="decimal" id="fm-${esc(id)}" placeholder="0,00" value="${manual != null ? money(manual) || '0' : ''}"><button class="btn sm ghost" data-fman="${esc(id)}">Usar este valor</button>${manual != null ? `<button class="btn sm ghost" data-fauto="${esc(id)}">Voltar à soma importada</button>` : ''}</div>
        <div class="sec">Lançamentos da fatura <span class="sub">· ${l.length}${l.some(v => v.prev) ? ' · “prevista” = parcela projetada de uma fatura anterior' : ''}</span></div>
        <div class="rows">${l.length ? l.map(v => `<div class="row"><span class="dt">${dm(v.data)}</span><span class="nm">${esc(v.desc)}</span>${v.prev ? '<span class="tag">prevista</span>' : ''}<span class="num ${v.valor > 0 ? 'pos' : ''}">${brl(-v.valor)}</span>${delBtn(v.id)}</div>`).join('') : `<div class="empty">Nada importado nesta fatura. Use “Importar arquivo” e escolha “Fatura do cartão”.</div>`}</div>
      </div></div></section>`; }).join('');
}

const tags = (x, k) => `${x.dia ? `<span class="tag">dia ${x.dia}</span>` : ''}${x.fatura ? '<span class="tag">cartão</span>' : x.parcN ? `<span class="tag">parcela ${x.parc}/${x.parcN}</span>` : `<span class="tag">${x.recorrente ? 'todo mês' : 'só este mês'}</span>`}${x.moradia ? '<span class="tag">moradia</span>' : ''}${k.pagas[x.id] ? '<span class="tag ok">paga</span>' : ''}`;
const delConta = x => x.fatura || x.fin ? '' : S.confirm === 'conta:' + x.id ? `<button class="btn sm danger" data-delconta="${esc(x.id)}">Excluir?</button>` : `<button class="x" data-delconta="${esc(x.id)}" aria-label="Excluir ${esc(x.nome)}">×</button>`;
function vCasa() {
  const k = calc(), { c } = k;
  const grupo = (t, l) => `<section class="card"><h2>${t} <small>· ${brl(sum(l))}</small></h2><div class="rows" style="margin-top:8px">${l.length ? l.map(x => `<div class="row">
    <span class="dot ${x.pagador}"></span><button class="nm" data-edit="${esc(x.id)}">${esc(x.nome)}</button>${tags(x, k)}<span class="num">${brl(x.valor)}</span>${delConta(x)}</div>`).join('') : '<div class="empty">Nada por aqui neste mês.</div>'}</div></section>`;
  const prox = [0, 1, 2, 3, 4, 5].map(n => { const ym = ymAdd(S.ym, n), q = calc(ym); return { ym, q }; });
  const fut = Object.entries(D.contas).map(([id, x]) => ({ ...x, id, quando: x.recorrente ? x.inicio : x.mes })).filter(x => x.quando && x.quando > S.ym).sort((p, q) => p.quando.localeCompare(q.quando));
  const pa = Math.round(cfg().divisao === 'igual' ? 50 : k.fracA({}) * 100);
  const sel = x => `<select data-divsel="${esc(x.id)}" aria-label="Como dividir ${esc(x.nome)}"><option value="padrao" ${!x.div || x.div === 'padrao' ? 'selected' : ''}>Divisão do casal (${pa}/${100 - pa})</option><option value="igual" ${x.div === 'igual' ? 'selected' : ''}>Meio a meio</option>${x.div === 'pct' ? `<option value="pct" selected>${Math.round(k.fracA(x) * 100)}% / ${100 - Math.round(k.fracA(x) * 100)}%</option>` : ''}${x.fatura || x.fin ? '' : '<option value="editar">Outro percentual…</option>'}</select>`;
  const cel = (x, w) => x.tipo === 'casa' ? brl(k.parte(x, w)) : x.pagador === w ? brl(x.valor) : '<span class="sub">—</span>';
  return `<section class="card"><div class="hd"><h2>Contas de ${ymNome(S.ym)} <small>· marque quais vocês dividem</small></h2><button class="btn sm ghost" data-act="nova-pessoal">+ Conta pessoal</button><button class="btn sm ghost" data-act="nova-dividida">+ Conta dividida</button></div>
    ${k.list.length ? `<div class="tblx"><table><thead><tr><th>Conta</th><th class="r">Valor</th><th>Dividir?</th><th>Como divide</th><th class="r"><span class="dot a"></span> ${esc(c.nomes.a)}</th><th class="r"><span class="dot b"></span> ${esc(c.nomes.b)}</th><th>Quem paga</th><th></th></tr></thead><tbody>
      ${k.list.map(x => `<tr><td class="w"><button class="nm" data-edit="${esc(x.id)}">${esc(x.nome)}</button> ${x.parcN ? `<span class="tag">${x.parc}/${x.parcN}</span>` : ''}${x.fatura ? '<span class="tag">cartão</span>' : ''}${x.fin ? '<span class="tag">financiamento</span>' : ''}</td><td class="r">${brl(x.valor)}</td>
        <td><label class="sw"><input type="checkbox" data-divtog="${esc(x.id)}" ${x.tipo === 'casa' ? 'checked' : ''}><span>${x.tipo === 'casa' ? 'Dividida' : 'Pessoal'}</span></label></td>
        <td>${x.tipo === 'casa' ? sel(x) : '<span class="sub">não divide</span>'}</td><td class="r">${cel(x, 'a')}</td><td class="r">${cel(x, 'b')}</td><td><span class="dot ${x.pagador}"></span> ${esc(c.nomes[x.pagador])}</td><td>${delConta(x)}</td></tr>`).join('')}
      <tr class="tot"><td>Total</td><td class="r">${brl(sum(k.list))}</td><td></td><td></td><td class="r">${brl(r2(k.devido.a + k.pessoal.a))}</td><td class="r">${brl(r2(k.devido.b + k.pessoal.b))}</td><td></td><td></td></tr></tbody></table></div>
      <p class="sub" style="margin:12px 0 0">Divididas: ${brl(k.T)} (${esc(c.nomes.a)} ${brl(k.devido.a)} · ${esc(c.nomes.b)} ${brl(k.devido.b)}). Pessoais: ${esc(c.nomes.a)} ${brl(k.pessoal.a)} · ${esc(c.nomes.b)} ${brl(k.pessoal.b)}. A fatura do cartão também pode ser marcada como pessoal ou dividida aqui.</p>`
      : `<div class="empty">Nenhuma conta em ${ymNome(S.ym)}. Lance aqui financiamento do carro, da casa, condomínio, e marque em cada uma se vocês dividem ou se é pessoal.</div>`}</section>
  <section class="card"><div class="hd"><h2>Próximos meses</h2><button class="btn sm ghost" data-act="futura">+ Lançar conta futura</button></div>
    <div class="tblx" style="margin-top:10px"><table><thead><tr><th></th>${prox.map(p => `<th class="r">${MESES[+p.ym.slice(5) - 1].slice(0, 3)}/${p.ym.slice(2, 4)}</th>`).join('')}</tr></thead><tbody>
      <tr><td>Recebimentos extras</td>${prox.map(p => { const v = r2(p.q.extra.a + p.q.extra.b); return `<td class="r ${v > 0 ? 'good' : ''}">${v > 0 ? '+ ' + brl(v) : '—'}</td>`; }).join('')}</tr>
      <tr><td>Contas da casa</td>${prox.map(p => `<td class="r">${brl(p.q.T)}</td>`).join('')}</tr>
      ${['a', 'b'].map(w => `<tr><td><span class="dot ${w}"></span> Parte de ${esc(c.nomes[w])}</td>${prox.map(p => `<td class="r">${brl(p.q.devido[w])}</td>`).join('')}</tr><tr><td><span class="dot ${w}"></span> Pessoais de ${esc(c.nomes[w])}</td>${prox.map(p => `<td class="r">${brl(p.q.pessoal[w])}</td>`).join('')}</tr>`).join('')}
    </tbody></table></div>
    <div class="sec">Contas que ainda vão começar</div>
    <div class="rows">${fut.length ? fut.map(x => `<div class="row"><span class="dot ${x.pagador}"></span><button class="nm" data-edit="${esc(x.id)}">${esc(x.nome)}</button><span class="tag">${x.recorrente ? 'a partir de ' : ''}${ymNome(x.quando)}/${x.quando.slice(0, 4)}</span>${x.recorrente && x.fim ? `<span class="tag">${ymDiff(x.inicio, x.fim) + 1} parcelas</span>` : ''}<span class="tag">${x.tipo === 'casa' ? 'da casa' : 'pessoal'}</span><span class="num">${brl(+x.valor || 0)}</span>${delConta(x)}</div>`).join('') : `<div class="empty">Nenhuma conta futura lançada. Use “Lançar conta futura” para IPVA, matrícula, parcelas que começam depois…</div>`}</div></section>`;
}

function vReserva() {
  const c = cfg(), rs = Object.entries(D.reservas), ap = (D.meses[S.ym] || {}).aportes || {};
  const total = r2(rs.reduce((t, [, x]) => t + (+x.saldo || 0), 0)), mensal = r2(rs.reduce((t, [, x]) => t + (+(x.aporte || {}).a || 0) + (+(x.aporte || {}).b || 0), 0));
  return `<section class="card"><div class="hd"><h2>Nossa reserva</h2><button class="btn sm ghost" data-act="nova-reserva">+ Nova reserva</button></div>
    <div class="stats" style="margin-top:14px"><div><div class="sub">Total guardado</div>${big(total, 'lg')}</div><div><div class="sub">Guardando por mês</div>${big(mensal, 'md')}</div><div><div class="sub">Sai do salário de cada um</div><div class="num"><span class="dot a"></span> ${brl(calc().reserva.a)} &nbsp; <span class="dot b"></span> ${brl(calc().reserva.b)}</div></div></div></section>
  ${rs.length ? rs.map(([id, x]) => { const saldo = +x.saldo || 0, meta = +x.meta || 0, m = (+(x.aporte || {}).a || 0) + (+(x.aporte || {}).b || 0), falta = Math.max(0, meta - saldo), n = m > 0 ? Math.ceil(falta / m) : 0, feito = ap[id] != null;
    return `<section class="card"><div class="hd"><h2>${esc(x.nome)}</h2><button class="btn sm ghost" data-redit="${esc(id)}">Editar</button></div>
      <div style="margin:12px 0 4px">${big(saldo, 'lg')}</div>
      ${meta ? `<div class="sub">de ${brl(meta)} · ${pct(Math.min(1, saldo / meta))} da meta</div><div class="bar" style="margin:12px 0"><i style="width:${Math.min(100, saldo / meta * 100)}%;background:var(--ok)"></i></div>
        <div class="sub">${falta <= 0 ? 'Meta alcançada.' : m > 0 ? `Faltam ${brl(falta)}. Guardando ${brl(m)} por mês, vocês chegam lá em <b>${ymCurto(ymAdd(S.ym, n))}</b> (${n} ${n === 1 ? 'mês' : 'meses'}).` : `Faltam ${brl(falta)}. Defina quanto guardar por mês para ver a previsão.`}</div>` : `<div class="sub">Sem meta definida.</div>`}
      <div class="settle"><span><span class="dot a"></span> ${esc(c.nomes.a)} ${brl(+(x.aporte || {}).a || 0)} &nbsp; <span class="dot b"></span> ${esc(c.nomes.b)} ${brl(+(x.aporte || {}).b || 0)} <span class="sub">por mês</span></span>
        ${m > 0 || feito ? `<button class="btn sm ${feito ? '' : 'ghost'}" data-aporte="${esc(id)}">${feito ? `✓ Aporte de ${ymNome(S.ym)} somado` : `Somar aporte de ${ymNome(S.ym)}`}</button>` : ''}</div></section>`; }).join('')
    : `<section class="card empty">Nenhuma reserva ainda. Crie uma (emergência, viagem, entrada do imóvel…) com a meta e quanto cada um guarda por mês.<br>O valor mensal entra no Saldo previsto como dinheiro já separado.</section>`}`;
}

const price = (s, i, n) => i > 0 ? s * i / (1 - Math.pow(1 + i, -n)) : s / n;
// Tabela mês a mês do financiamento. modo: 'feitas' = só as amortizações já feitas (a realidade); 'plano' = inclui as planejadas.
const _tab = new WeakMap();
function tabela(f, modo) {
  let c = _tab.get(f); if (!c) _tab.set(f, c = {}); if (c[modo] !== undefined) return c[modo];
  const i = f.unid === 'aa' ? Math.pow(1 + f.taxa / 100, 1 / 12) - 1 : f.taxa / 100, rows = [];
  let saldo = +f.saldo, n = +f.prazo, ym = f.primeira || f.base, pmt = price(saldo, i, n), am = saldo / n, ok = true;
  const ex = {}; for (const a of f.amort || []) if (modo === 'plano' || a.feita) (ex[a.ym] = ex[a.ym] || []).push(a);
  while (saldo > .005 && rows.length < 720) {
    const j = saldo * i; let a = f.sistema === 'sac' ? am : pmt - j; if (!(a > 0)) { ok = false; break; } a = Math.min(a, saldo);
    saldo -= a; n--; let extra = 0;
    if (saldo > 0) { const l = (ex[ym] || []).slice(); if (modo === 'plano' && +f.extraMensal > 0) l.push({ valor: +f.extraMensal, efeito: 'prazo' });
      for (const e of l) { const v = Math.min(e.valor, saldo); saldo -= v; extra += v; if (e.efeito === 'parcela' && n > 0 && saldo > 0) { pmt = price(saldo, i, n); am = saldo / n; } } }
    rows.push({ ym, juros: j, amort: a, parcela: r2(a + j), extra }); ym = ymAdd(ym, 1);
  }
  return c[modo] = ok && rows.length ? { rows, meses: rows.length, juros: r2(rows.reduce((t, r) => t + r.juros, 0)), extra: r2(rows.reduce((t, r) => t + r.extra, 0)), fim: rows[rows.length - 1].ym } : null;
}
// Parcela do financiamento em um mês, para entrar nas contas do mês.
function parcelaFin(f, ym) {
  const ini = f.primeira || f.base, t = tabela(f, 'feitas'); if (!t || ym < ini || ym > t.fim) return null;
  const k = ymDiff(ini, ym), r = t.rows[k]; if (!r) return null;
  return { valor: +f.boleto > 0 ? +f.boleto : r.parcela, parc: k + 1, parcN: t.meses, amort: r.amort };
}
// Saldo devedor hoje: saldo informado menos o que já foi amortizado pelas parcelas marcadas como pagas e pelas amortizações feitas.
function saldoFin(id, f) {
  const t = tabela(f, 'feitas'); if (!t) return { saldo: +f.saldo, pagas: 0, total: 0 };
  let saldo = +f.saldo, pagas = 0;
  for (const r of t.rows) if (((D.meses[r.ym] || {}).pagas || {})['fin-' + id]) { saldo -= r.amort; pagas++; }
  for (const a of f.amort || []) if (a.feita) saldo -= a.valor;
  return { saldo: r2(Math.max(0, saldo)), pagas, total: t.meses };
}
function vFinanc() {
  const fs = Object.entries(D.financ), c = cfg(), pg = (D.meses[S.ym] || {}).pagas || {};
  return `<div class="hd"><span class="grow sub">Simulação pelo saldo, taxa e prazo informados. Não inclui correção (TR/IPCA); para seguros e tarifas, informe o valor do boleto no cadastro.</span><button class="btn ghost" data-act="novo-fin">+ Novo financiamento</button></div>` + (fs.length ? fs.map(([id, f]) => {
    const b = tabela(f, 'feitas'), q = tabela(f, 'plano'), am = (f.amort || []).map((a, ix) => ({ ...a, ix })).sort((x, y) => x.ym.localeCompare(y.ym));
    if (!b || !q) return `<section class="card"><div class="hd"><h2>${esc(f.nome)}</h2><button class="btn sm ghost" data-fedit="${esc(id)}">Editar</button></div><p class="err">Com estes números a parcela não cobre os juros. Confira saldo, taxa e prazo.</p></section>`;
    const eco = r2(b.juros - q.juros), dm = b.meses - q.meses, sf = saldoFin(id, f), pm = parcelaFin(f, S.ym), paga = !!pg['fin-' + id], pago = +f.saldo > 0 ? 1 - sf.saldo / +f.saldo : 0;
    return `<section class="card"><div class="hd"><h2>${esc(f.nome)} <small>· ${f.sistema === 'sac' ? 'SAC' : 'Price'} · ${nf.format(f.taxa)}% ${f.unid === 'aa' ? 'a.a.' : 'a.m.'} · ${(f.tipo || 'casa') === 'casa' ? 'dividido' : 'pessoal'}, quem paga: ${esc(c.nomes[f.pagador || 'a'])}</small></h2><button class="btn sm ghost" data-fedit="${esc(id)}">Editar</button></div>
      <div class="stats" style="margin-top:14px"><div><div class="sub">Saldo devedor hoje</div>${big(sf.saldo, 'lg')}<div class="sub">era ${brl(+f.saldo)} em ${ymCurto(f.base)} · 1ª parcela em ${ymCurto(f.primeira || f.base)}</div></div>
        <div><div class="sub">Parcela de ${ymNome(S.ym)}</div>${pm ? big(pm.valor, 'md') + `<div class="sub">parcela ${pm.parc} de ${pm.parcN}${+f.boleto > 0 ? ' · valor do boleto' : ' · estimada'}</div>` : '<div class="sub">sem parcela neste mês</div>'}</div>
        <div><div class="sub">Parcelas pagas</div><div class="big md">${sf.pagas} <span class="ct">de ${sf.total}</span></div></div></div>
      <div class="bar" style="margin:14px 0 6px" role="img" aria-label="Quanto do saldo já foi pago"><i style="width:${Math.min(100, pago * 100)}%;background:var(--ok)"></i></div>
      <div class="inline"><span class="sub grow">${pct1(pago * 100)} do saldo já amortizado. ${f.gerar === false ? 'A parcela não está sendo lançada nas contas do mês.' : 'A parcela entra sozinha nas contas de cada mês; ao marcar como paga, o saldo diminui.'}</span>
        ${pm && f.gerar !== false ? `<button class="btn sm ${paga ? '' : 'ghost'}" data-pagar="fin-${esc(id)}">${paga ? `✓ Parcela de ${ymNome(S.ym)} paga` : `Marcar parcela de ${ymNome(S.ym)} como paga`}</button>` : ''}</div>
      <div class="tblx"><table><thead><tr><th></th><th class="r">Sem novas amortizações</th><th class="r">Com o plano</th><th class="r">Diferença</th></tr></thead><tbody>
        <tr><td>Quitação</td><td class="r">${ymCurto(b.fim)}</td><td class="r">${ymCurto(q.fim)}</td><td class="r ${dm > 0 ? 'good' : ''}">${dm > 0 ? `${dm} ${dm === 1 ? 'mês' : 'meses'} antes` : '—'}</td></tr>
        <tr><td>Juros até o fim</td><td class="r">${brl(b.juros)}</td><td class="r">${brl(q.juros)}</td><td class="r ${eco > 0 ? 'good' : ''}">${eco > 0 ? 'economia de ' + brl(eco) : '—'}</td></tr>
        <tr><td>Amortização extra</td><td class="r">${brl(b.extra)}</td><td class="r">${brl(q.extra)}</td><td class="r"></td></tr></tbody></table></div>
      <div class="sec">Amortização planejada</div>
      ${+f.extraMensal > 0 ? `<div class="row"><span class="nm">Todo mês</span><span class="tag">reduz o prazo</span><span class="num">${brl(+f.extraMensal)}</span></div>` : ''}
      <div class="rows">${am.map(a => `<div class="row"><span class="nm">${ymCurto(a.ym)}</span><span class="tag">${a.efeito === 'parcela' ? 'reduz a parcela' : 'reduz o prazo'}</span><span class="num">${brl(a.valor)}</span><button class="btn sm ${a.feita ? '' : 'ghost'}" data-amfeita="${esc(id)}|${a.ix}">${a.feita ? '✓ Feita' : 'Marcar feita'}</button><button class="x" data-amdel="${esc(id)}|${a.ix}" aria-label="Remover amortização">×</button></div>`).join('')}</div>
      ${!am.length && !(+f.extraMensal > 0) ? `<div class="sub" style="margin:6px 0">Nada planejado ainda. Lance abaixo um valor (13º, FGTS, bônus…) e veja o efeito na quitação e nos juros.</div>` : ''}
      <div class="inline" style="margin-top:10px"><input type="month" id="am-ym-${esc(id)}" value="${ymAdd(S.ym, 1)}" aria-label="Mês da amortização" style="width:160px"><input type="text" inputmode="decimal" id="am-v-${esc(id)}" placeholder="Valor (R$)" aria-label="Valor da amortização">
        <select id="am-e-${esc(id)}" aria-label="Efeito" class="sel"><option value="prazo">Reduzir o prazo</option><option value="parcela">Reduzir a parcela</option></select><button class="btn sm" data-amadd="${esc(id)}">Adicionar ao plano</button></div></section>`; }).join('')
    : `<section class="card empty">Nenhum financiamento cadastrado. Cadastre o do carro e o da casa com saldo devedor, taxa e prazo que estão no contrato ou no extrato do banco. A parcela entra sozinha nas contas do mês.</section>`);
}

function vRenda() {
  const c = cfg();
  return `<section class="card"><h2>Nossa renda</h2><p class="sub" style="margin:4px 0 18px">Estes dados valem para os dois e ficam no arquivo compartilhado.</p>
  <form id="fcfg" class="form" novalidate>
    ${['a', 'b'].map(p => `<div class="f"><label for="n-${p}"><span class="dot ${p}"></span> Nome</label><input type="text" id="n-${p}" maxlength="24" value="${esc(D.config ? c.nomes[p] : '')}" placeholder="${p === 'a' ? 'Seu nome' : 'Nome do seu marido'}"></div>`).join('')}
    ${['a', 'b'].map(p => `<div class="f"><label for="s-${p}">Salário líquido de ${esc(c.nomes[p])} (R$)</label><input type="text" inputmode="decimal" id="s-${p}" value="${money(c.salarios[p])}" placeholder="0,00"></div>`).join('')}
    ${['a', 'b'].map(p => `<div class="f"><label for="d-${p}">Dia a dia de ${esc(c.nomes[p])} (mercado, transporte, lazer)</label><input type="text" inputmode="decimal" id="d-${p}" value="${money(c.diaadia[p])}" placeholder="0,00"></div>`).join('')}
    <div class="f"><label for="divisao">Como dividir as contas da casa</label><select id="divisao">
      <option value="proporcional" ${c.divisao === 'proporcional' ? 'selected' : ''}>Proporcional ao salário</option><option value="igual" ${c.divisao === 'igual' ? 'selected' : ''}>Meio a meio</option><option value="custom" ${c.divisao === 'custom' ? 'selected' : ''}>Percentual fixo</option></select></div>
    <div class="f" id="pct-f" ${c.divisao === 'custom' ? '' : 'hidden'}><label for="pctA">Parte de ${esc(c.nomes.a)} (%)</label><input type="number" id="pctA" min="0" max="100" value="${+c.pctA || 50}"></div>
    <div class="full err" id="cfg-err" hidden></div>
    <div class="acts full"><button class="btn" type="submit">Salvar</button></div>
  </form></section>
  <section class="card"><h2>Recebimentos extras</h2><p class="sub" style="margin:4px 0 12px">13º, férias, bônus, restituição, venda de algo… Entram no Saldo previsto de quem recebeu, só no mês escolhido. Não mudam a divisão proporcional das contas, que segue o salário.</p>
    <div class="inline"><input type="text" id="x-nome" maxlength="40" placeholder="Ex.: 13º salário" aria-label="Descrição" style="width:200px"><input type="text" inputmode="decimal" id="x-valor" placeholder="Valor (R$)" aria-label="Valor"><input type="month" id="x-mes" value="${S.ym}" aria-label="Mês" style="width:160px">
      <select id="x-pessoa" class="sel" aria-label="Quem recebe">${['a', 'b'].map(p => `<option value="${p}" ${S.eu === p ? 'selected' : ''}>${esc(c.nomes[p])}</option>`).join('')}</select><button class="btn sm" data-act="add-extra">Adicionar</button></div>
    <div class="rows" style="margin-top:8px">${(() => { const l = Object.entries(D.extras).map(([id, x]) => ({ ...x, id })).filter(x => x.mes >= S.ym).sort((p, q) => p.mes.localeCompare(q.mes)); return l.length ? l.map(x => `<div class="row"><span class="dot ${x.pessoa}"></span><span class="nm">${esc(x.nome)}</span><span class="tag">${ymCurto(x.mes)}</span><span class="tag">${esc(c.nomes[x.pessoa])}</span><span class="num pos">+ ${brl(x.valor)}</span><button class="x" data-delextra="${esc(x.id)}" aria-label="Excluir ${esc(x.nome)}">×</button></div>`).join('') : `<div class="empty">Nenhum recebimento extra de ${ymNome(S.ym)} em diante.</div>`; })()}</div></section>`;
}

function updMsg() { const u = S.upd || {}; return u.state === 'checking' ? 'Procurando…' : u.state === 'downloading' ? `Baixando a versão ${u.version || 'nova'}… ${u.pct || 0}%` : u.state === 'ready' ? 'Versão nova baixada. Clique em “Reiniciar e atualizar” no topo.' : u.state === 'none' ? 'Você já está na versão mais recente.' : u.state === 'error' ? 'Não consegui procurar agora. Confira a internet e tente de novo.' : u.state === 'dev' ? 'Disponível só no app instalado.' : ''; }
function vDados() {
  return `<section class="card"><h2>Arquivo de dados</h2>
    <p class="sub" style="margin:4px 0 14px">Tudo o que vocês lançam fica neste arquivo. Para os dois verem as mesmas contas, guarde-o numa pasta sincronizada (Google Drive, OneDrive ou Dropbox) e abra o mesmo arquivo nos dois computadores.</p>
    <div class="path">${esc(S.path || '')}</div>${S.versao ? `<p class="sub" style="margin:10px 0 0">Casa em Dia versão ${esc(S.versao)}. O app procura atualizações sozinho ao abrir.</p><div class="inline" style="margin-top:8px"><button class="btn sm ghost" data-act="check-upd">Procurar atualização agora</button><span class="sub">${esc(updMsg())}</span></div>` : ''}
    <div class="acts" style="justify-content:flex-start;margin-top:14px"><button class="btn ghost" data-act="reveal">Mostrar na pasta</button><button class="btn ghost" data-act="abrir">Abrir outro arquivo</button><button class="btn ghost" data-act="novo">Criar arquivo novo</button></div>
    <p class="sub" style="margin:16px 0 0">Evitem editar ao mesmo tempo nos dois computadores: a pasta sincronizada pode criar uma cópia em conflito. O app relê o arquivo sozinho quando o outro salva.</p></section>
  <section class="card"><h2>Apagar dados</h2><p class="sub" style="margin:4px 0 14px">Apaga do arquivo compartilhado, para os dois. Não dá para desfazer.</p>
    <div class="rows">${[['extratos', 'Lançamentos de extrato', 'Tudo o que foi importado em Fluxo de caixa, de todos os meses.', Object.values(D.lanc).filter(l => l.origem === 'conta').length], ['faturas', 'Faturas de cartão', 'Lançamentos importados e valores digitados das faturas. Os cartões ficam.', Object.values(D.lanc).filter(l => l.origem === 'cartao').length], ['contas', 'Contas', 'Todas as contas da casa e pessoais, incluindo as futuras.', Object.keys(D.contas).length], ['tudo', 'Tudo', 'Contas, cartões, lançamentos, reservas, financiamentos, renda e marcações de pago. O arquivo volta ao zero.', null]]
      .map(([k, t, d, n]) => `<div class="row"><div class="nm"><b>${t}</b>${n != null ? ` <span class="sub">· ${n}</span>` : ''}<div class="sub">${d}</div></div><button class="btn sm danger" data-wipe="${k}">${S.confirm === 'wipe:' + k ? 'Confirmar: apagar' : 'Apagar'}</button></div>`).join('')}</div></section>`;
}

function vBoasVindas() {
  return `<section class="card welcome"><h2>Bem-vindos ao Casa em Dia</h2>
    <p>Escolha onde guardar os dados de vocês. Para usar em dois computadores, crie o arquivo dentro de uma pasta do Google Drive ou OneDrive; no outro computador, escolha “Abrir arquivo existente” e aponte para o mesmo arquivo.</p>
    <div class="acts" style="justify-content:center"><button class="btn" data-act="novo">Criar arquivo novo</button><button class="btn ghost" data-act="abrir">Abrir arquivo existente</button></div></section>`;
}

function render(force) {
  const [y, m] = S.ym.split('-'); $('#mes').innerHTML = `${MESES[+m - 1]} <span>${y}</span>`;
  document.querySelectorAll('nav a').forEach(a => a.classList.toggle('on', a.dataset.v === S.view));
  const c = cfg(); $('#who').innerHTML = ['a', 'b'].map(p => `<button class="${S.eu === p ? 'on' : ''}" data-eu="${p}"><span class="dot ${p}"></span> ${esc(c.nomes[p])}</button>`).join('');
  const t = document.documentElement.dataset.theme; document.querySelectorAll('#tema button').forEach(b => b.classList.toggle('on', b.dataset.tema === t));
  const v = $('#view'), usable = S.ready && S.path && !S.loadErr; $('#add').disabled = $('#imp').disabled = !usable;
  if (!force && S.view === 'renda' && v.contains(document.activeElement) && document.activeElement.matches('input,select')) return;
  const views = { reserva: vReserva, financ: vFinanc, visao: vVisao, fluxo: vFluxo, cartoes: vCartoes, casa: vCasa, renda: vRenda, dados: vDados };
  const upd = S.update ? `<div class="banner upd"><span>Uma versão nova do Casa em Dia foi baixada.</span><button class="btn sm" data-act="atualizar">Reiniciar e atualizar</button></div>` : '';
  v.innerHTML = upd + (!S.ready ? `<div class="card empty">Abrindo…</div>` : !S.path ? vBoasVindas()
    : S.loadErr ? `<div class="banner">${S.loadErr === 'missing' ? 'Não encontrei o arquivo de dados. Ele pode ter sido movido ou a pasta sincronizada ainda não baixou.' : 'Não consegui ler o arquivo de dados. Ele pode estar no meio de uma sincronização; nada foi alterado.'}</div>${vDados()}<div><button class="btn" data-act="recarregar">Tentar de novo</button></div>`
      : (views[S.view] || vVisao)());
}

/* ---------- dados ---------- */
let tt;
function toast(t) { const e = $('#toast'); e.textContent = t; e.hidden = false; clearTimeout(tt); tt = setTimeout(() => e.hidden = true, 4200); }

async function load() {
  const r = await store.load(); S.path = r.path; S.loadErr = null;
  if (!r.path) { D = vazio(); return; }
  if (r.error) { S.loadErr = r.error === 'missing' ? 'missing' : 'read'; return; }
  try { D = norm(r.json && r.json.trim() ? JSON.parse(r.json) : {}); } catch (e) { S.loadErr = 'read'; }
}
// Relê o arquivo antes de cada alteração, para não passar por cima do que o outro salvou.
let q = Promise.resolve();
function mutate(fn, ok) {
  q = q.then(async () => {
    await load();
    if (S.loadErr || !S.path) { toast('Não consegui abrir o arquivo de dados agora. Nada foi salvo; tente de novo em instantes.'); render(true); return; }
    const msg = fn(D);
    await store.save(JSON.stringify(D, null, 1));
    render(true); const t = typeof msg === 'string' ? msg : ok; if (t) toast(t);
  }).catch(e => { console.error(e); toast('Não deu para salvar. Confira se o arquivo de dados está acessível.'); });
  return q;
}
const alvo = (d, id) => id.startsWith('fat-') ? d.cartoes[id.slice(4)] : id.startsWith('fin-') ? d.financ[id.slice(4)] : d.contas[id];
const mesDe = (d, ym) => (d.meses[ym] = d.meses[ym] || { pagas: {} }, d.meses[ym].pagas = d.meses[ym].pagas || {}, d.meses[ym]);

/* ---------- conta ---------- */
function fillPessoas(sel) { const c = cfg(); sel.innerHTML = ['a', 'b'].map(p => `<option value="${p}">${esc(c.nomes[p])}</option>`).join(''); }
function openConta(id, pre) {
  if (id && id.startsWith('fat-')) { location.hash = 'cartoes'; return; }
  if (id && id.startsWith('fin-')) { location.hash = 'financ'; return; }
  const x = id ? D.contas[id] : null; if (id && !x) return; S.editing = id || null; pre = pre || {};
  $('#dlg-t').textContent = x ? 'Editar conta' : pre.titulo || 'Nova conta';
  $('#c-nome').value = x ? x.nome : ''; $('#c-valor').value = x ? money(x.valor) : ''; $('#c-dia').value = x && x.dia || '';
  $('#c-tipo').value = x ? x.tipo : pre.tipo || 'casa'; fillPessoas($('#c-pag')); $('#c-pag').value = x ? x.pagador : S.eu;
  $('#c-quando').value = x ? (!x.recorrente ? 'unico' : x.fim ? 'parcelas' : 'sempre') : pre.quando || 'sempre';
  $('#c-inicio').value = x ? (x.recorrente ? x.inicio || '' : x.mes || S.ym) : pre.inicio || '';
  $('#c-parc').value = x && x.inicio && x.fim ? ymDiff(x.inicio, x.fim) + 1 : '';
  $('#c-div').value = x ? x.div || 'padrao' : pre.div || 'padrao'; $('#c-pct').value = x && x.pctA != null ? x.pctA : 50;
  $('#c-mor').checked = x ? !!x.moradia : false;
  resetDel($('#c-del'), !x); $('#c-err').hidden = true; tipoLbl(); $('#dlg').showModal();
}
const resetDel = (b, hide) => { b.hidden = hide; b.textContent = 'Excluir'; b.dataset.sure = ''; };
const sure = b => { if (!b.dataset.sure) { b.dataset.sure = '1'; b.textContent = 'Confirmar exclusão'; return false; } return true; };
function tipoLbl() {
  const casa = $('#c-tipo').value === 'casa', q = $('#c-quando').value, c = cfg();
  $('#c-pag-l').textContent = casa ? 'Quem paga' : 'De quem é';
  $('#c-div-f').hidden = !casa; $('#c-pct-f').hidden = !casa || $('#c-div').value !== 'pct'; $('#c-pct-l').textContent = `Parte de ${c.nomes.a} (%)`;
  $('#c-parc-f').hidden = q !== 'parcelas';
  $('#c-inicio-l').textContent = q === 'unico' ? 'Em qual mês' : q === 'parcelas' ? 'Mês da primeira parcela' : 'A partir de (vazio = já vale)';
}
$('#c-tipo').onchange = $('#c-quando').onchange = $('#c-div').onchange = tipoLbl;
$('#c-del').onclick = e => { if (!sure(e.currentTarget)) return; const id = S.editing; mutate(d => { delete d.contas[id]; }, 'Conta excluída'); $('#dlg').close(); };
$('#fconta').onsubmit = e => {
  e.preventDefault();
  const nome = $('#c-nome').value.trim(), valor = inMoney($('#c-valor').value), dia = parseInt($('#c-dia').value, 10) || 0, err = $('#c-err');
  const msg = !nome ? 'Dê um nome para a conta.' : !(valor > 0) ? 'Informe um valor maior que zero, como 1.250,00.' : (dia < 0 || dia > 31) ? 'O dia do vencimento vai de 1 a 31.' : '';
  if (msg) { err.textContent = msg; err.hidden = false; return; }
  const q = $('#c-quando').value, ini = $('#c-inicio').value, np = parseInt($('#c-parc').value, 10) || 0, id = S.editing, okYm = /^\d{4}-\d{2}$/.test(ini);
  const casa = $('#c-tipo').value === 'casa', div = casa ? $('#c-div').value : 'padrao', pctA = parseFloat($('#c-pct').value);
  const m2 = q === 'parcelas' && !(np >= 1 && np <= 600) ? 'Informe o número de parcelas.' : q === 'parcelas' && !okYm ? 'Informe o mês da primeira parcela.' : div === 'pct' && !(pctA >= 0 && pctA <= 100) ? 'O percentual vai de 0 a 100.' : '';
  if (m2) { err.textContent = m2; err.hidden = false; return; }
  const data = { nome, valor, dia, tipo: $('#c-tipo').value, pagador: $('#c-pag').value, moradia: $('#c-mor').checked, recorrente: q !== 'unico', mes: q === 'unico' ? (okYm ? ini : S.ym) : null,
    inicio: q !== 'unico' && okYm ? ini : null, fim: q === 'parcelas' ? ymAdd(ini, np - 1) : null, div, pctA: div === 'pct' ? pctA : null };
  mutate(d => { d.contas[id || uid()] = data; }, 'Conta salva'); $('#dlg').close();
};

/* ---------- cartão ---------- */
function openCard(id) {
  const x = id ? D.cartoes[id] : null; if (id && !x) return; S.editing = id || null;
  $('#k-t').textContent = x ? 'Editar cartão' : 'Novo cartão';
  $('#k-nome').value = x ? x.nome : ''; $('#k-limite').value = x ? money(x.limite) : ''; $('#k-dia').value = x && x.dia || ''; $('#k-fech').value = x && x.fech || '';
  $('#k-tipo').value = x ? x.tipo : 'casa'; fillPessoas($('#k-dono')); $('#k-dono').value = x ? x.dono : S.eu; $('#k-cor').value = x ? x.cor : 'grafite';
  resetDel($('#k-del'), !x); $('#k-err').hidden = true; $('#dcard').showModal();
}
$('#k-del').onclick = e => { if (!sure(e.currentTarget)) return; const id = S.editing;
  mutate(d => { delete d.cartoes[id]; delete d.fatManual[id]; for (const [k, l] of Object.entries(d.lanc)) if (l.cartao === id) delete d.lanc[k]; }, 'Cartão e faturas excluídos'); $('#dcard').close(); };
$('#fcard').onsubmit = e => {
  e.preventDefault();
  const nome = $('#k-nome').value.trim(), limite = inMoney($('#k-limite').value), dia = parseInt($('#k-dia').value, 10) || 0, fech = parseInt($('#k-fech').value, 10) || 0, err = $('#k-err');
  const msg = !nome ? 'Dê um nome para o cartão.' : isNaN(limite) ? 'Confira o limite: use números como 8.000,00.' : (dia < 1 || dia > 31) ? 'Informe o dia do vencimento, de 1 a 31.' : (fech < 0 || fech > 31) ? 'O dia do fechamento vai de 1 a 31.' : '';
  if (msg) { err.textContent = msg; err.hidden = false; return; }
  const id = S.editing, old = id && D.cartoes[id], data = { ...(old ? { div: old.div, pctA: old.pctA } : {}), nome, limite, dia, fech, tipo: $('#k-tipo').value, dono: $('#k-dono').value, cor: $('#k-cor').value };
  mutate(d => { d.cartoes[id || uid()] = data; }, 'Cartão salvo'); $('#dcard').close();
};

/* ---------- reserva e financiamento ---------- */
function openRes(id) {
  const x = id ? D.reservas[id] : null; if (id && !x) return; S.editing = id || null; const c = cfg();
  $('#r-t').textContent = x ? 'Editar reserva' : 'Nova reserva'; $('#r-nome').value = x ? x.nome : ''; $('#r-saldo').value = x ? money(x.saldo) : ''; $('#r-meta').value = x ? money(x.meta) : '';
  $('#r-a-l').textContent = `${c.nomes.a} guarda por mês (R$)`; $('#r-b-l').textContent = `${c.nomes.b} guarda por mês (R$)`;
  $('#r-a').value = x ? money((x.aporte || {}).a) : ''; $('#r-b').value = x ? money((x.aporte || {}).b) : '';
  resetDel($('#r-del'), !x); $('#r-err').hidden = true; $('#dres').showModal();
}
$('#r-del').onclick = e => { if (!sure(e.currentTarget)) return; const id = S.editing; mutate(d => { delete d.reservas[id]; }, 'Reserva excluída'); $('#dres').close(); };
$('#fres').onsubmit = e => {
  e.preventDefault(); const nome = $('#r-nome').value.trim(), v = ['saldo', 'meta', 'a', 'b'].map(k => inMoney($('#r-' + k).value)), err = $('#r-err');
  const msg = !nome ? 'Dê um nome para a reserva.' : v.some(isNaN) ? 'Confira os valores: use números como 5.000,00.' : '';
  if (msg) { err.textContent = msg; err.hidden = false; return; }
  const id = S.editing; mutate(d => { d.reservas[id || uid()] = { nome, saldo: v[0], meta: v[1], aporte: { a: v[2], b: v[3] } }; }, 'Reserva salva'); $('#dres').close();
};
function openFin(id) {
  const x = id ? D.financ[id] : null; if (id && !x) return; S.editing = id || null;
  $('#f-t').textContent = x ? 'Editar financiamento' : 'Novo financiamento'; $('#f-nome').value = x ? x.nome : ''; $('#f-saldo').value = x ? money(x.saldo) : ''; $('#f-base').value = x ? x.base : S.ym; $('#f-prim').value = x ? x.primeira || x.base : ymAdd(S.ym, 1);
  $('#f-taxa').value = x ? String(x.taxa).replace('.', ',') : ''; $('#f-unid').value = x ? x.unid : 'aa'; $('#f-sis').value = x ? x.sistema : 'sac'; $('#f-prazo').value = x ? x.prazo : ''; $('#f-extra').value = x ? money(x.extraMensal) : '';
  $('#f-dia').value = x && x.dia || ''; fillPessoas($('#f-pag')); $('#f-pag').value = x && x.pagador || S.eu; $('#f-tipo').value = x && x.tipo || 'casa'; $('#f-div').value = x && x.div || 'igual';
  $('#f-boleto').value = x ? money(x.boleto) : ''; $('#f-mor').checked = !!(x && x.moradia); $('#f-gerar').checked = !x || x.gerar !== false;
  resetDel($('#f-del'), !x); $('#f-err').hidden = true; $('#dfin').showModal();
}
$('#f-del').onclick = e => { if (!sure(e.currentTarget)) return; const id = S.editing; mutate(d => { delete d.financ[id]; }, 'Financiamento excluído'); $('#dfin').close(); };
$('#ffin').onsubmit = e => {
  e.preventDefault(); const nome = $('#f-nome').value.trim(), saldo = inMoney($('#f-saldo').value), taxa = Parse.num($('#f-taxa').value.replace('%', '')), prazo = parseInt($('#f-prazo').value, 10) || 0, extra = inMoney($('#f-extra').value), boleto = inMoney($('#f-boleto').value), dia = parseInt($('#f-dia').value, 10) || 0, base = $('#f-base').value, prim = $('#f-prim').value, err = $('#f-err');
  const msg = !nome ? 'Dê um nome, como “Financiamento da casa”.' : !(saldo > 0) ? 'Informe o saldo devedor atual.' : !(taxa >= 0 && taxa < 100) ? 'Informe a taxa de juros, como 9,5.' : !(prazo >= 1 && prazo <= 600) ? 'Informe quantas parcelas faltam.' : !/^\d{4}-\d{2}$/.test(base) ? 'Informe o mês do saldo.' : !/^\d{4}-\d{2}$/.test(prim) ? 'Informe o mês em que vence a próxima parcela.' : isNaN(extra) ? 'Confira o valor da amortização mensal.' : isNaN(boleto) ? 'Confira o valor do boleto.' : (dia < 0 || dia > 31) ? 'O dia do vencimento vai de 1 a 31.' : '';
  if (msg) { err.textContent = msg; err.hidden = false; return; }
  const id = S.editing; mutate(d => { const old = id && d.financ[id]; d.financ[id || uid()] = { nome, saldo, base, primeira: prim, taxa, unid: $('#f-unid').value, sistema: $('#f-sis').value, prazo, extraMensal: extra, dia, pagador: $('#f-pag').value, tipo: $('#f-tipo').value, div: $('#f-div').value, boleto, moradia: $('#f-mor').checked, gerar: $('#f-gerar').checked, amort: (old && old.amort) || [] }; }, 'Financiamento salvo'); $('#dfin').close();
};

/* ---------- importação ---------- */
// Em qual mês a fatura vence, pelas datas das compras: fecha depois da última compra e vence no próximo dia de vencimento.
function vencFatura(card, items) {
  const ds = items.filter(x => x.on && x.valor < 0 && !x.parc).map(x => x.data).concat(items.filter(x => x.on && x.valor < 0).map(x => x.data)).sort();
  const reg = items.filter(x => x.on && x.valor < 0 && !x.parc).map(x => x.data).sort(), last = (reg.length ? reg : ds)[(reg.length ? reg : ds).length - 1];
  if (!card || !last) return null;
  const [y, m, d] = last.split('-').map(Number), venc = +card.dia || 1, fech = +card.fech || 0;
  let t = fech ? Date.UTC(y, m - 1 + (d > fech ? 1 : 0), fech) : Date.UTC(y, m - 1, d) + 4 * 864e5;   // sem fechamento informado: supõe ao menos 4 dias até vencer
  const c = new Date(t + 864e5); let vy = c.getUTCFullYear(), vm = c.getUTCMonth() + 1; if (c.getUTCDate() > venc) { vm++; if (vm > 12) { vm = 1; vy++; } }
  return vy + '-' + String(vm).padStart(2, '0');
}
function autoFatura() { if (W.dest !== 'cartao' || W.fatFixa || !W.kind) return; const v = vencFatura(D.cartoes[W.cartao], W.items); if (v) { W.fatura = v; W.fatAuto = true; } }
const pkey = x => Parse.norm(x.parc.base) + '|' + Math.abs(x.valor).toFixed(2) + '|' + x.parc.n;
let W = null;
function openImp(dest) {
  W = { dest: dest || 'extrato', kind: null, name: '', ofx: [], t: null, map: {}, pessoa: S.eu, cartao: Object.keys(D.cartoes)[0] || '', fatura: S.ym, items: [], skipped: 0, proj: true };
  $('#i-file').value = ''; $('#i-err').hidden = true; renderImp(); $('#dimp').showModal();
}
function impErr(t) { const e = $('#i-err'); e.textContent = t || ''; e.hidden = !t; }
async function readFile(f) {
  impErr(''); W.kind = null; W.items = []; W.name = f.name;
  try {
    const buf = await f.arrayBuffer(), ext = (f.name.split('.').pop() || '').toLowerCase();
    if (ext === 'xlsx' || ext === 'xls') {
      const wb = XLSX.read(buf, { type: 'array', cellDates: true }), ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' }).filter(r => r.some(c => c !== '' && c != null));
      W.t = Parse.table(rows); W.kind = 'table';
    } else {
      const text = Parse.decode(buf);
      if (ext === 'ofx' || ext === 'qfx' || /<OFX>|<STMTTRN>/i.test(text)) { W.ofx = Parse.ofx(text); W.kind = 'ofx'; if (!W.ofx.length) throw new Error('vazio'); }
      else { W.t = Parse.table(Parse.csv(text)); W.kind = 'table'; }
    }
    if (W.kind === 'table') { if (!W.t.rows.length) throw new Error('vazio'); W.map = Parse.guess(W.t); }
  } catch (e) { W.kind = null; impErr('Não consegui ler este arquivo. Confira se é um OFX, CSV ou Excel baixado do banco e se tem lançamentos.'); }
  buildItems(); autoFatura(); renderImp();
}
function buildItems() {
  W.items = []; W.skipped = 0; if (!W.kind) return;
  const ano = +S.ym.slice(0, 4), m = W.map, c = cfg(); let raw = [];
  if (W.kind === 'ofx') raw = W.ofx.map(x => W.dest === 'contas' ? { desc: x.desc, valor: Math.abs(x.valor), dia: +x.data.slice(8), pagador: W.pessoa } : { ...x });
  else for (const r of W.t.rows) {
    if (W.dest === 'contas') {
      const nome = String(r[m.desc] ?? '').trim(), v = Math.abs(Parse.num(r[m.valor]));
      if (!nome || !(v > 0) || /^(sub)?total/i.test(nome)) { W.skipped++; continue; }
      let dia = 0; if (m.dia >= 0) { const cell = r[m.dia], d = Parse.date(cell, ano); dia = d ? +d.slice(8) : (parseInt(cell, 10) || 0); if (dia < 1 || dia > 31) dia = 0; }
      let pag = W.pessoa; if (m.quem >= 0) { const qn = Parse.norm(r[m.quem] ?? ''); if (qn && qn.includes(Parse.norm(c.nomes.b))) pag = 'b'; else if (qn && qn.includes(Parse.norm(c.nomes.a))) pag = 'a'; }
      raw.push({ desc: nome.slice(0, 60), valor: r2(v), dia, pagador: pag });
    } else {
      const data = Parse.date(r[m.data], ano), valor = Parse.num(r[m.valor]), desc = String(r[m.desc] ?? '').trim() || 'Sem descrição';
      if (!data || isNaN(valor) || valor === 0) { W.skipped++; continue; }
      raw.push({ data, desc: desc.slice(0, 120), valor: r2(valor) });
    }
  }
  // Fatura: bancos exportam compra ora positiva, ora negativa. Guardamos gasto como negativo.
  if (W.dest === 'cartao' && raw.filter(x => x.valor > 0).length > raw.length / 2) raw.forEach(x => x.valor = -x.valor);
  W.items = raw.map(x => ({ ...x, on: !(W.dest === 'cartao' && x.valor > 0 && /pagamento/i.test(x.desc)), parc: W.dest === 'cartao' && x.valor < 0 ? Parse.parcela(x.desc) : null }));
}
function renderImp() {
  const c = cfg(), cards = Object.entries(D.cartoes);
  document.querySelectorAll('#i-dest button').forEach(b => b.classList.toggle('on', b.dataset.dest === W.dest));
  const pes = lbl => `<div class="f"><label for="i-pessoa">${lbl}</label><select id="i-pessoa">${['a', 'b'].map(p => `<option value="${p}" ${W.pessoa === p ? 'selected' : ''}>${esc(c.nomes[p])}</option>`).join('')}</select></div>`;
  const col = (k, lbl, opt) => `<div class="f"><label for="m-${k}">${lbl}</label><select id="m-${k}" data-map="${k}">${opt ? '<option value="-1">(não tem)</option>' : ''}${W.t.header.map((h, i) => `<option value="${i}" ${W.map[k] === i ? 'selected' : ''}>${esc(h)}</option>`).join('')}</select></div>`;
  let o = '';
  if (W.dest === 'extrato') o += pes('De quem é a conta bancária');
  if (W.dest === 'cartao') o += cards.length ? `<div class="f"><label for="i-cartao">Cartão</label><select id="i-cartao">${cards.map(([id, x]) => `<option value="${esc(id)}" ${W.cartao === id ? 'selected' : ''}>${esc(x.nome)}</option>`).join('')}</select></div><div class="f"><label for="i-fatura">Fatura que vence em</label><input type="month" id="i-fatura" value="${esc(W.fatura)}"></div><label class="ck"><input type="checkbox" id="i-proj" ${W.proj ? 'checked' : ''}> Lançar as parcelas que faltam nas próximas faturas</label>${W.fatAuto ? `<div class="sub">Vencimento em <b>${String(D.cartoes[W.cartao].dia || 1).padStart(2, '0')}/${W.fatura.slice(5)}/${W.fatura.slice(0, 4)}</b>, calculado pelas datas das compras. Ajuste o mês se não bater.</div>` : ''}` : `<div class="err">Cadastre o cartão primeiro, na tela Cartões.</div>`;
  if (W.dest === 'contas') o += pes('Quem paga (quando a planilha não diz)');
  if (W.kind === 'table') o += W.dest === 'contas' ? col('desc', 'Coluna do nome') + col('valor', 'Coluna do valor') + col('dia', 'Coluna do vencimento', 1) + col('quem', 'Coluna de quem paga', 1) : col('data', 'Coluna da data') + col('desc', 'Coluna da descrição') + col('valor', 'Coluna do valor');
  $('#i-opts').innerHTML = `<div class="opts">${o}</div>`;
  const n = W.items.filter(x => x.on).length, okCard = W.dest !== 'cartao' || (cards.length && /^\d{4}-\d{2}$/.test(W.fatura));
  $('#i-go').disabled = !n || !okCard; $('#i-go').textContent = n ? `Importar ${n} ${n === 1 ? 'item' : 'itens'}` : 'Importar';
  const pcs = W.dest === 'cartao' ? W.items.filter(x => x.on && x.parc) : [], fut = pcs.reduce((t, x) => t + x.parc.n - x.parc.k, 0);
  $('#i-info').textContent = W.kind ? `${W.items.length} linhas lidas${W.skipped ? ` · ${W.skipped} ignoradas (sem data ou valor)` : ''}${pcs.length ? ` · ${pcs.length} parceladas${W.proj && fut ? `, ${fut} parcelas futuras serão lançadas` : ''}` : ''}` : '';
  if (!W.kind) { $('#i-prev').innerHTML = `<p class="sub" style="margin:0">${W.dest === 'contas' ? 'Use a planilha em que vocês já anotam as contas: uma linha por conta, com nome e valor. Elas entram como contas da casa que se repetem todo mês; depois dá para ajustar cada uma.' : W.dest === 'cartao' ? 'Baixe a fatura no site ou app do banco em CSV ou OFX. Linhas de “pagamento recebido” vêm desmarcadas para não zerar a fatura.' : 'Baixe o extrato no site do banco em OFX (melhor) ou CSV. Lançamentos repetidos de uma importação anterior são ignorados.'}</p>`; return; }
  const rows = W.items.slice(0, 300).map((x, i) => `<tr class="${x.on ? '' : 'off'}"><td><input type="checkbox" data-item="${i}" ${x.on ? 'checked' : ''} aria-label="Incluir ${esc(x.desc)}"></td>${W.dest === 'contas' ? `<td class="w">${esc(x.desc)}</td><td>${x.dia || '—'}</td><td>${esc(c.nomes[x.pagador])}</td><td class="r">${brl(x.valor)}</td>` : `<td>${x.data.slice(8)}/${x.data.slice(5, 7)}/${x.data.slice(0, 4)}</td><td class="w">${esc(x.desc)}${x.parc ? ` <span class="tag">parcela ${x.parc.k} de ${x.parc.n}</span>` : ''}</td><td class="r">${brl(W.dest === 'cartao' ? -x.valor : x.valor)}</td>`}</tr>`).join('');
  $('#i-prev').innerHTML = `<div class="tbl"><table><thead><tr><th></th>${W.dest === 'contas' ? '<th>Conta</th><th>Dia</th><th>Quem paga</th><th class="r">Valor</th>' : `<th>Data</th><th>Descrição</th><th class="r">${W.dest === 'cartao' ? 'Compra' : 'Valor'}</th>`}</tr></thead><tbody>${rows}</tbody></table></div>${W.items.length > 300 ? `<p class="sub">Mostrando as 300 primeiras de ${W.items.length} linhas; todas as marcadas serão importadas.</p>` : ''}`;
}
$('#i-file').onchange = e => { const f = e.target.files[0]; if (f) readFile(f); };
$('#dimp').addEventListener('change', e => {
  const t = e.target;
  if (t.dataset.item) { W.items[+t.dataset.item].on = t.checked; renderImp(); return; }
  if (t.id === 'i-file') return;
  if (t.id === 'i-pessoa') W.pessoa = t.value; else if (t.id === 'i-cartao') { W.cartao = t.value; autoFatura(); } else if (t.id === 'i-fatura') { W.fatura = t.value; W.fatFixa = true; W.fatAuto = false; } else if (t.id === 'i-proj') { W.proj = t.checked; renderImp(); return; } else if (t.dataset.map) W.map[t.dataset.map] = +t.value;
  if (t.id !== 'i-fatura' && t.id !== 'i-cartao') buildItems(); renderImp();
});
$('#i-dest').onclick = e => { const b = e.target.closest('[data-dest]'); if (!b) return; W.dest = b.dataset.dest; buildItems(); autoFatura(); renderImp(); };
$('#i-go').onclick = () => {
  const w = W, items = w.items.filter(x => x.on); $('#dimp').close();
  mutate(d => {
    if (w.dest === 'contas') { for (const x of items) d.contas[uid()] = { nome: x.desc, valor: x.valor, dia: x.dia, tipo: 'casa', pagador: x.pagador, moradia: false, recorrente: true, mes: null }; return `${items.length} contas importadas. Confira em Nossa casa.`; }
    const card = d.cartoes[w.cartao]; if (w.dest === 'cartao' && !card) return 'O cartão não existe mais. Nada foi importado.';
    const pre = w.dest === 'cartao' ? 'k:' + w.cartao + ':' : 'c:' + w.pessoa + ':', have = new Set(Object.values(d.lanc).map(l => l.chave)), seen = {}, novos = []; let dup = 0;
    for (const x of items) {
      const base = pre + (x.fitid ? 'f:' + x.fitid : x.data + '|' + x.valor + '|' + x.desc); seen[base] = (seen[base] || 0) + 1; const chave = base + '#' + seen[base];
      if (have.has(chave)) { dup++; continue; }
      const l = { data: x.data, desc: x.desc, valor: x.valor, chave, origem: w.dest === 'cartao' ? 'cartao' : 'conta', pessoa: w.dest === 'cartao' ? card.dono : w.pessoa };
      if (w.dest === 'cartao') { l.cartao = w.cartao; l.fatura = w.fatura;
        if (x.parc) { l.parc = { k: x.parc.k, n: x.parc.n }; l.pbase = pkey(x); l.pkey = l.pbase + '|' + x.parc.k;
          // a parcela real substitui a que tinha sido prevista por uma fatura anterior
          for (const [id, o] of Object.entries(d.lanc)) if (o.prev && o.cartao === w.cartao && o.pkey === l.pkey) delete d.lanc[id]; } }
      d.lanc[uid()] = l; novos.push(l);
    }
    let prev = 0;
    if (w.dest === 'cartao' && w.proj) { const tem = new Set(Object.values(d.lanc).filter(o => o.cartao === w.cartao && o.pkey).map(o => o.pkey));
      for (const l of novos) { if (!l.parc) continue; const base = Parse.parcela(l.desc).base;
        for (let k = l.parc.k + 1; k <= l.parc.n; k++) { const key = l.pbase + '|' + k; if (tem.has(key)) continue; tem.add(key);
          d.lanc[uid()] = { data: l.data, desc: `${base} · parcela ${k}/${l.parc.n}`, valor: l.valor, chave: 'p:' + key, origem: 'cartao', pessoa: l.pessoa, cartao: w.cartao, fatura: ymAdd(w.fatura, k - l.parc.k), parc: { k, n: l.parc.n }, pbase: l.pbase, pkey: key, prev: true }; prev++; } } }
    // Extrato: débito com valor idêntico ao de uma única conta em aberto do mês marca a conta como paga.
    let pagas = 0;
    if (w.dest === 'extrato') for (const l of novos) {
      if (l.valor >= 0) continue; const ym = l.data.slice(0, 7), mes = mesDe(d, ym);
      const cand = bills(ym).filter(b => !mes.pagas[b.id] && Math.abs(b.valor + l.valor) < .005);
      if (cand.length === 1) { l.conta = cand[0].id; mes.pagas[cand[0].id] = true; pagas++; }
    }
    return `${novos.length} lançamentos importados` + (prev ? ` · ${prev} parcelas futuras lançadas nas próximas faturas` : '') + (dup ? ` · ${dup} já existiam` : '') + (pagas ? ` · ${pagas} ${pagas === 1 ? 'conta marcada' : 'contas marcadas'} como paga` : '');
  });
};

/* ---------- eventos gerais ---------- */
document.addEventListener('submit', e => {
  if (e.target.id !== 'fcfg') return; e.preventDefault();
  const g = id => $('#' + id).value, err = $('#cfg-err'), v = { sa: inMoney(g('s-a')), sb: inMoney(g('s-b')), da: inMoney(g('d-a')), db: inMoney(g('d-b')) };
  if (Object.values(v).some(isNaN)) { err.textContent = 'Confira os valores: use números como 5.200,00.'; err.hidden = false; return; }
  const data = { nomes: { a: g('n-a').trim() || DEF.nomes.a, b: g('n-b').trim() || DEF.nomes.b }, salarios: { a: v.sa, b: v.sb }, diaadia: { a: v.da, b: v.db }, divisao: g('divisao'), pctA: Math.min(100, Math.max(0, parseFloat(g('pctA')) || 50)) };
  if (document.activeElement) document.activeElement.blur();
  mutate(d => { d.config = data; }, 'Renda e divisão salvas');
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.id === 'divisao') $('#pct-f').hidden = t.value !== 'custom';
  if (t.dataset.divtog) { const id = t.dataset.divtog, tipo = t.checked ? 'casa' : 'pessoal';
    mutate(d => { const o = alvo(d, id); if (o) o.tipo = tipo; }, tipo === 'casa' ? 'Conta marcada como dividida' : 'Conta marcada como pessoal'); return; }
  if (t.dataset.divsel) { const id = t.dataset.divsel, v = t.value; if (v === 'pct') return; if (v === 'editar') { render(true); openConta(id); $('#c-div').value = 'pct'; tipoLbl(); return; }
    mutate(d => { const o = alvo(d, id); if (o) { o.div = v; o.pctA = null; } }, 'Divisão atualizada'); return; }
  if (t.dataset.link) { const id = t.dataset.link, alvo = t.value;
    mutate(d => { const l = d.lanc[id]; if (!l) return; const mes = mesDe(d, l.data.slice(0, 7)); if (l.conta) delete mes.pagas[l.conta]; if (alvo) { l.conta = alvo; mes.pagas[alvo] = true; } else delete l.conta; }, alvo ? 'Conta marcada como paga' : 'Vínculo removido'); }
});
async function pick(mode) { const r = await store.pick(mode); if (r.canceled) return; await load(); S.ready = true; render(true); }
document.addEventListener('click', e => {
  if (e.target.closest('[data-close]')) { e.target.closest('dialog').close(); return; }
  const t = e.target.closest('[data-eu],[data-pagar],[data-edit],[data-dia],[data-mor],[data-act],[data-go],[data-tema],[data-fluxo],[data-del],[data-kedit],[data-fman],[data-fauto],[data-wipe],[data-delconta],[data-redit],[data-fedit],[data-aporte],[data-amadd],[data-amdel],[data-amfeita],[data-delextra]'); if (!t) return; const d = t.dataset;
  if (d.eu) { S.eu = d.eu; ls.set('eu', S.eu); render(true); }
  else if (d.tema) { const cur = document.documentElement.dataset.theme; if (cur === d.tema) { delete document.documentElement.dataset.theme; ls.set('tema', ''); } else { document.documentElement.dataset.theme = d.tema; ls.set('tema', d.tema); } render(); }
  else if (d.pagar) { const id = d.pagar, ym = S.ym; mutate(x => { const m = mesDe(x, ym); if (m.pagas[id]) delete m.pagas[id]; else m.pagas[id] = true; }); }
  else if (d.edit) openConta(d.edit);
  else if (d.kedit) openCard(d.kedit);
  else if (d.go) location.hash = d.go;
  else if (d.dia !== undefined) { S.dia = +d.dia || null; render(); }
  else if (d.mor) { S.mor = d.mor; render(); }
  else if (d.fluxo) { S.fluxo = d.fluxo; render(); }
  else if (d.del) { if (S.confirm !== 'del:' + d.del) { S.confirm = 'del:' + d.del; render(); return; } S.confirm = null; const id = d.del;
    mutate(x => { const l = x.lanc[id]; if (l && l.conta) delete mesDe(x, l.data.slice(0, 7)).pagas[l.conta]; delete x.lanc[id]; }, 'Lançamento excluído'); }
  else if (d.fman) { const id = d.fman, v = inMoney($('#fm-' + id).value), ym = S.ym; if (isNaN(v)) { toast('Confira o valor: use números como 1.250,00.'); return; } mutate(x => { (x.fatManual[id] = x.fatManual[id] || {})[ym] = v; }, 'Valor da fatura salvo'); }
  else if (d.fauto) { const id = d.fauto, ym = S.ym; mutate(x => { if (x.fatManual[id]) delete x.fatManual[id][ym]; }, 'Fatura voltou à soma importada'); }
  else if (d.act === 'acerto') { const ym = S.ym; mutate(x => { const m = mesDe(x, ym); m.acerto = !m.acerto; }); }
  else if (d.delconta) { if (S.confirm !== 'conta:' + d.delconta) { S.confirm = 'conta:' + d.delconta; render(); return; } S.confirm = null; const id = d.delconta; mutate(x => { delete x.contas[id]; }, 'Conta excluída'); }
  else if (d.wipe) { if (S.confirm !== 'wipe:' + d.wipe) { S.confirm = 'wipe:' + d.wipe; render(); return; } S.confirm = null; const w = d.wipe, ym = S.ym, fl = S.fluxo;
    mutate(x => {
      const limpaVinc = () => { for (const m of Object.values(x.meses)) m.pagas = {}; };
      const tira = f => { for (const [k, l] of Object.entries(x.lanc)) if (f(l)) { if (l.conta) delete mesDe(x, l.data.slice(0, 7)).pagas[l.conta]; delete x.lanc[k]; } };
      if (w === 'mes') { tira(l => l.origem === 'conta' && l.data.startsWith(ym) && (fl === 'todos' || l.pessoa === fl)); return 'Lançamentos do mês apagados'; }
      if (w === 'extratos') { tira(l => l.origem === 'conta'); return 'Lançamentos de extrato apagados'; }
      if (w === 'faturas') { tira(l => l.origem === 'cartao'); x.fatManual = {}; return 'Faturas apagadas'; }
      if (w === 'contas') { x.contas = {}; limpaVinc(); for (const l of Object.values(x.lanc)) delete l.conta; return 'Contas apagadas'; }
      if (w === 'tudo') { for (const k of Object.keys(x)) delete x[k]; Object.assign(x, vazio()); return 'Tudo apagado. O arquivo está zerado.'; }
    }); }
  else if (d.act === 'futura') openConta(null, { titulo: 'Lançar conta futura', quando: 'unico', inicio: ymAdd(S.ym, 1) });
  else if (d.act === 'nova-pessoal') openConta(null, { titulo: 'Nova conta pessoal', tipo: 'pessoal' });
  else if (d.delextra) { const id = d.delextra; mutate(x => { delete x.extras[id]; }, 'Recebimento excluído'); }
  else if (d.act === 'add-extra') { const nome = $('#x-nome').value.trim(), valor = inMoney($('#x-valor').value), mes = $('#x-mes').value, pessoa = $('#x-pessoa').value;
    if (!nome || !(valor > 0) || !/^\d{4}-\d{2}$/.test(mes)) { toast('Informe descrição, valor maior que zero e o mês.'); return; }
    if (document.activeElement) document.activeElement.blur();
    mutate(x => { x.extras[uid()] = { nome, valor, mes, pessoa }; }, `Recebimento de ${brl(valor)} lançado em ${ymCurto(mes)}`); }
  else if (d.act === 'check-upd') { if (store.checkUpdate) store.checkUpdate().then(r => { S.upd = r; render(); }); }
  else if (d.act === 'atualizar') store.installUpdate && store.installUpdate();
  else if (d.act === 'nova-dividida') openConta(null, { titulo: 'Nova conta dividida', div: 'igual' });
  else if (d.redit) openRes(d.redit);
  else if (d.fedit) openFin(d.fedit);
  else if (d.act === 'nova-reserva') openRes();
  else if (d.act === 'novo-fin') openFin();
  else if (d.aporte) { const id = d.aporte, ym = S.ym; mutate(x => { const r = x.reservas[id]; if (!r) return; const m = mesDe(x, ym); m.aportes = m.aportes || {};
    if (m.aportes[id] != null) { r.saldo = r2((+r.saldo || 0) - m.aportes[id]); delete m.aportes[id]; return 'Aporte desfeito'; }
    const v = r2((+(r.aporte || {}).a || 0) + (+(r.aporte || {}).b || 0)); r.saldo = r2((+r.saldo || 0) + v); m.aportes[id] = v; return `${brl(v)} somados à reserva`; }); }
  else if (d.amadd) { const id = d.amadd, ym = $('#am-ym-' + id).value, v = inMoney($('#am-v-' + id).value), ef = $('#am-e-' + id).value;
    if (!/^\d{4}-\d{2}$/.test(ym) || !(v > 0)) { toast('Informe o mês e um valor maior que zero.'); return; }
    mutate(x => { const f = x.financ[id]; if (!f) return; (f.amort = f.amort || []).push({ ym, valor: v, efeito: ef }); }, 'Amortização adicionada ao plano'); }
  else if (d.amfeita) { const [id, ix] = d.amfeita.split('|'); mutate(x => { const a = x.financ[id] && (x.financ[id].amort || [])[+ix]; if (!a) return; a.feita = !a.feita; return a.feita ? 'Amortização feita: o saldo devedor diminuiu' : 'Amortização voltou a ser só planejada'; }); }
  else if (d.amdel) { const [id, ix] = d.amdel.split('|'); mutate(x => { const f = x.financ[id]; if (f && f.amort) f.amort.splice(+ix, 1); }, 'Amortização removida'); }
  else if (d.act === 'novo-cartao') openCard();
  else if (d.act === 'importar') openImp('extrato');
  else if (d.act === 'novo') pick('new');
  else if (d.act === 'abrir') pick('open');
  else if (d.act === 'reveal') store.reveal();
  else if (d.act === 'recarregar') load().then(() => render(true));
});
$('#add').onclick = () => openConta();
$('#imp').onclick = () => openImp(S.view === 'cartoes' ? 'cartao' : S.view === 'casa' ? 'contas' : 'extrato');
$('#prev').onclick = () => { S.ym = ymAdd(S.ym, -1); S.dia = null; S.confirm = null; render(true); };
$('#next').onclick = () => { S.ym = ymAdd(S.ym, 1); S.dia = null; S.confirm = null; render(true); };
function route() { const h = location.hash.slice(1); S.view = ['visao', 'fluxo', 'cartoes', 'casa', 'reserva', 'financ', 'renda', 'dados'].includes(h) ? h : 'visao'; S.confirm = null; render(true); }
addEventListener('hashchange', route);

const tema = ls.get('tema'); if (tema === 'light' || tema === 'dark') document.documentElement.dataset.theme = tema;
route();
if (store.onUpdateState) store.onUpdateState(u => { S.upd = u; if (u.state === 'ready') S.update = true; if (S.view === 'dados' || u.state === 'ready') render(); });
if (store.onUpdate) { store.onUpdate(() => { S.update = true; render(); }); store.updateStatus().then(r => { if (r) { S.update = true; render(); } }); store.version().then(v => { S.versao = v; }); }
store.onChanged(() => { q = q.then(load).then(() => render()); });
load().then(() => { S.ready = true; render(true); }, () => { S.ready = true; S.loadErr = 'read'; render(true); });
