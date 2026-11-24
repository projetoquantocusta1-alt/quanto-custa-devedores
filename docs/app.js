/* Quanto Custa — Devedores da União */
(() => {
"use strict";
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const E = { r: null, emp: null, est: null, meta: null, pag: "inicio", graf: {}, ord: ["total", -1], lim: 50, uf: "", limU: 15, ordC: ["total", -1], limC: 50 };
const brl = (v, d = 0) => (v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: d, maximumFractionDigits: d });
const curto = (v) => { const a = Math.abs(v || 0), f = (x, n = 2) => x.toLocaleString("pt-BR", { maximumFractionDigits: n });
  if (a >= 1e12) return "R$ " + f(v / 1e12) + " tri";
  if (a >= 1e9) return "R$ " + f(v / 1e9, a >= 1e11 ? 0 : 1) + " bi";
  if (a >= 999_500) return "R$ " + f(v / 1e6, 1) + " mi";
  if (a >= 1e3) return "R$ " + f(v / 1e3, 0) + " mil";
  return brl(v); };
const nf = (v, d = 0) => (v || 0).toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const pct = (v, d = 1) => (v == null || !isFinite(v) ? "—" : nf(v, d) + "%");
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const semAcento = (s) => (s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const soma = (a) => a.reduce((s, x) => s + (x || 0), 0);
const getJSON = async (u) => { const r = await fetch(u, { cache: "no-cache" }); if (!r.ok) throw new Error(u + " " + r.status); return r.json(); };
const porExtenso = (v) => { const a = Math.abs(v || 0);
  for (const [b, um, varios] of [[1e12, "trilhão", "trilhões"], [1e9, "bilhão", "bilhões"], [1e6, "milhão", "milhões"]]) {
    if (a < b) continue; const x = v / b, t = x.toLocaleString("pt-BR", { maximumFractionDigits: Math.abs(x) < 10 ? 2 : Math.abs(x) < 100 ? 1 : 0 });
    return `≈ ${t} ${Math.abs(x) < 2 ? um : varios} de reais`; }
  return ""; };
const celular = () => innerWidth < 600;
const rotTri = (t) => { const m = /^(\d{4})_trimestre_(\d{2})$/.exec(t || ""); return m ? `${+m[2]}º trimestre de ${m[1]}` : t; };
const fimTri = (t) => { const m = /^(\d{4})_trimestre_(\d{2})$/.exec(t || ""); return m ? `${["31/03", "30/06", "30/09", "31/12"][+m[2] - 1]}/${m[1]}` : ""; };
const BASE_ROT = { sida: "Tributos e demais créditos", prev: "Previdência (INSS)", fgts: "FGTS" };
const BASE_COR = { sida: "#10243A", prev: "#2463A6", fgts: "#16865D" };
const SIT = ["cobranca", "negociada", "garantida", "suspensa", "outra"];
const SIT_ROT = { cobranca: "Em cobrança", negociada: "Parcelada ou negociada", garantida: "Com garantia", suspensa: "Suspensa na Justiça", outra: "Outras" };
const SIT_COR = { cobranca: "#C84C4C", negociada: "#16865D", garantida: "#2463A6", suspensa: "#D69A32", outra: "#8FA3B8" };
const UF_NOME = { AC: "Acre", AL: "Alagoas", AM: "Amazonas", AP: "Amapá", BA: "Bahia", CE: "Ceará", DF: "Distrito Federal", ES: "Espírito Santo", GO: "Goiás", MA: "Maranhão", MG: "Minas Gerais", MS: "Mato Grosso do Sul", MT: "Mato Grosso", PA: "Pará", PB: "Paraíba", PE: "Pernambuco", PI: "Piauí", PR: "Paraná", RJ: "Rio de Janeiro", RN: "Rio Grande do Norte", RO: "Rondônia", RR: "Roraima", RS: "Rio Grande do Sul", SC: "Santa Catarina", SE: "Sergipe", SP: "São Paulo", TO: "Tocantins", Outros: "Exterior ou sem estado" };
const V = (o, k) => (o && o[k] ? o[k][0] : 0), N = (o, k) => (o && o[k] ? o[k][1] : 0);

function kpis(el, itens) { $(el).innerHTML = itens.map(([r, v, o, cls]) => `<div class="kpi${cls ? " " + cls : ""}"><div class="rot">${r}</div><div class="val num">${v}</div><div class="obs">${o || ""}</div></div>`).join(""); }
function grafico(id, cfg) { E.graf[id]?.destroy(); E.graf[id] = new Chart($("#" + id), cfg); }
const eixoR = () => ({ ticks: { callback: (v) => curto(v), maxTicksLimit: celular() ? 4 : 7, maxRotation: 0 } });
const tip = (fmt) => ({ callbacks: { label: (c) => `${c.dataset.label ? c.dataset.label + ": " : ""}${fmt(c.parsed.x ?? c.parsed.y ?? c.parsed)}` } });
function barrasHTML(itens, total) {
  const mx = Math.max(...itens.map((x) => x.v), 1);
  return `<ul class="barras">${itens.map((x) => `<li><span class="b-rot">${esc(x.n)}${x.s ? `<small>${esc(x.s)}</small>` : ""}</span><span class="b-val num">${curto(x.v)} <small>${pct((100 * x.v) / total, 1)}</small></span>
    <span class="b-trilho"><i style="width:${(100 * x.v) / mx}%;background:${x.c}"></i></span></li>`).join("")}</ul>`;
}
const linhas = (o) => o.linhas.map((l) => Object.fromEntries(o.campos.map((c, i) => [c, l[i]])));
const split = (e) => `<span class="mini-split">${SIT.map((s) => (e[s] > 0 ? `<i style="width:${(100 * e[s]) / e.total}%;background:${SIT_COR[s]}" title="${SIT_ROT[s]}: ${curto(e[s])}"></i>` : "")).join("")}</span>`;
const legendaSit = () => SIT.slice(0, 4).map((s) => `<span style="--c:${SIT_COR[s]}">${SIT_ROT[s]}</span>`).join("");
const nomeCurto = (n, lim) => (n.length > lim ? n.slice(0, lim - 1) + "…" : n);

// ---------------------------------------------------------------- início
async function rInicio() {
  const R = E.r, tot = R.total[0], pj = V(R.pessoa, "pj"), pf = V(R.pessoa, "pf");
  $("#i-total").textContent = brl(tot); $("#i-ext").textContent = porExtenso(tot);
  $("#i-nota").innerHTML = `Dívida Ativa da União em ${fimTri(R.trimestre)} (${rotTri(R.trimestre)}) · ${nf(R.total[1])} dívidas inscritas · só o devedor principal de cada dívida`;
  $("#i-pj").textContent = curto(pj); $("#i-pj-ext").textContent = pct((100 * pj) / tot, 0) + " do total";
  $("#i-pf").textContent = curto(pf); $("#i-cob").textContent = curto(V(R.situacao, "cobranca")); $("#i-neg").textContent = curto(V(R.situacao, "negociada"));
  $("#i-imp-nota").textContent = "Estar na Dívida Ativa não quer dizer que o devedor não esteja pagando: parte está parcelada, garantida ou suspensa pela Justiça. A PGFN atualiza os dados a cada trimestre.";
  const c = R.concentracao || {};
  kpis("#i-kpis", [
    ["Empresas devedoras", nf(R.empresas_devedoras), "contadas pela raiz do CNPJ (matriz + filiais)"],
    ["Pessoas físicas devedoras", "≈ " + nf(R.pessoas_devedoras_aprox), "aproximado · nomes não são mostrados"],
    ["As 100 maiores empresas", pct(c["100"], 1), "do que todas as empresas devem", "kpi-alerta"],
    ["Já cobrada na Justiça", pct((100 * V(R.ajuizado, "sim")) / tot, 1), `${curto(V(R.ajuizado, "sim"))} em execução fiscal`]]);
  const top = linhas(E.r.top10 || E.emp);
  $("#i-top").innerHTML = top.map((e) => `<li><span><button class="link-dep" data-emp="${esc(e.raiz)}">${esc(e.nome)}</button><span class="s">${esc(e.uf)} · ${esc(e.cnpj)}</span>${split(e)}</span><span class="v">${curto(e.total)}</span></li>`).join("");
  const bs = Object.keys(BASE_ROT);
  grafico("g-i-base", { type: "doughnut", data: { labels: bs.map((b) => BASE_ROT[b]), datasets: [{ data: bs.map((b) => V(R.base, b)), backgroundColor: bs.map((b) => BASE_COR[b]) }] },
    options: { maintainAspectRatio: false, cutout: "58%", plugins: { legend: { position: "bottom" }, tooltip: { callbacks: { label: (x) => `${x.label}: ${curto(x.parsed)} (${pct((100 * x.parsed) / tot, 1)})` } } } } });
  $("#i-sit").innerHTML = barrasHTML(SIT.filter((s) => V(R.situacao, s) > 0).map((s) => ({ n: SIT_ROT[s], v: V(R.situacao, s), c: SIT_COR[s] })), tot);
}

// ---------------------------------------------------------------- empresas
const COLS = [["nome", "Empresa"], ["uf", "UF"], ["total", "Dívida total"], ["cobranca", "Em cobrança"], ["negociada", "Parcelada"], ["garantida", "Garantia"], ["suspensa", "Suspensa"], ["ajuizado", "Na Justiça"]];
async function carregarEmp() { if (!E.emp) E.emp = await getJSON("dados/empresas.json"); return E.emp; }
async function rEmpresas() {
  await carregarEmp();
  const R = E.r, L = linhas(E.emp), c = R.concentracao || {}, totPJ = V(R.pessoa, "pj");
  kpis("#e-kpis", [
    ["As 10 maiores", pct(c["10"], 1), "do que todas as empresas devem"], ["As 100 maiores", pct(c["100"], 1), "do total das empresas", "kpi-alerta"],
    ["As 1.000 maiores", pct(c["1000"], 1), `de ${nf(R.empresas_devedoras)} empresas devedoras`], ["Total das empresas", curto(totPJ), `${pct((100 * totPJ) / R.total[0], 0)} da Dívida Ativa`]]);
  const sel = $("#e-uf");
  if (sel.options.length === 1) sel.innerHTML += [...new Set(L.map((e) => e.uf).filter(Boolean))].sort().map((u) => `<option value="${u}">${esc(UF_NOME[u] || u)}</option>`).join("");
  $("#e-leg").innerHTML = legendaSit();
  tabela(L);
  const F = R.faixas || [], rot = (f) => (f.ate == null ? `acima de ${curto(f.de)}` : f.de === 0 ? `até ${curto(f.ate)}` : `${curto(f.de)} a ${curto(f.ate)}`);
  grafico("g-e-faixas", { type: "bar", data: { labels: F.map(rot), datasets: [{ label: "Empresas", data: F.map((f) => f.empresas), backgroundColor: "#2463A6" }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tip((v) => nf(v) + " empresas") }, scales: { x: { ticks: { maxRotation: 0, autoSkip: false, font: { size: celular() ? 9 : 11 }, callback(v) { const t = this.getLabelForValue(v); return celular() ? t.replace("R$ ", "") : t; } } } } } });
  grafico("g-e-faixas-v", { type: "bar", data: { labels: F.map(rot), datasets: [{ label: "Dívida", data: F.map((f) => f.valor), backgroundColor: "#C84C4C" }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tip(curto) }, scales: { y: eixoR(), x: { ticks: { maxRotation: 0, autoSkip: false, font: { size: celular() ? 9 : 11 }, callback(v) { const t = this.getLabelForValue(v); return celular() ? t.replace("R$ ", "") : t; } } } } } });
  $("#e-nota").textContent = `Mostramos as ${nf(L.length)} maiores empresas devedoras (${rotTri(R.trimestre)}). Para qualquer outra, consulte a Lista de Devedores da PGFN (link na Metodologia).`;
}
function tabela(L) {
  const q = semAcento($("#e-q").value.trim()), qd = q.replace(/\D/g, ""), uf = $("#e-uf").value, st = $("#e-sit").value, [k, dir] = E.ord;
  const pos = new Map(L.map((e, i) => [e.raiz, i + 1]));
  const F = L.filter((e) => (!q || semAcento(e.nome).includes(q) || (qd.length >= 4 && e.cnpj.replace(/\D/g, "").includes(qd))) && (!uf || e.uf === uf) && (!st || e[st] > 0));
  const ord = [...F].sort((a, b) => (typeof a[k] === "string" ? a[k].localeCompare(b[k]) : (a[k] || 0) - (b[k] || 0)) * dir);
  const vis = ord.slice(0, E.lim);
  $("#em-tab").innerHTML = `<thead><tr><th class="num">#</th>${COLS.map(([c, n]) => `<th class="${["nome", "uf"].includes(c) ? "" : "num"} ordena${c === k ? " ativo" : ""}" data-ord="${c}">${n}${c === k ? (dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}</tr></thead>
    <tbody>${vis.map((e) => `<tr><td class="num sub">${pos.get(e.raiz)}º</td><td class="quebra"><button class="link-dep" data-emp="${esc(e.raiz)}">${esc(e.nome)}</button><span class="sub seg">${esc(e.cnpj)}</span>${split(e)}</td><td>${esc(e.uf)}</td>
      <td class="num"><b>${curto(e.total)}</b></td>${["cobranca", "negociada", "garantida", "suspensa", "ajuizado"].map((s) => `<td class="num${s === "cobranca" && e[s] ? " neg" : ""}">${e[s] ? curto(e[s]) : "—"}</td>`).join("")}</tr>`).join("")}</tbody>
    <tfoot><tr><td></td><td>${nf(F.length)} empresas</td><td></td><td class="num">${curto(soma(F.map((e) => e.total)))}</td>${["cobranca", "negociada", "garantida", "suspensa", "ajuizado"].map((s) => `<td class="num">${curto(soma(F.map((e) => e[s])))}</td>`).join("")}</tr></tfoot>`;
  $("#e-mais").hidden = F.length <= E.lim;
}
async function ficha(raiz) {
  await carregarEmp();
  let e = linhas(E.emp).find((x) => x.raiz === raiz);
  if (!e && E.est) for (const l of Object.values(E.est.ufs)) { const x = l.find((y) => y[0] === raiz); if (x) { e = Object.fromEntries(E.est.campos.map((c, i) => [c, x[i]])); break; } }
  if (!e) { await carregarCruz(); if (E.cruz) e = linhas(E.cruz).find((x) => x.raiz === raiz); }
  if (!e) return;
  const pos = linhas(E.emp).findIndex((x) => x.raiz === raiz);
  const bs = Object.keys(BASE_ROT).filter((b) => e[b] > 0), sits = SIT.filter((s) => e[s] > 0);
  $("#ficha-corpo").innerHTML = `<div class="ficha-cab"><div><p class="selo">${pos >= 0 ? `${pos + 1}º maior devedor entre as empresas` : "Empresa devedora"} · ${esc(UF_NOME[e.uf] || e.uf)}</p><h2>${esc(e.nome)}</h2><p class="sub">CNPJ ${esc(e.cnpj)} · raiz ${esc(e.raiz)} (matriz e filiais somadas)</p></div></div>
    <div class="kpis"><div class="kpi kpi-alerta"><div class="rot">Dívida total com a União</div><div class="val num">${curto(e.total)}</div><div class="obs">${e.inscricoes ? nf(e.inscricoes) + " dívidas inscritas · " : ""}${fimTri(E.r.trimestre)}</div></div>
      <div class="kpi"><div class="rot">Em cobrança, sem acordo</div><div class="val num">${curto(e.cobranca)}</div><div class="obs">${pct((100 * e.cobranca) / e.total, 0)} da dívida</div></div>
      <div class="kpi"><div class="rot">Já cobrada na Justiça</div><div class="val num">${curto(e.ajuizado)}</div><div class="obs">execução fiscal</div></div></div>
    <div class="grade"><div class="span-${bs.length ? 6 : 12}"><h2 class="d-sec">Por situação</h2>${barrasHTML(sits.map((s) => ({ n: SIT_ROT[s], v: e[s], c: SIT_COR[s] })), e.total)}</div>
      ${bs.length ? `<div class="span-6"><h2 class="d-sec">Por tipo de dívida</h2>${barrasHTML(bs.map((b) => ({ n: BASE_ROT[b], v: e[b], c: BASE_COR[b] })), e.total)}</div>` : ""}</div>
    <div id="ficha-rec"><h2 class="d-sec">Recebe dinheiro público?</h2><p class="dica">Procurando nas emendas parlamentares e nas notas dos sites do Quanto Custa…</p></div>
    <p class="aviso-bancos">Dados da PGFN para o fim do ${rotTri(E.r.trimestre)}. Valores parcelados, com garantia ou suspensos não estão "em atraso". Consulte a situação atual na <a href="https://www.listadevedores.pgfn.gov.br/" target="_blank" rel="noopener">Lista de Devedores da PGFN</a>.</p>`;
  $("#ficha").hidden = false;
  history.replaceState(null, "", "#empresa-" + raiz);
  $("#ficha-rec").innerHTML = await recebimentosHTML(raiz);
}

// ---------------------------------------------------------------- cruzamento: recebe dinheiro público
const FONTES = { emendas: ["Emendas parlamentares", "#6b4fa0", "pagamentos recebidos de emendas (Portal da Transparência)", "parlamentares/autores"],
  deputados: ["Cota dos deputados federais", "#2463A6", "notas da cota parlamentar", "deputados"],
  senadores: ["Cota dos senadores", "#10243A", "notas da cota parlamentar (CEAPS)", "senadores"],
  estaduais: ["Deputados estaduais (CE, BA, RN)", "#16865D", "notas da verba indenizatória", "Assembleias"],
  municipios: ["Prefeituras do Ceará", "#D69A32", "empenhos (TCE-CE), líquidos de anulações", "prefeituras"] };
const linkFonte = (f, cnpj, uf) => ({ emendas: `https://portaldatransparencia.gov.br/pessoa-juridica/${cnpj}`, senadores: `https://quantocustaum.com/quanto-custa-senadores/#forn-${cnpj}`,
  deputados: "https://quantocustaum.com/quanto-custa-deputados/#fornecedores", estaduais: "https://quantocustaum.com/quanto-custa-deputados-estaduais/",
  municipios: "https://quantocustaum.com/quanto-custa-municipios/" }[f]);
async function carregarCruz() { if (E.cruz === undefined) E.cruz = await getJSON("dados/cruzamento.json").catch(() => null); return E.cruz; }
async function recebimentosHTML(raiz) {
  const d = await getJSON(`dados/cruz/${raiz.slice(0, 2)}.json`).catch(() => null);
  const r = d && d[raiz];
  if (!r) return `<h2 class="d-sec">Recebe dinheiro público?</h2><p class="dica">Não encontramos esta empresa entre quem recebeu emendas parlamentares nem entre os fornecedores de deputados, senadores, deputados estaduais (CE, BA, RN) e prefeituras do Ceará que o Quanto Custa acompanha.</p>`;
  const fs = Object.keys(FONTES).filter((f) => r[f]), tot = soma(fs.map((f) => r[f].v));
  return `<h2 class="d-sec">Recebe dinheiro público? Sim — ${curto(tot)} <span class="sub">(valores da época)</span></h2>
    <div class="rec-lista">${fs.map((f) => { const x = r[f], [nome, cor, oque, quem] = FONTES[f];
      return `<div class="rec" style="--c:${cor}"><div class="rec-cab"><b>${nome}</b><span class="num">${curto(x.v)}</span></div>
        <p class="sub">${nf(x.n)} ${oque}${x.anos.length ? ` · ${x.anos[0] === x.anos[1] ? x.anos[0] : x.anos[0] + " a " + x.anos[1]}` : ""} · ${nf(x.nquem)} ${quem}</p>
        <ul>${x.quem.map(([q, v]) => `<li><span>${esc(q)}</span><span class="num">${curto(v)}</span></li>`).join("")}${x.nquem > x.quem.length ? `<li class="sub">e mais ${nf(x.nquem - x.quem.length)}</li>` : ""}</ul>
        <a href="${linkFonte(f, x.cnpj)}" target="_blank" rel="noopener">Ver na fonte →</a></div>`; }).join("")}</div>
    <p class="dica">Receber dinheiro público e ter dívida com a União não é, por si só, irregular. Para contratar com o governo a empresa precisa de certidão de regularidade fiscal, que é dada também a quem está com a dívida parcelada, garantida ou suspensa na Justiça.</p>`;
}
const COLS_C = [["nome", "Empresa"], ["uf", "UF"], ["total", "Dívida com a União"], ["cobranca", "Em cobrança"], ["recebido", "Recebeu de dinheiro público"]];
function rCruz() {
  carregarCruz().then((C) => {
    if (!C) { $("#c-kpis").innerHTML = `<p class="aviso">O cruzamento ainda está sendo feito pelo robô. Volte em alguns minutos.</p>`; return; }
    const T = C.totais;
    kpis("#c-kpis", [["Empresas devedoras que recebem dinheiro público", nf(T.empresas), `de ${nf(E.r.empresas_devedoras)} empresas na Dívida Ativa`],
      ["Quanto elas devem à União", curto(T.divida), `${curto(T.cobranca)} em cobrança, sem acordo`, "kpi-alerta"],
      ["Quanto receberam", curto(T.recebido), "emendas, cotas e prefeituras · valores da época"]]);
    $("#c-fontes").innerHTML = barrasHTML(Object.keys(FONTES).filter((f) => T.por_fonte[f] && T.por_fonte[f][0] > 0).map((f) => ({ n: FONTES[f][0], s: `${nf(T.por_fonte[f][1])} empresas devedoras`, v: T.por_fonte[f][0], c: FONTES[f][1] })), T.recebido);
    const sf = $("#c-fonte"); if (sf.options.length === 1) sf.innerHTML += Object.keys(FONTES).map((f) => `<option value="${f}">${FONTES[f][0]}</option>`).join("");
    $("#c-nota").textContent = `Na tabela: as ${nf(C.linhas.length)} empresas com as maiores dívidas ou que mais receberam. A ficha de cada uma mostra quem pagou. Fontes no período de cada site; dívida da PGFN em ${fimTri(E.r.trimestre)}.`;
    tabelaCruz();
  });
}
function tabelaCruz() {
  const L = linhas(E.cruz), q = semAcento($("#c-q").value.trim()), qd = q.replace(/\D/g, ""), f = $("#c-fonte").value, so = $("#c-cob").checked, [k, dir] = E.ordC;
  const F = L.filter((e) => (!q || semAcento(e.nome).includes(q) || (qd.length >= 4 && e.cnpj.replace(/\D/g, "").includes(qd))) && (!f || e[f] > 0) && (!so || e.cobranca > 0));
  const ord = [...F].sort((a, b) => (typeof a[k] === "string" ? a[k].localeCompare(b[k]) : (a[k] || 0) - (b[k] || 0)) * dir);
  const chip = (e) => Object.keys(FONTES).filter((x) => e[x] > 0).map((x) => `<span class="chip" style="--c:${FONTES[x][1]}" title="${FONTES[x][0]}: ${curto(e[x])}">${FONTES[x][0].split(" ")[0] === "Cota" ? FONTES[x][0].replace("Cota dos ", "") : FONTES[x][0].split(" ")[0]}</span>`).join("");
  $("#cz-tab").innerHTML = `<thead><tr><th class="num">#</th>${COLS_C.map(([c, n]) => `<th class="${["nome", "uf"].includes(c) ? "" : "num"} ordena${c === k ? " ativo" : ""}" data-ordc="${c}">${n}${c === k ? (dir < 0 ? " ▾" : " ▴") : ""}</th>`).join("")}<th>De onde</th></tr></thead>
    <tbody>${ord.slice(0, E.limC).map((e, i) => `<tr><td class="num sub">${i + 1}º</td><td class="quebra"><button class="link-dep" data-emp="${esc(e.raiz)}">${esc(e.nome)}</button><span class="sub seg">${esc(e.cnpj)}</span>${split(e)}</td><td>${esc(e.uf)}</td>
      <td class="num"><b>${curto(e.total)}</b></td><td class="num${e.cobranca ? " neg" : ""}">${e.cobranca ? curto(e.cobranca) : "—"}</td><td class="num prev">${curto(e.recebido)}</td><td class="chips">${chip(e)}</td></tr>`).join("")}</tbody>
    <tfoot><tr><td></td><td>${nf(F.length)} empresas</td><td></td><td class="num">${curto(soma(F.map((e) => e.total)))}</td><td class="num">${curto(soma(F.map((e) => e.cobranca)))}</td><td class="num">${curto(soma(F.map((e) => e.recebido)))}</td><td></td></tr></tfoot>`;
  $("#c-mais").hidden = F.length <= E.limC;
}

// ---------------------------------------------------------------- estados
const UF_ROT = { AC: [58, 228], AL: [626, 240, 583, 233], AP: [336, 62], AM: [150, 150], BA: [500, 290], CE: [538, 160], DF: [446, 318, 409, 330],
  ES: [556, 404, 520, 392], GO: [370, 352], MA: [446, 168], MT: [282, 282], MS: [302, 412], MG: [452, 374], PA: [330, 140], PB: [626, 192, 590, 193],
  PR: [352, 478], PE: [626, 216, 572, 213], PI: [482, 196], RJ: [520, 452, 492, 433], RN: [626, 168, 585, 174], RS: [314, 584], RO: [168, 254],
  RR: [188, 56], SC: [364, 530], SP: [400, 446], SE: [626, 264, 573, 247], TO: [402, 228] };
function mapa(el, val, sel) {
  const M = window.MAPA_BR; if (!M) return;
  const ufs = Object.keys(M.ufs), vs = ufs.map((u) => Math.log10(val[u] || 1)), mn = Math.min(...vs), mx = Math.max(...vs);
  el.innerHTML = `<svg viewBox="${M.viewBox}">${ufs.map((u) => { const t = mx > mn ? (Math.log10(val[u] || 1) - mn) / (mx - mn) : 0.3, c = [222 - 150 * t, 235 - 110 * t, 247 - 60 * t].map(Math.round);
    return `<path d="${M.ufs[u][1]}" data-uf="${u}" class="${u === sel ? "sel" : ""}" style="${u === sel ? "" : `fill:rgb(${c})`}"><title>${M.ufs[u][0]} · ${curto(val[u])}</title></path>`; }).join("")}
    ${ufs.map((u) => { const p = UF_ROT[u]; return p.length > 2 ? `<line x1="${p[0] - 6}" y1="${p[1] - 4}" x2="${p[2]}" y2="${p[3]}" class="uf-linha"/>` : ""; }).join("")}
    ${ufs.map((u) => { const p = UF_ROT[u]; return `<text x="${p[0]}" y="${p[1]}" data-uf="${u}" class="uf-rot${p.length > 2 ? " fora" : ""}">${u}</text>`; }).join("")}</svg>
    <p class="mapa-br-leg">Cor: Dívida Ativa dos devedores com endereço no estado (mais escuro = maior).</p>`;
}
async function rEstados() {
  const R = E.r; if (!E.est) E.est = await getJSON("dados/estados.json");
  const val = Object.fromEntries(Object.entries(R.uf).map(([u, x]) => [u, x[0]]));
  if (!E.uf) E.uf = Object.entries(val).sort((a, b) => b[1] - a[1])[0][0];
  mapa($("#uf-mapa"), val, E.uf);
  const ufs = Object.keys(R.uf).sort((a, b) => val[b] - val[a]);
  $("#uf-tab").innerHTML = `<thead><tr><th>Estado</th><th class="num">Total</th><th class="num">Empresas</th><th class="num">Pessoas</th></tr></thead><tbody>${ufs.map((u) =>
    `<tr${u === E.uf ? ' class="sel"' : ""}><td><button class="link-dep" data-ufsel="${u}">${esc(UF_NOME[u] || u)}</button></td><td class="num"><b>${curto(val[u])}</b></td><td class="num">${curto(V(R.uf_pessoa, u + "|pj"))}</td><td class="num">${curto(V(R.uf_pessoa, u + "|pf"))}</td></tr>`).join("")}</tbody>`;
  const s = $("#uf-sel");
  s.innerHTML = ufs.filter((u) => E.est.ufs[u]).map((u) => `<option value="${u}">${esc(UF_NOME[u] || u)}</option>`).join(""); s.value = E.uf;
  $("#uf-top-tit").textContent = `Maiores empresas devedoras — ${UF_NOME[E.uf] || E.uf}`;
  const L = (E.est.ufs[E.uf] || []).map((x) => Object.fromEntries(E.est.campos.map((c, i) => [c, x[i]])));
  $("#uf-top").innerHTML = `<thead><tr><th class="num">#</th><th>Empresa</th><th class="num">Dívida no estado</th><th class="num">Dívida total da empresa</th><th class="num">Em cobrança</th><th class="num">Parcelada</th></tr></thead><tbody>${L.slice(0, E.limU).map((e, i) =>
    `<tr><td class="num sub">${i + 1}º</td><td class="quebra"><button class="link-dep" data-emp="${esc(e.raiz)}">${esc(e.nome)}</button><span class="sub seg">${esc(e.cnpj)}</span>${split(e)}</td><td class="num"><b>${curto(e.valor_uf)}</b></td><td class="num">${curto(e.total)}</td><td class="num neg">${e.cobranca ? curto(e.cobranca) : "—"}</td><td class="num">${e.negociada ? curto(e.negociada) : "—"}</td></tr>`).join("")}</tbody>`;
  $("#uf-mais").hidden = L.length <= E.limU;
}

// ---------------------------------------------------------------- tipos de dívida
function rTipos() {
  const R = E.r, tot = R.total[0];
  kpis("#t-kpis", Object.keys(BASE_ROT).map((b) => [BASE_ROT[b], curto(V(R.base, b)), `${pct((100 * V(R.base, b)) / tot, 1)} do total · ${nf(N(R.base, b))} dívidas`]));
  const s = $("#t-base");
  if (!s.options.length) s.innerHTML = Object.keys(BASE_ROT).map((b) => `<option value="${b}">${BASE_ROT[b]}</option>`).join("");
  const rec = (R.receitas[s.value] || []).slice(0, 15), lim = celular() ? 18 : 48;
  const limpa = (n) => n.replace(/^Receita da dívida ativa - /i, "").replace(/^R ?D ?Ativa ?- ?/i, "").replace(/^DIV\.ATIVA-/i, "").replace(/ - Receita da dívida ativa$/i, "");
  grafico("g-t-rec", { type: "bar", data: { labels: rec.map((r) => nomeCurto(limpa(r[0]), lim)), datasets: [{ label: "Dívida", data: rec.map((r) => r[1]), backgroundColor: BASE_COR[s.value] }] },
    options: { indexAxis: "y", maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: { callbacks: { title: (c) => limpa(rec[c[0].dataIndex][0]), label: (c) => `${curto(c.parsed.x)} · ${nf(rec[c.dataIndex][2])} dívidas` } } }, scales: { x: eixoR() } } });
  const anos = Object.keys(R.ano).filter((a) => /^\d{4}$/.test(a)).sort(), sem = V(R.ano, "sem data");
  grafico("g-t-ano", { type: "bar", data: { labels: anos, datasets: [{ label: "Dívida", data: anos.map((a) => V(R.ano, a)), backgroundColor: "#10243A" }] },
    options: { maintainAspectRatio: false, plugins: { legend: { display: false }, tooltip: tip(curto) }, scales: { y: eixoR(), x: { ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: celular() ? 6 : 14 } } } } });
  $("#t-ano-nota").textContent = sem ? `${curto(sem)} estão sem data de inscrição válida no arquivo da PGFN e não aparecem no gráfico.` : "";
}

