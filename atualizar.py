"""Robô do Quanto Custa — Devedores da União (Dívida Ativa, PGFN).

Baixa os 3 arquivos do trimestre mais recente, soma tudo numa passada e grava arquivos pequenos para o site:
  docs/dados/resumo.json    — totais (por tipo, situação, estado, ano, tipo de dívida, pessoa física × empresa)
  docs/dados/empresas.json  — as maiores empresas devedoras (devedor principal, somado pela raiz do CNPJ)
  docs/dados/estados.json   — por estado: totais e as maiores empresas
  docs/dados/meta.json
Só roda de novo quando a PGFN publica um trimestre novo (ou com --forcar).
"""
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

import requests

from coletor import cruzamento, pgfn
from coletor.privacidade import mascarar_cpf_no_texto

DADOS = Path(__file__).parent / "docs" / "dados"
TMP = Path(os.environ.get("RUNNER_TEMP", "/tmp")) / "pgfn"
TOP_EMPRESAS = 3000
TOP_UF = 60
FAIXAS = [(0, 1e4), (1e4, 1e5), (1e5, 1e6), (1e6, 1e7), (1e7, 1e8), (1e8, 1e9), (1e9, float("inf"))]
S = requests.Session()
S.headers["User-Agent"] = "QuantoCusta/1.0 (painel de transparencia com dados abertos)"


def ler(nome):
    try:
        return json.loads((DADOS / nome).read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return None


def gravar(nome, obj):
    DADOS.mkdir(parents=True, exist_ok=True)
    (DADOS / nome).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), "utf-8")


def baixar(url: str, destino: Path):
    for tent in range(4):
        try:
            with S.get(url, stream=True, timeout=600) as r:
                r.raise_for_status()
                esperado = int(r.headers.get("Content-Length") or 0)
                with open(destino, "wb") as f:
                    for ch in r.iter_content(1 << 20):
                        f.write(ch)
            if esperado and destino.stat().st_size != esperado:
                raise IOError("download incompleto")
            return
        except Exception as e:  # noqa: BLE001
            print(f"  tentativa {tent + 1} falhou: {e}")
            time.sleep(30 * (tent + 1))
    raise RuntimeError(f"não consegui baixar {url}")


def r2(x):
    return round(x, 2)


def montar(ag: pgfn.Agregador, tri: str) -> dict:
    T, Q = ag.tot, ag.qtd
    dim = lambda d: {k[1]: [r2(v), Q[k]] for k, v in T.items() if k[0] == d}  # noqa: E731
    receitas = {}
    for (d, chave), v in T.items():
        if d == "receita":
            b, nome = chave.split("|", 1)
            receitas.setdefault(b, []).append([nome, r2(v), Q[(d, chave)]])
    receitas = {b: sorted(l, key=lambda x: -x[1])[:25] for b, l in receitas.items()}
    emp = ag.emp
    tot_pj = sum(e[0] for e in emp.values())
    ordem = sorted(emp, key=lambda k: -emp[k][0])
    conc = {str(n): r2(100 * sum(emp[k][0] for k in ordem[:n]) / tot_pj) for n in (10, 100, 1000, 10000) if tot_pj}
    faixas = []
    for lo, hi in FAIXAS:
        vs = [e[0] for e in emp.values() if lo <= e[0] < hi]
        faixas.append({"de": lo, "ate": None if hi == float("inf") else hi, "empresas": len(vs), "valor": r2(sum(vs))})
    return {"trimestre": tri, "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"),
            "total": [r2(T[("total", "total")]), Q[("total", "total")]],
            "base": dim("base"), "situacao": dim("situacao"), "pessoa": dim("pessoa"), "uf": dim("uf"),
            "ajuizado": dim("ajuizado"), "ano": dim("ano"), "uf_pessoa": dim("uf_pessoa"), "base_situacao": dim("base_situacao"),
            "receitas": receitas, "empresas_devedoras": len(emp), "pessoas_devedoras_aprox": len(ag.pf_devedores),
            "concentracao": conc, "faixas": faixas, "linhas_lidas": ag.linhas,
            "situacoes_originais": dict(sorted(ag.situacoes_vistas.items(), key=lambda x: -x[1])),
            "rotulos": {"base": pgfn.NOMES_BASE, "situacao": pgfn.ROT_SITUACAO}}


