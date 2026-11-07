"""Tests de bout en bout au format iPad (Playwright), avec le Google Sheet simulé."""
import base64
import json
import re

import fitz
import pytest
from playwright.sync_api import expect

from conftest import CSV_DEFAUT, SORTIE, simuler_tableau

IPAD = {
    "portrait": {"width": 820, "height": 1180},
    "paysage": {"width": 1180, "height": 820},
}

# Remplace navigator.share pour capturer le fichier partagé (comme le ferait le menu Partager de l'iPad).
PARTAGE_SIMULE = """
window.__partages = [];
window.__reponsePartage = 'ok';
navigator.canShare = (d) => !!(d && d.files && d.files.length);
navigator.share = async (d) => {
  if (!navigator.userActivation || !navigator.userActivation.isActive) throw new DOMException('pas de geste', 'NotAllowedError');
  const f = d.files[0];
  const b = new Uint8Array(await f.arrayBuffer());
  let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  window.__partages.push({ nom: f.name, type: f.type, titre: d.title, texte: d.text, b64: btoa(s) });
  if (window.__reponsePartage === 'annule') throw new DOMException('annulé', 'AbortError');
};
"""


def ouvrir(navigateur, serveur, ecran="portrait", partage=True, csv=CSV_DEFAUT):
    ctx = navigateur.new_context(viewport=IPAD[ecran], has_touch=True, locale="fr-FR", accept_downloads=True)
    tableau = {"csv": csv, "statut": 200}
    simuler_tableau(ctx, tableau)
    if partage:
        ctx.add_init_script(PARTAGE_SIMULE)
    page = ctx.new_page()
    erreurs = []
    page.on("pageerror", lambda e: erreurs.append(str(e)))
    page.goto(serveur + "/index.html")
    page.wait_for_selector("body[data-pret='1']")
    return ctx, page, tableau, erreurs


def choisir(page, nom):
    page.locator(".choix-btn", has_text=nom).click()


def partages(page):
    return page.evaluate("window.__partages")


@pytest.mark.parametrize("ecran", ["portrait", "paysage"])
def test_liste_chargee_et_groupee(navigateur, serveur, ecran):
    ctx, page, _, erreurs = ouvrir(navigateur, serveur, ecran)
    groupes = page.locator("#choix-locataires .groupe")
    expect(groupes).to_have_count(3)
    expect(groupes.nth(0)).to_contain_text("MD1")
    expect(groupes.nth(0)).to_contain_text("9 rue Jean de Montlaur")
    expect(groupes.nth(0).locator(".choix-btn")).to_have_count(2)       # la ligne « non » est ignorée
    expect(page.locator("#choix-locataires")).not_to_contain_text("Exemple")
    expect(page.locator("#etat-liste")).to_contain_text("Liste mise à jour")
    # mois en cours par défaut
    assert page.evaluate("+document.getElementById('c-mois').value") == page.evaluate("new Date().getMonth()")
    # étapes 3 et 4 en attente tant qu'aucun locataire n'est choisi
    expect(page.locator("#attente-3")).to_be_visible()
    expect(page.locator("#btn-envoyer")).to_be_hidden()
    # pas de défilement horizontal
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    page.screenshot(path=str(SORTIE / f"ecran_creer_{ecran}.png"), full_page=True)
    assert erreurs == []
    ctx.close()


def test_accessibilite_tailles(navigateur, serveur):
    ctx, page, _, _ = ouvrir(navigateur, serveur)
    choisir(page, "Julie Martin")
    page.locator("#plus summary").click()
    petits = page.evaluate("""() => {
      const pb = [];
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect(); const st = getComputedStyle(el);
        if (!r.width || !r.height || st.visibility === 'hidden') continue;
        const aTexte = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
        if (aTexte && parseFloat(st.fontSize) < 17.99) pb.push('texte ' + st.fontSize + ' : ' + el.textContent.trim().slice(0, 40));
        if (el.matches('button')) {
          if (r.height < 55.5) pb.push('bouton ' + Math.round(r.height) + 'px : ' + el.textContent.trim().slice(0, 40));
        }
        if (el.matches('input, select, summary') && r.height < 48) pb.push('zone ' + Math.round(r.height) + 'px : ' + el.id);
      }
      return pb;
    }""")
    assert petits == []
    ctx.close()