// ---------------------------------------------------------------- situação
function rSituacao() {
  const R = E.r, tot = R.total[0];
  kpis("#s-kpis", SIT.filter((s) => V(R.situacao, s) > 0).slice(0, 4).map((s) => [SIT_ROT[s], curto(V(R.situacao, s)), `${pct((100 * V(R.situacao, s)) / tot, 1)} do total`, s === "cobranca" ? "kpi-alerta" : ""]));
  const bs = Object.keys(BASE_ROT);
  grafico("g-s-base", { type: "bar", data: { labels: bs.map((b) => BASE_ROT[b]), datasets: SIT.map((s) => ({ label: SIT_ROT[s], data: bs.map((b) => V(R.base_situacao, b + "|" + s)), backgroundColor: SIT_COR[s] })) },
    options: { maintainAspectRatio: false, interaction: { mode: "index", intersect: false }, plugins: { tooltip: { ...tip(curto), filter: (c) => c.parsed.y > 0 } }, scales: { x: { stacked: true }, y: { ...eixoR(), stacked: true } } } });
  const o = Object.entries(R.situacoes_originais || {}), t = soma(o.map((x) => x[1]));
  $("#s-orig").innerHTML = `<div class="tabela-rolagem"><table class="ranking mini-tab"><thead><tr><th>Situação (PGFN)</th><th>Grupo no Quanto Custa</th><th class="num">Dívidas</th><th class="num">%</th></tr></thead><tbody>${o.map(([n, q]) =>
    `<tr><td>${esc(n || "não informada")}</td><td>${grupoDe(n)}</td><td class="num">${nf(q)}</td><td class="num">${pct((100 * q) / t, 1)}</td></tr>`).join("")}</tbody></table></div>`;
}
const grupoDe = (t) => { t = (t || "").toLowerCase();
  return t.includes("cobran") ? SIT_ROT.cobranca : /benef|parcel|negoci/.test(t) ? SIT_ROT.negociada : t.includes("garant") ? SIT_ROT.garantida : /suspen|judic/.test(t) ? SIT_ROT.suspensa : SIT_ROT.outra; };

