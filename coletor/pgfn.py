"""PGFN — dados abertos da Dívida Ativa da União (trimestral).

Três arquivos por trimestre (zip com vários CSV, ";" e latin-1):
  Sistema_SIDA       — tributos e demais créditos não previdenciários (Receita Federal etc.)
  Previdenciario     — contribuições previdenciárias (INSS)
  FGTS               — FGTS
Cada linha é um devedor de uma inscrição. A mesma inscrição aparece uma vez para o devedor PRINCIPAL e
de novo para cada CORRESPONSÁVEL/SOLIDÁRIO, com o mesmo valor. Por isso os totais somam só o PRINCIPAL.
O CPF já vem mascarado pela PGFN; nomes de pessoas físicas nunca são guardados.
"""
import csv
import io
import re
import zipfile
from collections import defaultdict

BASE = "https://dadosabertos.pgfn.gov.br/"
ARQUIVOS = {"sida": "Dados_abertos_Sistema_SIDA.zip", "prev": "Dados_abertos_Previdenciario.zip", "fgts": "Dados_abertos_FGTS.zip"}
NOMES_BASE = {"sida": "Tributos e demais créditos", "prev": "Previdência (INSS)", "fgts": "FGTS"}
UFS = set("AC AL AM AP BA CE DF ES GO MA MG MS MT PA PB PE PI PR RJ RN RO RR RS SC SE SP TO".split())

# grupos de situação (TIPO_SITUACAO_INSCRICAO), em português claro
def grupo_situacao(tipo: str) -> str:
    t = (tipo or "").lower()
    if "cobran" in t:
        return "cobranca"
    if "benef" in t or "parcel" in t or "negoci" in t:
        return "negociada"
    if "garant" in t:
        return "garantida"
    if "suspen" in t or "judic" in t:
        return "suspensa"
    return "outra"


ROT_SITUACAO = {"cobranca": "Em cobrança", "negociada": "Parcelada ou negociada", "garantida": "Com garantia",
                "suspensa": "Suspensa por decisão judicial", "outra": "Outras situações"}
GRUPOS = list(ROT_SITUACAO)
BASES = list(ARQUIVOS)


def ultimo_trimestre(indice_html: str) -> str:
    return sorted(set(re.findall(r'href="(\d{4}_trimestre_\d{2})/"', indice_html)))[-1]


def _valor(s: str) -> float:
    s = (s or "").strip()
    if not s:
        return 0.0
    if "," in s:   # por segurança, caso venha no formato brasileiro
        s = s.replace(".", "").replace(",", ".")
    try:
        return float(s)
    except ValueError:
        return 0.0


def _raiz(cnpj: str) -> str:
    d = re.sub(r"\D", "", cnpj or "")
    return d[:8] if len(d) == 14 else ""


class Agregador:
    """Soma tudo numa passada só, guardando por empresa (raiz do CNPJ) o mínimo necessário."""

    def __init__(self):
        self.tot = defaultdict(float)          # chaves: (dimensão, valor) -> R$
        self.qtd = defaultdict(int)            # mesmas chaves -> nº de inscrições
        self.emp = {}                          # raiz -> [total, sida, prev, fgts, cobranca, negociada, garantida, suspensa, outra, ajuizado, n]
        self.nome = {}                         # raiz -> nome (o primeiro visto da matriz, se houver)
        self.cnpj = {}                         # raiz -> CNPJ completo (matriz preferida)
        self.uf_emp = {}                       # raiz -> {uf: valor}
        self.pf_devedores = set()              # chave mascarada + UF (só para contar pessoas, sem nome)
        self.situacoes_vistas = defaultdict(int)
        self.linhas = 0
        self.ignoradas = 0

    def add(self, base: str, r: dict):
        self.linhas += 1
        if (r.get("TIPO_DEVEDOR") or "").strip().upper() != "PRINCIPAL":
            return
        v = _valor(r.get("VALOR_CONSOLIDADO"))
        if v <= 0:
            self.ignoradas += 1
            return
        pj = "jur" in (r.get("TIPO_PESSOA") or "").lower()
        uf = (r.get("UF_DEVEDOR") or "").strip().upper()
        uf = uf if uf in UFS else "Outros"
        tipo = (r.get("TIPO_SITUACAO_INSCRICAO") or "").strip()
        self.situacoes_vistas[tipo] += 1
        g = grupo_situacao(tipo)
        aj = (r.get("INDICADOR_AJUIZADO") or "").strip().upper() == "SIM"
        receita = (r.get("RECEITA_PRINCIPAL") or r.get("TIPO_CREDITO") or "Não informado").strip() or "Não informado"
        data = (r.get("DATA_INSCRICAO") or "")[-4:]
        ano = data if data.isdigit() and "1950" <= data <= "2100" else "sem data"
        pessoa = "pj" if pj else "pf"
        for k in (("total", "total"), ("base", base), ("situacao", g), ("pessoa", pessoa), ("uf", uf), ("ajuizado", "sim" if aj else "nao"),
                  ("ano", ano), ("receita", f"{base}|{receita}"), ("uf_pessoa", f"{uf}|{pessoa}"), ("base_situacao", f"{base}|{g}")):
            self.tot[k] += v
            self.qtd[k] += 1
        if pj:
            rz = _raiz(r.get("CPF_CNPJ"))
            if not rz:
                return
            e = self.emp.get(rz)
            if e is None:
                e = self.emp[rz] = [0.0] * 10 + [0]
                self.nome[rz] = (r.get("NOME_DEVEDOR") or "").strip()
                self.cnpj[rz] = (r.get("CPF_CNPJ") or "").strip()
            elif "/0001-" in (r.get("CPF_CNPJ") or "") and "/0001-" not in self.cnpj[rz]:
                self.nome[rz] = (r.get("NOME_DEVEDOR") or "").strip()
                self.cnpj[rz] = (r.get("CPF_CNPJ") or "").strip()
            e[0] += v
            e[1 + BASES.index(base)] += v
            e[4 + GRUPOS.index(g)] += v
            if aj:
                e[9] += v
            e[10] += 1
            u = self.uf_emp.setdefault(rz, {})
            u[uf] = u.get(uf, 0.0) + v
        else:
            # só um número (hash) para contar pessoas diferentes, de forma aproximada; nada é guardado
            self.pf_devedores.add(hash((r.get("CPF_CNPJ") or "") + (r.get("NOME_DEVEDOR") or "")[:3] + uf))

    def ler_zip(self, base: str, caminho: str, log=print):
        with zipfile.ZipFile(caminho) as z:
            for m in z.infolist():
                if not m.filename.lower().endswith(".csv"):
                    continue
                n0 = self.linhas
                with z.open(m) as fh:
                    leitor = csv.DictReader(io.TextIOWrapper(fh, encoding="latin-1", newline=""), delimiter=";")
                    for r in leitor:
                        self.add(base, r)
                log(f"  {base} {m.filename}: {self.linhas - n0:,} linhas")
