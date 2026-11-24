"""Cruzamento: empresas devedoras da União que recebem dinheiro público.

Fontes (todas pelo CNPJ, somadas pela raiz = 8 primeiros números):
  emendas    — Portal da Transparência (CGU): emendas parlamentares por favorecido (quem recebeu o dinheiro)
  deputados  — notas da cota parlamentar dos deputados federais (site quanto-custa-deputados)
  senadores  — notas da cota dos senadores (CEAPS) (site quanto-custa-senadores)
  estaduais  — verba indenizatória dos deputados estaduais CE/BA/RN (site quanto-custa-deputados-estaduais)
  municipios — empenhos das prefeituras e câmaras do Ceará, nota a nota (TCE-CE) (site quanto-custa-municipios)
Só fatos: receber dinheiro público e ter dívida inscrita não é, por si só, irregular.
"""
import csv
import io
import json
import re
import zipfile
from collections import defaultdict
from pathlib import Path

EMENDAS_ZIP = "https://portaldatransparencia.gov.br/download-de-dados/emendas-parlamentares/UNICO"
FONTES = ["emendas", "deputados", "senadores", "estaduais", "municipios"]


def raiz(doc: str) -> str:
    d = re.sub(r"\D", "", str(doc or ""))
    return d[:8] if len(d) == 14 else ""


def _ler(p: Path):
    try:
        return json.loads(p.read_text("utf-8"))
    except Exception:  # noqa: BLE001
        return None


def _valor_br(s: str) -> float:
    s = (s or "").strip().replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


# órgãos e entes públicos (prefeituras, estados, fundos, INSS...) não são empresas: ficam fora do cruzamento
PUBLICO = re.compile(r"\b(MUNICIPIO|PREFEITURA|ESTADO D[OAE]|GOVERNO D[OAE]|DISTRITO FEDERAL|FUNDO (MUNICIPAL|ESTADUAL|NACIONAL|DO REGIME|DE SAUDE|DE PREVID)|"
                     r"SECRETARIA|CAMARA MUNICIPAL|ASSEMBLEIA LEGISLATIVA|TRIBUNAL|INSTITUTO NACIONAL DO SEGURO SOCIAL|AUTARQUIA|"
                     r"CONSORCIO (PUBLICO|INTERMUNICIPAL)|UNIVERSIDADE (FEDERAL|ESTADUAL)|INSTITUTO FEDERAL|MINISTERIO|"
                     r"SERVICO AUTONOMO|INSTITUTO DE PREVIDENCIA|REGIME (PROPRIO|GERAL) DE PREVIDENCIA)\b")
# natureza jurídica de quem recebe emenda: entes públicos e os bancos públicos (Banco do Brasil, Caixa), que só repassam o dinheiro como agentes
NATUREZA_FORA = re.compile(r"munic|estad|distrito|fundo|autarq|[oó]rg[aã]o|poder|p[uú]blic|economia mista|cons[oó]rcio|servi[cç]o social", re.I)


def publico(nome: str) -> bool:
    import unicodedata
    n = unicodedata.normalize("NFKD", nome or "").encode("ascii", "ignore").decode().upper()
    return bool(PUBLICO.search(n))


