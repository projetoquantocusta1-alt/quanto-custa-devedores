"""Sondagem: lista os arquivos de um .zip público e as primeiras linhas de cada CSV (CPF mascarado). Uso: python sondar_zip.py URL"""
import io, json, sys, zipfile
from pathlib import Path
import requests
from coletor.privacidade import mascarar_cpf_no_texto
url = sys.argv[1]
r = requests.get(url, timeout=900, headers={"User-Agent": "QuantoCusta/1.0 (painel de transparencia com dados abertos)"})
r.raise_for_status()
z = zipfile.ZipFile(io.BytesIO(r.content))
out = {"url": url, "zip_mb": round(len(r.content) / 1e6, 1), "membros": []}
for m in z.infolist():
    d = {"nome": m.filename, "mb": round(m.file_size / 1e6, 1)}
    with z.open(m) as fh:
        d["amostra"] = [mascarar_cpf_no_texto(l.rstrip()) for _, l in zip(range(4), io.TextIOWrapper(fh, encoding="latin-1"))]
    out["membros"].append(d)
Path("dados_brutos").mkdir(exist_ok=True)
Path("dados_brutos/sondagem_zip.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), "utf-8")
print(json.dumps(out, ensure_ascii=False, indent=1)[:6000])