// ---------------------------------------------------------------- o que dava pra fazer
function rDava() {
  const R = window.REFERENCIAS, v = V(E.r.situacao, "cobranca"); if (!R) return;
  const n = (x) => (x >= 1e6 ? nf(x / 1e6, 1) + " mi" : x >= 10 ? nf(Math.floor(x)) : nf(x, 1));
  $("#dv-sub").textContent = `Dívida Ativa da União em cobrança, sem acordo nem garantia (${fimTri(E.r.trimestre)}):`;
  $("#dv-total").textContent = brl(v); $("#dv-ext").textContent = porExtenso(v);
  $("#dv-regra").textContent = "Se esse dinheiro fosse recuperado, daria para:";
  $("#dv-cards").innerHTML = R.itens.map((it) => { const q = v / (it.construcao + it.ano_funcionando), so = v / it.construcao;
    return `<div class="dv-card"><b class="dv-num">${n(q)}</b><span class="dv-rot">${esc(it.nome)}</span><p>${it.feminino ? "construídas" : "construídos"} do zero e funcionando por 1 ano <span class="sub">(${esc(it.detalhe)})</span></p><p class="sub">Só construir e equipar: ${n(so)} ${esc(so >= 2 ? it.plural : it.unidade)}.</p></div>`; }).join("") +
    `<div class="dv-card"><b class="dv-num">${n(v / R.bolsa_familia.por_familia_ano)}</b><span class="dv-rot">de famílias no Bolsa Família</span><p>durante 1 ano <span class="sub">(${esc(R.bolsa_familia.detalhe)})</span></p></div>` +
    `<div class="dv-card"><b class="dv-num">${brl(v / 213421037)}</b><span class="dv-rot">para cada brasileiro</span><p>se o valor fosse dividido igualmente <span class="sub">(213.421.037 habitantes, IBGE)</span></p></div>`;
  const lnk = ([t, u]) => (u ? `<a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a>` : esc(t));
  $("#dv-fontes").innerHTML = `<ul>${R.itens.map((it) => `<li><b>${esc(it.nome)}</b>: ${brl(it.construcao + it.ano_funcionando)} cada<ul>${it.fontes.map((f) => `<li>${lnk(f)}</li>`).join("")}</ul></li>`).join("")}<li><b>Bolsa Família</b>: ${brl(R.bolsa_familia.por_familia_ano)} por família no ano — ${lnk(R.bolsa_familia.fonte)}</li></ul>
    <p class="sub">A própria PGFN classifica boa parte da Dívida Ativa como de difícil recuperação (empresas que fecharam, faliram ou não têm bens). A comparação mostra o tamanho do valor, não o que de fato pode ser recebido.</p>`;
}
function rMetodo() { $("#m-info").textContent = `Trimestre usado: ${rotTri(E.r.trimestre)} · ${nf(E.r.linhas_lidas)} linhas lidas nos arquivos da PGFN · atualizado em ${new Date(E.r.gerado_em).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}.`; }

