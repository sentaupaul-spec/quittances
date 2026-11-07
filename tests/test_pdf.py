"""Contrôle du PDF : 1 page, poids, textes, positions, comparaison visuelle avec la référence."""
import base64
from pathlib import Path

import fitz  # PyMuPDF
import pytest

from conftest import RACINE, SORTIE

REFERENCE = RACINE / "tests" / "reference" / "exemple_quittance_reference.pdf"

# Même quittance que la référence validée (Madame Julie Martin, MD2, novembre 2026).
QUITTANCE_REF = {
    "version": 1, "id": "MD2|juliemartin|2026-11", "cle": "MD2|juliemartin", "appt": "MD2", "email": "",
    "civ": "Madame", "nom": "Julie Martin", "moisIdx": 10, "annee": 2026, "loyer": 520, "charges": 80,
    "datePaiement": "2026-11-01", "debut": "2026-11-01", "fin": "2026-11-30", "lieu": "Montpellier",
    "dateQuittance": "2026-11-07",
    "bailleur": {"nom": "Annie Cresp", "societe": "SCI CBI Annie Cresp", "adresse": "60 rue Dora Maar",
                 "cp": "34070", "ville": "Montpellier", "siret": "843 710 237 000 28 000 12"},
    "logement": {"adresse": "11 rue Guillaume d'Autignac", "cp": "34070", "ville": "Montpellier"},
    "creeLe": "2026-11-07T11:43:35.000Z",
}

GENERER = """async (q) => {
  const pdf = await import('/js/pdf.js');
  await pdf.chargerSignature('/assets/signature.png');
  const doc = pdf.construirePDF(q);
  const buf = doc.output('arraybuffer');
  let s = ''; const b = new Uint8Array(buf);
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return { b64: btoa(s), nom: pdf.nomFichier(q) };
}"""


def generer(page, q):
    r = page.evaluate(GENERER, q)
    return base64.b64decode(r["b64"]), r["nom"]


@pytest.fixture
def pdf_ref(page_vide):
    octets, nom = generer(page_vide, QUITTANCE_REF)
    (SORTIE / nom).write_bytes(octets)
    return octets, nom


def test_une_page_et_leger(pdf_ref):
    octets, nom = pdf_ref
    doc = fitz.open(stream=octets, filetype="pdf")
    assert doc.page_count == 1
    assert len(octets) < 200 * 1024, f"PDF trop lourd : {len(octets) // 1024} Ko"
    r = doc[0].rect
    assert (round(r.width), round(r.height)) == (595, 842)  # A4


def test_nom_fichier(pdf_ref):
    assert pdf_ref[1] == "Quittance_Novembre_2026_Julie_Martin.pdf"


def test_nom_fichier_accents(page_vide):
    q = dict(QUITTANCE_REF, nom="Éric-André  N'Diaye", moisIdx=1)
    nom = page_vide.evaluate("async (q) => (await import('/js/pdf.js')).nomFichier(q)", q)
    assert nom == "Quittance_Fevrier_2026_Eric_Andre_N_Diaye.pdf"


def test_textes_identiques_a_la_reference(pdf_ref):
    ref = fitz.open(REFERENCE)[0].get_text()
    nouveau = fitz.open(stream=pdf_ref[0], filetype="pdf")[0].get_text()
    assert nouveau == ref


def test_aucun_code_md_sur_la_quittance(pdf_ref):
    texte = fitz.open(stream=pdf_ref[0], filetype="pdf")[0].get_text()
    assert "MD1" not in texte and "MD2" not in texte and "MD3" not in texte


def test_rien_ne_deborde_signature_et_tampon(pdf_ref):
    page = fitz.open(stream=pdf_ref[0], filetype="pdf")[0]
    pr = page.rect
    for bloc in page.get_text("dict")["blocks"]:
        x0, y0, x1, y1 = bloc["bbox"]
        assert x0 >= 50 and x1 <= pr.width - 50 and y0 >= 0 and y1 <= pr.height - 20, bloc["bbox"]
    images = page.get_image_info()
    assert len(images) == 1
    x0, y0, x1, y1 = images[0]["bbox"]
    mm = 72 / 25.4
    assert abs(x0 / mm - 20) < 0.5 and abs((x1 - x0) / mm - 60) < 0.5 and abs((y1 - y0) / mm - 38) < 0.5
    assert x1 / mm < 120, "la signature doit rester à gauche"
    tampon = page.search_for("Siret : 843 710 237 000 28 000 12")[0]
    assert tampon.x0 / mm > 120, "le tampon doit être à droite"
    assert not fitz.Rect(images[0]["bbox"]).intersects(tampon)
    pied = page.search_for("Cette quittance annule")[0]
    assert pied.y0 > y1, "la signature ne doit pas toucher le pied de page"


def test_comparaison_visuelle(pdf_ref):
    """Rendu en image et comparaison pixel à pixel avec la référence validée."""
    dpi = 100
    a = fitz.open(REFERENCE)[0].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    b = fitz.open(stream=pdf_ref[0], filetype="pdf")[0].get_pixmap(dpi=dpi, colorspace=fitz.csGRAY)
    assert (a.width, a.height) == (b.width, b.height)
    differents = sum(1 for x, y in zip(a.samples, b.samples) if abs(x - y) > 48)
    part = differents / len(a.samples)
    b.save(str(SORTIE / "rendu_nouveau.png"))
    a.save(str(SORTIE / "rendu_reference.png"))
    assert part < 0.002, f"{part:.4%} des pixels diffèrent de la référence"


def test_regeneration_identique(page_vide):
    """Même instantané → exactement le même fichier, octet pour octet."""
    a, _ = generer(page_vide, QUITTANCE_REF)
    b, _ = generer(page_vide, QUITTANCE_REF)
    assert a == b


@pytest.mark.parametrize("modif", [
    {"nom": "Marie-Christine de La Rochefoucauld-Montbel", "loyer": 1280.5, "charges": 99.99},
    {"civ": "Monsieur", "nom": "Jean-Baptiste Emmanuel Zorg-Alexandrovitch", "loyer": 97771.71, "charges": 1999},
])
def test_cas_longs_tiennent_sur_une_page(page_vide, modif):
    q = dict(QUITTANCE_REF, **modif)
    octets, nom = generer(page_vide, q)
    page = fitz.open(stream=octets, filetype="pdf")
    assert page.page_count == 1
    p = page[0]
    for bloc in p.get_text("dict")["blocks"]:
        x0, y0, x1, y1 = bloc["bbox"]
        assert x0 >= 50 and x1 <= p.rect.width - 50, bloc["bbox"]
    sig = p.get_image_info()[0]["bbox"]
    assert sig[3] < p.search_for("Cette quittance annule")[0].y0
    p.get_pixmap(dpi=70).save(str(SORTIE / ("long_" + nom.replace(".pdf", ".png"))))