class Recebimentos:
    """raiz -> fonte -> {"v": valor, "n": notas/pagamentos, "anos": set, "quem": {nome: valor}, "cnpj": cnpj}"""

    def __init__(self):
        self.d = defaultdict(dict)
        self.nomes = {}
        self.naturezas = defaultdict(float)   # para conferência: valor por natureza jurídica (emendas)

    def add(self, fonte, doc, valor, ano, quem=None, n=1, nome=None):
        rz = raiz(doc)
        if not rz or not valor:
            return
        o = self.d[rz].setdefault(fonte, {"v": 0.0, "n": 0, "anos": set(), "quem": defaultdict(float), "cnpj": ""})
        o["v"] += valor
        o["n"] += n
        if ano:
            o["anos"].add(int(ano))
        if quem:
            o["quem"][quem] += valor
        if not o["cnpj"] or "/0001-" in str(doc) or re.sub(r"\D", "", str(doc))[8:12] == "0001":
            o["cnpj"] = re.sub(r"\D", "", str(doc))
        if nome and rz not in self.nomes:
            self.nomes[rz] = nome

    # ---------------------------------------------------------------- leitores
    def ler_emendas(self, conteudo_zip: bytes):
        """Arquivo EmendasParlamentares_PorFavorecido.csv do Portal da Transparência."""
        z = zipfile.ZipFile(io.BytesIO(conteudo_zip))
        nome = next(n for n in z.namelist() if "porfavorecido" in n.lower().replace("_", ""))
        with z.open(nome) as fh:
            for r in csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline=""), delimiter=";"):
                if "jur" not in (r.get("Tipo Favorecido") or "").lower():
                    continue
                nat = (r.get("Natureza Jurídica") or "").strip()
                self.naturezas[nat] += _valor_br(r.get("Valor Recebido"))
                if NATUREZA_FORA.search(nat) or publico(r.get("Favorecido")):
                    continue
                am = (r.get("Ano/Mês") or r.get("Ano/Mes") or "")[:4]
                autor = (r.get("Nome do Autor da Emenda") or "").strip()
                autor = autor if autor and autor.upper() not in ("SEM INFORMAÇÃO", "SEM INFORMACAO", "S/I") else (r.get("Tipo de Emenda") or "").strip()
                self.add("emendas", r.get("Código do Favorecido"), _valor_br(r.get("Valor Recebido")), am if am.isdigit() else None,
                         quem=autor.title() if autor.isupper() else autor)

    def ler_deputados(self, base: Path):
        """docs/dados/<ano>/fornecedores/XX.json + resumo.json (nomes)."""
        for pa in sorted(base.glob("[12][0-9][0-9][0-9]")):
            nomes = {d["id"]: f'{d["nome"]} ({d.get("partido", "")}-{d.get("uf", "")})' for d in (_ler(pa / "resumo.json") or {}).get("deputados", [])}
            for f in sorted((pa / "fornecedores").glob("*.json")):
                for o in (_ler(f) or {}).values():
                    if not isinstance(o, dict) or o.get("tipo") != "PJ":
                        continue
                    pag = o.get("pagadores") or []
                    if pag:
                        for pid, v, n in pag:
                            self.add("deputados", o.get("doc") or o.get("chave"), v, pa.name, quem=nomes.get(pid, f"deputado {pid}"), n=n, nome=o.get("nome"))
                    else:
                        self.add("deputados", o.get("doc") or o.get("chave"), o.get("valor"), pa.name, n=o.get("notas") or 1, nome=o.get("nome"))

    def ler_senadores(self, base: Path):
        """docs/dados/<ano>/fornecedores.json ({linhas: [chave, nome, doc, tipo, valor, notas, [[id, valor, notas]...]]})."""
        for pa in sorted(base.glob("[12][0-9][0-9][0-9]")):
            nomes = {d["id"]: f'{d["nome"]} ({d.get("partido", "")}-{d.get("uf", "")})' for d in (_ler(pa / "resumo.json") or {}).get("senadores", [])}
            for l in (_ler(pa / "fornecedores.json") or {}).get("linhas", []):
                if len(l) < 6 or l[3] != "PJ":
                    continue
                pag = l[6] if len(l) > 6 and isinstance(l[6], list) else []
                if pag:
                    for p in pag:
                        self.add("senadores", l[2] or l[0], p[1], pa.name, quem=nomes.get(p[0], f"senador {p[0]}"), n=p[2] if len(p) > 2 else 1, nome=l[1])
                else:
                    self.add("senadores", l[2] or l[0], l[4], pa.name, n=l[5] or 1, nome=l[1])

    def ler_estaduais(self, base: Path):
        """docs/dados/<uf>/<ano>/fornecedores.json ({campos: [doc, nome, tipo, total, notas, deputados], linhas})."""
        for f in sorted(base.glob("*/[12][0-9][0-9][0-9]/fornecedores.json")):
            uf, ano = f.parent.parent.name.upper(), f.parent.name
            d = _ler(f) or {}
            c = d.get("campos") or []
            for l in d.get("linhas", []):
                o = dict(zip(c, l))
                if o.get("tipo") == "PJ":
                    self.add("estaduais", o.get("doc"), o.get("total"), ano, quem=f"Assembleia {uf}", n=o.get("notas") or 1, nome=o.get("nome"))

    def ler_municipios(self, base: Path):
        """docs/dados/f/<sim>/<ano>.json ({colunas: [nome, cnpj, tipo, municipio, valor, notas, ...], linhas}); valor = empenhado líquido."""
        cidades = {m["sim"]: m["nome"].title() for m in (_ler(base / "resumo.json") or {}).get("municipios", [])}
        for f in sorted(base.glob("f/*/[12][0-9][0-9][0-9].json")):
            pagou = cidades.get(f.parent.name, f.parent.name)   # quem pagou: a prefeitura da pasta (não a cidade do fornecedor)
            d = _ler(f) or {}
            c = d.get("colunas") or []
            for l in d.get("linhas", []):
                o = dict(zip(c, l))
                if o.get("tipo") == "PJ":
                    self.add("municipios", o.get("cnpj"), o.get("valor"), f.stem, quem=f"Prefeitura de {pagou} (CE)",
                             n=o.get("notas") or 1, nome=o.get("nome"))

    # ---------------------------------------------------------------- saída
    def resumo_de(self, rz: str, top=5) -> dict:
        out = {}
        for fonte, o in self.d.get(rz, {}).items():
            quem = sorted(o["quem"].items(), key=lambda x: -x[1])
            anos = sorted(o["anos"])
            out[fonte] = {"v": round(o["v"], 2), "n": o["n"], "anos": [anos[0], anos[-1]] if anos else [],
                          "quem": [[q, round(v, 2)] for q, v in quem[:top]], "nquem": len(quem), "cnpj": o["cnpj"]}
        return out