def test_creation_et_partage(navigateur, serveur):
    ctx, page, _, erreurs = ouvrir(navigateur, serveur)
    choisir(page, "Julie Martin")
    page.select_option("#c-mois", "10")
    page.select_option("#c-annee", "2026")
    expect(page.locator("#c-loyer")).to_have_value("520,00")
    expect(page.locator("#c-charges")).to_have_value("80,00")
    expect(page.locator("#c-total")).to_have_text("600,00 €")
    expect(page.locator("#c-datepaiement")).to_have_value("2026-11-01")
    expect(page.locator("#c-debut")).to_have_value("2026-11-01")
    expect(page.locator("#c-fin")).to_have_value("2026-11-30")
    expect(page.locator("#c-lieu")).to_have_value("Montpellier")
    expect(page.locator("#aide-mail")).to_contain_text("julie.martin@example.com")

    # modification ponctuelle : total recalculé en direct
    page.fill("#c-charges", "85,5")
    expect(page.locator("#c-total")).to_have_text("605,50 €")

    page.click("#btn-envoyer")
    expect(page.locator("#message-creer")).to_have_text("C'est fait.")
    p = partages(page)
    assert len(p) == 1
    assert p[0]["nom"] == "Quittance_Novembre_2026_Julie_Martin.pdf"
    assert p[0]["type"] == "application/pdf"
    assert p[0]["titre"] == "Quittance de loyer — Novembre 2026"
    assert p[0]["texte"] == ("Bonjour Madame Martin,\n\nVoici votre quittance de loyer du mois de novembre 2026."
                             "\n\nJe vous en souhaite bonne réception.\n\nCordialement,\nAnnie Cresp")
    pdf = base64.b64decode(p[0]["b64"])
    texte = fitz.open(stream=pdf, filetype="pdf")[0].get_text()
    assert "cinq cent quatre-vingt-dix euros" not in texte
    assert "six cent cinq euros et cinquante centimes (605,50 €)" in texte.replace("\n", " ")
    assert len(pdf) < 200 * 1024

    # aucun onglet Archives
    expect(page.locator(".onglet")).to_have_count(2)
    assert erreurs == []
    ctx.close()






def test_partage_annule(navigateur, serveur):
    ctx, page, _, _ = ouvrir(navigateur, serveur)
    page.evaluate("window.__reponsePartage = 'annule'")
    choisir(page, "Léa Petit")
    expect(page.locator("#c-loyer")).to_have_value("1 200,00")
    page.click("#btn-envoyer")
    expect(page.locator("#message-creer")).to_contain_text("Envoi annulé")
    ctx.close()


def test_saisie_invalide(navigateur, serveur):
    ctx, page, _, _ = ouvrir(navigateur, serveur)
    choisir(page, "Léa Petit")
    page.fill("#c-loyer", "douze")
    expect(page.locator("#c-total")).to_have_text("—")
    page.click("#btn-envoyer")
    expect(page.locator("#message-creer")).to_contain_text("Le loyer n'est pas lisible")
    assert partages(page) == []
    ctx.close()


def test_ordinateur_sans_partage_telecharge(navigateur, serveur):
    ctx, page, _, _ = ouvrir(navigateur, serveur, partage=False)
    page.evaluate("delete Navigator.prototype.share; delete Navigator.prototype.canShare")
    choisir(page, "Julie Martin")
    with page.expect_download() as dl:
        page.click("#btn-telecharger")
    assert re.match(r"Quittance_[A-Za-z]+_\d{4}_Julie_Martin\.pdf", dl.value.suggested_filename)
    expect(page.locator("#message-creer")).to_contain_text("PDF téléchargé")
    ctx.close()