def linha_emp(ag, rz, valor_uf=None):
    e = ag.emp[rz]
    ufs = ag.uf_emp.get(rz, {})
    uf = max(ufs, key=ufs.get) if ufs else ""
    nome = mascarar_cpf_no_texto(ag.nome.get(rz, ""))   # MEI pode ter CPF no nome
    cnpj = ag.cnpj.get(rz, "")
    out = [rz, cnpj, nome, uf] + [round(x) for x in e[:10]] + [e[10]]   # em reais inteiros (arquivo menor)
    if valor_uf is not None:
        out.append(round(valor_uf))
    return out


CAMPOS_CRUZ = ["raiz", "cnpj", "nome", "uf", "total", "cobranca", "negociada", "garantida", "suspensa", "ajuizado", "recebido"] + cruzamento.FONTES


def cruzar(ag: pgfn.Agregador, fontes: Path, tri: str) -> dict:
    """Empresas devedoras (todas, não só as maiores) que receberam dinheiro público nas fontes do Quanto Custa."""
    R = cruzamento.Recebimentos()
    situacao = {}
    for nome, f in (("emendas", lambda: R.ler_emendas(S.get(cruzamento.EMENDAS_ZIP, timeout=900).content)),
                    ("deputados", lambda: R.ler_deputados(fontes / "deputados" / "docs" / "dados")),
                    ("senadores", lambda: R.ler_senadores(fontes / "senadores" / "docs" / "dados")),
                    ("estaduais", lambda: R.ler_estaduais(fontes / "estaduais" / "docs" / "dados")),
                    ("municipios", lambda: R.ler_municipios(fontes / "municipios" / "docs" / "dados"))):
        t0 = time.time()
        try:
            f()
            situacao[nome] = "ok"
        except Exception as e:  # noqa: BLE001
            situacao[nome] = f"falhou: {str(e)[:150]}"
        print(f"  cruzamento {nome}: {situacao[nome]} ({time.time() - t0:.0f} s, {len(R.d)} empresas até aqui)")
    linhas, detalhes = [], {}
    for rz, por_fonte in R.d.items():
        e = ag.emp.get(rz)
        if not e or cruzamento.publico(ag.nome.get(rz, "")):
            continue
        res = R.resumo_de(rz)
        rec = sum(x["v"] for x in res.values())
        ufs = ag.uf_emp.get(rz, {})
        linhas.append([rz, ag.cnpj.get(rz, ""), mascarar_cpf_no_texto(ag.nome.get(rz, "")), max(ufs, key=ufs.get) if ufs else "",
                       round(e[0]), round(e[4]), round(e[5]), round(e[6]), round(e[7]), round(e[9]), round(rec)] +
                      [round(res[f]["v"]) if f in res else 0 for f in cruzamento.FONTES])
        detalhes.setdefault(rz[:2], {})[rz] = {f: {**x, "quem": [[mascarar_cpf_no_texto(q), v] for q, v in x["quem"]]} for f, x in res.items()}
    linhas.sort(key=lambda l: -l[4])
    tot = {"empresas": len(linhas), "divida": sum(l[4] for l in linhas), "cobranca": sum(l[5] for l in linhas), "recebido": sum(l[10] for l in linhas),
           "por_fonte": {f: [sum(l[11 + i] for l in linhas), sum(1 for l in linhas if l[11 + i])] for i, f in enumerate(cruzamento.FONTES)},
           "fornecedores_lidos": len(R.d), "situacao": situacao,
           "emendas_por_natureza": {k: round(v) for k, v in sorted(R.naturezas.items(), key=lambda x: -x[1])[:25]}}
    # no site: as 2.500 maiores dívidas + os 2.500 que mais receberam (a ficha de qualquer outra continua em cruz/XX.json)
    sel = {l[0] for l in linhas[:2500]} | {l[0] for l in sorted(linhas, key=lambda l: -l[10])[:2500]}
    tot["no_site"] = len(sel)
    gravar("cruzamento.json", {"trimestre": tri, "gerado_em": datetime.now(timezone.utc).isoformat(timespec="seconds"), "totais": tot,
                               "campos": CAMPOS_CRUZ, "linhas": [l for l in linhas if l[0] in sel]})
    pasta = DADOS / "cruz"
    pasta.mkdir(parents=True, exist_ok=True)
    for p in pasta.glob("*.json"):
        p.unlink()
    for k, v in detalhes.items():
        (pasta / f"{k}.json").write_text(json.dumps(v, ensure_ascii=False, separators=(",", ":")), "utf-8")
    print("cruzamento:", json.dumps({k: v for k, v in tot.items()}, ensure_ascii=False))
    return {k: tot[k] for k in ("empresas", "situacao")}