// ---------------------------------------------------------------- navegação
const PAGS = { inicio: rInicio, empresas: rEmpresas, cruz: rCruz, estados: rEstados, tipos: rTipos, situacao: rSituacao, dava: rDava, metodo: rMetodo };
async function render() { try { await PAGS[E.pag](); } catch (e) { console.error(e); } }
function irPara(p) {
  E.pag = p; $$(".pagina").forEach((s) => s.classList.toggle("ativa", s.dataset.pag === p));
  $$(".menu nav button").forEach((b) => (b.dataset.pag === p ? b.setAttribute("aria-current", "page") : b.removeAttribute("aria-current")));
  $("#menu").classList.remove("aberto"); $("#veu").hidden = true;
  const u = new URL(location); u.hash = p; history.replaceState(null, "", u);
  render(); window.scrollTo(0, 0);
}
async function iniciar() {
  try { E.r = await getJSON("dados/resumo.json"); }
  catch { $("#aviso").hidden = false; $("#aviso").textContent = "Os dados ainda estão sendo coletados pelo robô. Volte em alguns minutos."; irPara("metodo"); return; }
  $("#atualizado").textContent = `Dados da PGFN: ${rotTri(E.r.trimestre)}`;
  const h = location.hash.slice(1), me = h.match(/^empresa-(\d{8})$/);
  irPara(me ? "empresas" : PAGS[h] ? h : "inicio");
  if (me) ficha(me[1]);
}
document.addEventListener("click", (e) => {
  const em = e.target.closest("[data-emp]"); if (em) { ficha(em.dataset.emp); return; }
  const ir = e.target.closest("[data-ir]"); if (ir) { irPara(ir.dataset.ir); return; }
  const uf = e.target.closest("[data-ufsel], #uf-mapa [data-uf]"); if (uf) { E.uf = uf.dataset.ufsel || uf.dataset.uf; E.limU = 15; rEstados(); return; }
  const oc = e.target.closest("#cz-tab th[data-ordc]"); if (oc) { const c = oc.dataset.ordc; E.ordC = [c, E.ordC[0] === c ? -E.ordC[1] : ["nome", "uf"].includes(c) ? 1 : -1]; tabelaCruz(); return; }
  const o = e.target.closest("#em-tab th[data-ord]"); if (o) { const c = o.dataset.ord; E.ord = [c, E.ord[0] === c ? -E.ord[1] : ["nome", "uf"].includes(c) ? 1 : -1]; tabela(linhas(E.emp)); return; }
  const b = e.target.closest(".menu nav button"); if (b) irPara(b.dataset.pag);
});
const refaz = () => { E.lim = 50; tabela(linhas(E.emp)); };
$("#e-q").oninput = refaz; $("#e-uf").onchange = refaz; $("#e-sit").onchange = refaz;
const refazC = () => { E.limC = 50; if (E.cruz) tabelaCruz(); };
$("#c-q").oninput = refazC; $("#c-fonte").onchange = refazC; $("#c-cob").onchange = refazC;
$("#c-mais").onclick = () => { E.limC += 100; tabelaCruz(); };
$("#e-mais").onclick = () => { E.lim += 100; tabela(linhas(E.emp)); };
$("#uf-sel").onchange = (e) => { E.uf = e.target.value; E.limU = 15; rEstados(); };
$("#uf-mais").onclick = () => { E.limU = 60; rEstados(); };
$("#t-base").onchange = () => rTipos();
const fechaFicha = () => { $("#ficha").hidden = true; if (location.hash.startsWith("#empresa-")) history.replaceState(null, "", "#" + E.pag); };
$("#ficha-fechar").onclick = fechaFicha;
$("#ficha").onclick = (e) => { if (e.target.id === "ficha") fechaFicha(); };
document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !$("#ficha").hidden) fechaFicha(); });
$("#abrir-menu").onclick = () => { $("#menu").classList.add("aberto"); $("#veu").hidden = false; };
$("#veu").onclick = () => { $("#menu").classList.remove("aberto"); $("#veu").hidden = true; };
let rz, larg = innerWidth; addEventListener("resize", () => { if (innerWidth === larg) return; larg = innerWidth; clearTimeout(rz); rz = setTimeout(render, 250); });
iniciar();
})();