def test_tous_les_locataires(navigateur, serveur):
    ctx, page, _, _ = ouvrir(navigateur, serveur)
    page.select_option("#c-mois", "10"); page.select_option("#c-annee", "2026")
    page.locator("#tous summary").click()
    lignes = page.locator(".tous-ligne")
    expect(lignes).to_have_count(4)
    lignes.nth(0).locator("button").click()
    expect(page.locator("#message-tous")).to_contain_text("c'est fait")
    expect(lignes.nth(0)).to_contain_text("✓ Envoyée")
    expect(lignes.nth(0).locator("button")).to_have_text("Renvoyer")
    lignes.nth(1).locator("button").click()
    expect(lignes.nth(1)).to_contain_text("✓ Envoyée")
    noms = [x["nom"] for x in partages(page)]
    assert noms == ["Quittance_Novembre_2026_Jean_Dupont.pdf", "Quittance_Novembre_2026_Lea_Petit.pdf"]
    ctx.close()




def test_hors_ligne(navigateur, serveur):
    ctx, page, tableau, _ = ouvrir(navigateur, serveur)
    # attendre que le service worker ait tout mis de côté
    page.evaluate("navigator.serviceWorker.ready.then(() => true)")
    page.reload()
    page.wait_for_selector("body[data-pret='1']")
    assert page.evaluate("!!navigator.serviceWorker.controller")

    # plus d'internet du tout
    tableau["csv"] = None
    ctx.set_offline(True)
    page.reload()
    page.wait_for_selector("body[data-pret='1']")
    expect(page.locator("#etat-liste")).to_contain_text("Pas de connexion internet")
    expect(page.locator("#choix-locataires .choix-btn")).to_have_count(4)
    choisir(page, "Julie Martin")
    page.click("#btn-envoyer")
    expect(page.locator("#message-creer")).to_contain_text("C'est fait")
    assert len(partages(page)) == 1
    page.click("[data-onglet='locataires']")
    page.click("#btn-actualiser")
    expect(page.locator("#message-locataires")).to_contain_text("wifi")
    ctx.close()


def test_premiere_ouverture_sans_internet(navigateur, serveur):
    ctx, page, _, _ = ouvrir(navigateur, serveur, csv=None)
    expect(page.locator("#sans-liste")).to_be_visible()
    expect(page.locator("#sans-liste")).to_contain_text("Vérifiez que le wifi est allumé")
    ctx.close()


def test_tableau_non_partage(navigateur, serveur):
    ctx = navigateur.new_context(viewport=IPAD["portrait"])
    ctx.route("https://docs.google.com/**", lambda r: r.fulfill(status=401, body="<!DOCTYPE html>",
                                                                 headers={"Access-Control-Allow-Origin": "*"}))
    page = ctx.new_page()
    page.goto(serveur + "/index.html")
    page.wait_for_selector("body[data-pret='1']")
    expect(page.locator("#sans-liste")).to_contain_text("Prévenez Paul")
    ctx.close()


def test_bandeau_safari_ipad(navigateur, serveur):
    ua = ("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) "
          "Version/17.0 Safari/605.1.15")
    ctx = navigateur.new_context(viewport=IPAD["portrait"], user_agent=ua, has_touch=True)
    simuler_tableau(ctx, {"csv": CSV_DEFAUT})
    ctx.add_init_script("Object.defineProperty(navigator, 'platform', {get: () => 'MacIntel'});"
                        "Object.defineProperty(navigator, 'maxTouchPoints', {get: () => 5});")
    page = ctx.new_page()
    page.goto(serveur + "/index.html")
    expect(page.locator("#bandeau-safari")).to_be_visible()
    expect(page.locator("#bandeau-safari")).to_contain_text("Quittances")
    ctx.close()
    # Ordinateur : pas de bandeau
    ctx2 = navigateur.new_context()
    simuler_tableau(ctx2, {"csv": CSV_DEFAUT})
    p2 = ctx2.new_page()
    p2.goto(serveur + "/index.html")
    p2.wait_for_selector("body[data-pret='1']")
    expect(p2.locator("#bandeau-safari")).to_be_hidden()
    ctx2.close()


