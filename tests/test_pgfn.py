import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from coletor import pgfn  # noqa: E402


def linha(**k):
    base = {"CPF_CNPJ": "12.345.678/0001-90", "TIPO_PESSOA": "Pessoa jurídica", "TIPO_DEVEDOR": "PRINCIPAL", "NOME_DEVEDOR": "EMPRESA X LTDA",
            "UF_DEVEDOR": "CE", "TIPO_SITUACAO_INSCRICAO": "Em cobrança", "RECEITA_PRINCIPAL": "IRPJ", "DATA_INSCRICAO": "10/05/2020",
            "INDICADOR_AJUIZADO": "SIM", "VALOR_CONSOLIDADO": "1000.50"}
    base.update(k)
    return base


def test_soma_so_o_principal_e_agrupa_pela_raiz():
    a = pgfn.Agregador()
    a.add("sida", linha())
    a.add("sida", linha(TIPO_DEVEDOR="CORRESPONSAVEL", CPF_CNPJ="XXX123.456XX", TIPO_PESSOA="Pessoa física"))  # repete o valor: não conta
    a.add("prev", linha(CPF_CNPJ="12.345.678/0002-71", TIPO_SITUACAO_INSCRICAO="Benefício Fiscal", INDICADOR_AJUIZADO="NAO", VALOR_CONSOLIDADO="500"))
    a.add("fgts", linha(CPF_CNPJ="XXX920.780XX", TIPO_PESSOA="Pessoa física", NOME_DEVEDOR="FULANO", VALOR_CONSOLIDADO="10"))
    assert a.tot[("total", "total")] == 1510.5
    e = a.emp["12345678"]
    assert e[0] == 1500.5 and e[1] == 1000.5 and e[2] == 500 and e[9] == 1000.5 and e[10] == 2
    assert e[4 + pgfn.GRUPOS.index("negociada")] == 500
    assert a.tot[("pessoa", "pf")] == 10 and len(a.pf_devedores) == 1
    assert a.tot[("ano", "2020")] == 1510.5


def test_grupos_de_situacao():
    assert pgfn.grupo_situacao("Em cobrança") == "cobranca"
    assert pgfn.grupo_situacao("Benefício Fiscal") == "negociada"
    assert pgfn.grupo_situacao("Garantia") == "garantida"
    assert pgfn.grupo_situacao("Suspenso por decisão judicial") == "suspensa"


def test_ignora_data_inventada():
    a = pgfn.Agregador()
    a.add("prev", linha(DATA_INSCRICAO="01/01/1000"))
    assert a.tot[("ano", "sem data")] == 1000.5
