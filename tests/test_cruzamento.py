import io
import json
import sys
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from coletor.cruzamento import Recebimentos, raiz  # noqa: E402


def test_raiz():
    assert raiz("33.000.167/0001-01") == "33000167"
    assert raiz("XXX123.456XX") == ""


def test_emendas_por_favorecido_so_pj():
    csvtxt = ('"Código da Emenda";"Código do Autor da Emenda";"Nome do Autor da Emenda";"Número da emenda";"Tipo de Emenda";"Ano/Mês";'
              '"Código do Favorecido";"Favorecido";"Natureza Jurídica";"Tipo Favorecido";"UF Favorecido";"Município Favorecido";"Valor Recebido"\n'
              '"1";"4089";"FULANO DE TAL";"5";"Individual";"202611";"11854334000149";"EMPRESA X";"Empresário";"Pessoa Jurídica";"RJ";"X";"1.204,50"\n'
              '"2";"4089";"FULANO DE TAL";"5";"Individual";"202611";"***123456**";"PESSOA";"";"Pessoa Física";"RJ";"X";"99,00"\n')
    b = io.BytesIO()
    with zipfile.ZipFile(b, "w") as z:
        z.writestr("EmendasParlamentares_PorFavorecido.csv", csvtxt.encode("latin-1"))
    r = Recebimentos()
    r.ler_emendas(b.getvalue())
    res = r.resumo_de("11854334")
    assert res["emendas"]["v"] == 1204.5 and res["emendas"]["anos"] == [2026, 2026]
    assert res["emendas"]["quem"] == [["Fulano De Tal", 1204.5]]
    assert len(r.d) == 1


def test_municipios_usa_a_prefeitura_que_pagou(tmp_path):
    (tmp_path / "f" / "002").mkdir(parents=True)
    (tmp_path / "resumo.json").write_text(json.dumps({"municipios": [{"sim": "002", "nome": "ABAIARA"}]}))
    (tmp_path / "f" / "002" / "2025.json").write_text(json.dumps({"colunas": ["nome", "cnpj", "tipo", "municipio", "valor", "notas"],
                                                                    "linhas": [["POSTO", "33000167000101", "PJ", "Rio de Janeiro", 100.0, 2]]}))
    r = Recebimentos()
    r.ler_municipios(tmp_path)
    assert r.resumo_de("33000167")["municipios"]["quem"] == [["Prefeitura de Abaiara (CE)", 100.0]]