@pytest.mark.parametrize("ecran", ["portrait", "paysage"])
def test_captures_onglets(navigateur, serveur, ecran):
    ctx, page, _, _ = ouvrir(navigateur, serveur, ecran)
    choisir(page, "Julie Martin")
    page.click("#btn-envoyer")
    expect(page.locator("#message-creer")).to_contain_text("C'est fait")
    page.screenshot(path=str(SORTIE / f"ecran_creer_rempli_{ecran}.png"), full_page=True)
    for onglet in ["locataires"]:
        page.click(f"[data-onglet='{onglet}']")
        assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
        page.screenshot(path=str(SORTIE / f"ecran_{onglet}_{ecran}.png"), full_page=True)
    ctx.close()


def test_manifeste_et_icones(navigateur, serveur):
    ctx = navigateur.new_context()
    page = ctx.new_page()
    m = page.request.get(serveur + "/manifest.webmanifest").json()
    assert m["short_name"] == "Quittances" and m["display"] == "standalone"
    page.goto(serveur + "/index.html")
    assert page.get_attribute("link[rel='apple-touch-icon']", "href") == "icons/apple-touch-icon.png"
    assert page.get_attribute("meta[name='apple-mobile-web-app-capable']", "content") == "yes"
    r = page.request.get(serveur + "/icons/apple-touch-icon.png")
    assert r.ok and r.body()[:8] == b"\x89PNG\r\n\x1a\n"
    import struct
    w, h = struct.unpack(">II", r.body()[16:24])
    assert (w, h) == (180, 180)
    # aucune ressource externe (pas de CDN)
    html = page.content()
    assert "cdn" not in html.lower()
    ctx.close()


def test_modification_du_sheet_prise_en_compte(navigateur, serveur):
    """Paul modifie le Sheet → Annie voit la nouvelle liste (Actualiser ou réouverture)."""
    ctx, page, tableau, _ = ouvrir(navigateur, serveur)
    tableau["csv"] = (CSV_DEFAUT
                      .replace("Julie Martin,520,80", "Julie Martin,540,85")
                      .replace("Jean Dupont,550,\"50,00\",jean.dupont@example.com,oui",
                               "Jean Dupont,550,\"50,00\",jean.dupont@example.com,non")
                      + "MD3,Madame,Nina Nouvelle,450,60,nina@example.com,oui\n")
    page.click("[data-onglet='locataires']")
    page.click("#btn-actualiser")
    expect(page.locator("#message-locataires")).to_contain_text("à jour")
    liste = page.locator("#liste-locataires")
    expect(liste).not_to_contain_text("Jean Dupont")
    expect(liste).to_contain_text("Nina Nouvelle")
    expect(liste).to_contain_text("625,00 €")
    page.click("[data-onglet='creer']")
    choisir(page, "Julie Martin")
    expect(page.locator("#c-total")).to_have_text("625,00 €")
    # à la réouverture aussi
    tableau["csv"] = tableau["csv"].replace("Nina Nouvelle", "Nina Renommée")
    page.reload(); page.wait_for_selector("body[data-pret='1']")
    expect(page.locator("#choix-locataires")).to_contain_text("Nina Renommée")
    ctx.close()


def test_rien_n_est_conserve(navigateur, serveur):
    """Seule la liste des locataires est gardée sur l'appareil, aucune quittance."""
    ctx, page, _, _ = ouvrir(navigateur, serveur)
    choisir(page, "Julie Martin")
    page.click("#btn-envoyer")
    expect(page.locator("#message-creer")).to_have_text("C'est fait.")
    cles = page.evaluate("""() => new Promise((ok) => {
      const r = indexedDB.open('quittances');
      r.onsuccess = () => { const db = r.result; const t = db.transaction('reglages');
        const q = t.objectStore('reglages').getAllKeys(); q.onsuccess = () => ok([[...db.objectStoreNames], q.result]); };
    })""")
    assert cles == [["reglages"], ["liste"]]
    ctx.close()
