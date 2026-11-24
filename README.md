# Quanto Custa — Devedores da União

Quem deve ao governo federal: a Dívida Ativa da União (PGFN) por empresa, estado, tipo de dívida e situação.
Dados abertos da Procuradoria-Geral da Fazenda Nacional, atualizados a cada trimestre por um robô (GitHub Actions).
Pessoas físicas aparecem só nos totais.

Site: https://quantocustaum.com/quanto-custa-devedores/

- `atualizar.py` — robô (gera `docs/dados/*.json`)
- `coletor/pgfn.py` — leitura dos arquivos da PGFN
- `docs/` — o site (GitHub Pages)
