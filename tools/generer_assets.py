"""Génère les fichiers images de l'app (à relancer seulement si la signature ou l'icône change).

    python tools/generer_assets.py [chemin/vers/signature_originale.png]

- assets/signature.png : signature allégée (encre noire unie + transparence) → PDF léger.
- icons/*.png          : icônes de l'app (écran d'accueil iPad).
Nécessite : pip install pillow playwright && python -m playwright install chromium
"""
import sys
from pathlib import Path

from PIL import Image, ImageChops

RACINE = Path(__file__).resolve().parent.parent


def signature(source: Path) -> None:
    img = Image.open(source).convert("RGBA")
    r, g, b, a = img.split()
    # Opacité finale = opacité d'origine × noirceur du trait.
    gris = Image.merge("RGB", (r, g, b)).convert("L")
    encre = gris.point(lambda v: 255 - v)
    alpha = ImageChops.multiply(a, encre.point(lambda v: min(255, v * 2)))
    # Seuil doux : supprime le voile quasi invisible qui alourdit le fichier.
    alpha = alpha.point(lambda v: 0 if v < 12 else v)
    noir = Image.new("LA", img.size, 0)
    noir.putalpha(alpha)
    dest = RACINE / "assets" / "signature.png"
    noir.save(dest, optimize=True)
    print(f"{dest.relative_to(RACINE)} : {dest.stat().st_size // 1024} Ko ({img.size[0]}×{img.size[1]})")


def icones() -> None:
    from playwright.sync_api import sync_playwright

    with sync_playwright() as p:
        nav = p.chromium.launch()
        for taille, nom in [(180, "apple-touch-icon.png"), (192, "icon-192.png"), (512, "icon-512.png")]:
            page = nav.new_page(viewport={"width": taille, "height": taille})
            page.goto((RACINE / "tools" / "icone.html").as_uri())
            page.evaluate(f"document.getElementById('icone').setAttribute('width', {taille});"
                          f"document.getElementById('icone').setAttribute('height', {taille});")
            dest = RACINE / "icons" / nom
            page.locator("#icone").screenshot(path=str(dest), omit_background=False)
            # PNG opaque (iOS n'aime pas la transparence pour l'icône)
            Image.open(dest).convert("RGB").save(dest, optimize=True)
            print(f"{dest.relative_to(RACINE)} : {taille}×{taille}")
            page.close()
        nav.close()


if __name__ == "__main__":
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else RACINE / "assets" / "signature_annie_cresp.png"
    signature(src)
    icones()
