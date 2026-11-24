"""Sondagem da Dívida Ativa da União (PGFN): mede os arquivos e mostra o formato. CPF sempre mascarado."""
import io, json, re, sys, time, zipfile
from pathlib import Path
import requests
from coletor.privacidade import mascarar_cpf_no_texto

BASE = "https://dadosabertos.pgfn.gov.br/"
S = requests.Session(); S.headers["User-Agent"] = "QuantoCusta/1.0 (painel de transparencia com dados abertos)"
out = {}
Path("dados_brutos").mkdir(exist_ok=True)
idx = S.get(BASE, timeout=60).text
tri = sorted(set(re.findall(r'href="(\d{4}_trimestre_\d{2})/"', idx)))[-1]
out["trimestre"] = tri
arqs = re.findall(r'href="([^"]+\.zip)"', S.get(BASE + tri + "/", timeout=60).text)
out["arquivos"] = {}
tmp = Path("/tmp/pgfn"); tmp.mkdir(exist_ok=True)
for a in arqs:
    t0 = time.time(); p = tmp / a
    with S.get(BASE + tri + "/" + a, stream=True, timeout=600) as r:
        r.raise_for_status()
        with open(p, "wb") as f:
            for ch in r.iter_content(1 << 20): f.write(ch)
    info = {"zip_mb": round(p.stat().st_size / 1e6, 1), "baixou_s": round(time.time() - t0), "membros": []}
    with zipfile.ZipFile(p) as z:
        for m in z.infolist():
            d = {"nome": m.filename, "mb": round(m.file_size / 1e6, 1)}
            if len(info["membros"]) < 2:
                with z.open(m) as fh:
                    linhas = []
                    txt = io.TextIOWrapper(fh, encoding="latin-1", newline="")
                    for i, l in enumerate(txt):
                        if i < 6: linhas.append(mascarar_cpf_no_texto(l.rstrip()))
                        else: break
                    d["amostra"] = linhas
            info["membros"].append(d)
    info["n_membros"] = len(info["membros"]); info["membros"] = info["membros"][:6]
    # conta linhas e valores do primeiro membro para medir velocidade
    out["arquivos"][a] = info
    p.unlink()
    Path("dados_brutos/sondagem.json").write_text(json.dumps(out, ensure_ascii=False, indent=1), "utf-8")
print(json.dumps(out, ensure_ascii=False, indent=1)[:5000])