CAMPOS = ["raiz", "cnpj", "nome", "uf", "total", "sida", "prev", "fgts", "cobranca", "negociada", "garantida", "suspensa", "outra", "ajuizado", "inscricoes"]


def main():
    forcar = "--forcar" in sys.argv
    meta = ler("meta.json") or {}
    tri = pgfn.ultimo_trimestre(S.get(pgfn.BASE, timeout=60).text)
    print("trimestre mais recente na PGFN:", tri)
    # roda toda semana: a Dívida Ativa muda a cada trimestre, mas emendas e notas fiscais mudam todo dia (cruzamento)
    fontes = Path(sys.argv[sys.argv.index("--fontes") + 1]) if "--fontes" in sys.argv else None
    if tri == meta.get("trimestre") and not forcar and not fontes:
        print("nada novo")
        return
    TMP.mkdir(parents=True, exist_ok=True)
    ag = pgfn.Agregador()
    for base, arq in pgfn.ARQUIVOS.items():
        p = TMP / arq
        t0 = time.time()
        baixar(f"{pgfn.BASE}{tri}/{arq}", p)
        print(f"{arq}: {p.stat().st_size / 1e6:.0f} MB em {time.time() - t0:.0f} s")
        t0 = time.time()
        ag.ler_zip(base, p)
        print(f"  lido em {time.time() - t0:.0f} s")
        p.unlink()
    resumo = montar(ag, tri)
    if resumo["total"][0] < 1e11:   # trava: a Dívida Ativa da União passa de trilhão de reais
        raise RuntimeError(f"total fora do esperado: {resumo['total']}")
    ordem = sorted(ag.emp, key=lambda k: -ag.emp[k][0])
    empresas = {"trimestre": tri, "campos": CAMPOS, "linhas": [linha_emp(ag, rz) for rz in ordem[:TOP_EMPRESAS]]}
    # por estado: as maiores empresas pelo valor devido naquele estado
    por_uf = {}
    for rz, ufs in ag.uf_emp.items():
        for uf, v in ufs.items():
            por_uf.setdefault(uf, []).append((v, rz))
    estados = {"trimestre": tri, "campos": CAMPOS + ["valor_uf"],
               "ufs": {uf: [linha_emp(ag, rz, v) for v, rz in sorted(l, reverse=True)[:TOP_UF]] for uf, l in por_uf.items()}}
    resumo["top10"] = {"campos": CAMPOS, "linhas": empresas["linhas"][:10]}   # o início abre sem baixar o ranking inteiro
    gravar("resumo.json", resumo)
    if fontes:
        try:
            meta["cruzamento"] = cruzar(ag, fontes, tri)
        except Exception as e:  # noqa: BLE001
            import traceback
            traceback.print_exc()
            meta["cruzamento"] = {"erro": str(e)[:300]}
    gravar("empresas.json", empresas)
    gravar("estados.json", estados)
    meta.update({"trimestre": tri, "gerado_em": resumo["gerado_em"], "fonte": pgfn.BASE + tri + "/"})
    gravar("meta.json", meta)
    print(json.dumps({k: resumo[k] for k in ("total", "base", "situacao", "pessoa", "empresas_devedoras", "pessoas_devedoras_aprox", "concentracao")}, ensure_ascii=False, indent=1))
    print("situações originais:", resumo["situacoes_originais"])


if __name__ == "__main__":
    main()
