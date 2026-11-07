"""Lecture du Google Sheet (CSV) : colonnes, montants, lignes ignorées."""

LIRE = "async (csv) => (await import('/js/sheet.js')).lireLocataires(csv)"


def lire(page, csv):
    return page.evaluate(LIRE, csv)


def test_cas_nominal(page_vide):
    csv = ("Appartement,Civilité,Nom,Loyer,Charges,Email,Actif\n"
           "MD1,Madame,Exemple,500,50,,non\n"
           "MD2,Madame,Julie Martin,520,80,julie@example.com,oui\n")
    r = lire(page_vide, csv)
    assert r["ignorees"] == []
    assert len(r["locataires"]) == 1
    l = r["locataires"][0]
    assert (l["appt"], l["civ"], l["nom"], l["loyer"], l["charges"], l["email"]) == \
           ("MD2", "Madame", "Julie Martin", 520, 80, "julie@example.com")


def test_colonnes_dans_le_desordre_et_en_plus(page_vide):
    csv = ("Email,Actif,Remarque,Charges,Nom,Loyer,Civilité,Appartement\n"
           "a@b.fr,oui,blabla,30,Paul Durand,400,Monsieur,MD3\n")
    l = lire(page_vide, csv)["locataires"][0]
    assert (l["appt"], l["civ"], l["nom"], l["loyer"], l["charges"], l["email"]) == \
           ("MD3", "Monsieur", "Paul Durand", 400, 30, "a@b.fr")


def test_entetes_accents_casse_espaces(page_vide):
    csv = (" APPARTEMENT , civilite ,NOM,LOYER ,Charges, E-mail ,ACTIF\n"
           "md1,monsieur,Jean Dupont,550,50,j@d.fr,OUI\n")
    l = lire(page_vide, csv)["locataires"][0]
    assert (l["appt"], l["civ"], l["email"]) == ("MD1", "Monsieur", "j@d.fr")


def test_montants_formats_varies(page_vide):
    csv = ("Appartement,Civilité,Nom,Loyer,Charges,Email,Actif\n"
           'MD1,Madame,A,"1 200,50","50,5",,oui\n'
           "MD1,Madame,B,550,\"550,00\",,oui\n"
           "MD1,Madame,C,\"1 200\",,,oui\n"
           "MD1,Madame,D,600 €,0,,oui\n")
    loc = {l["nom"]: l for l in lire(page_vide, csv)["locataires"]}
    assert (loc["A"]["loyer"], loc["A"]["charges"]) == (1200.5, 50.5)
    assert (loc["B"]["loyer"], loc["B"]["charges"]) == (550, 550)
    assert (loc["C"]["loyer"], loc["C"]["charges"]) == (1200, 0)
    assert loc["D"]["loyer"] == 600


def test_lignes_vides_et_inactifs(page_vide):
    csv = ("Appartement,Civilité,Nom,Loyer,Charges,Email,Actif\n"
           ",,,,,,\n"
           "\n"
           "MD1,Madame,Partie,500,50,,non\n"
           "MD1,Madame,Partie2,500,50,,Non \n"
           "MD1,Madame,Restée,500,50,,oui\n"
           "MD1,Madame,SansActif,500,50,,\n")
    r = lire(page_vide, csv)
    assert sorted(l["nom"] for l in r["locataires"]) == ["Restée", "SansActif"]
    assert r["ignorees"] == []


def test_appartement_inconnu_signale(page_vide):
    csv = ("Appartement,Civilité,Nom,Loyer,Charges,Email,Actif\n"
           "MD4,Madame,Inconnue,500,50,,oui\n"
           ",Madame,SansLogement,500,50,,oui\n"
           "MD1,Madame,Bonne,500,50,,oui\n"
           "MD1,Madame,LoyerVide,,50,,oui\n")
    r = lire(page_vide, csv)
    assert [l["nom"] for l in r["locataires"]] == ["Bonne"]
    raisons = {x["nom"]: (x["ligne"], x["raison"]) for x in r["ignorees"]}
    assert raisons["Inconnue"][0] == 2 and "MD4" in raisons["Inconnue"][1]
    assert raisons["SansLogement"][0] == 3
    assert raisons["LoyerVide"] == (5, "loyer illisible")


def test_entete_manquante(page_vide):
    assert lire(page_vide, "Truc,Machin\n1,2\n")["erreur"] == "entete"
    assert lire(page_vide, "")["erreur"] == "entete"


def test_guillemets_virgules_et_bom(page_vide):
    csv = ('﻿"Appartement","Civilité","Nom","Loyer","Charges","Email","Actif"\r\n'
           '"MD2","Madame","Martin, Julie ""Juju""","520","80","","oui"\r\n')
    l = lire(page_vide, csv)["locataires"][0]
    assert l["nom"] == 'Martin, Julie "Juju"'


def test_tri_par_logement_puis_nom(page_vide):
    csv = ("Appartement,Civilité,Nom,Loyer,Charges,Email,Actif\n"
           "MD3,Madame,Zoé,1,0,,oui\nMD1,Madame,Yves,1,0,,oui\nMD1,Madame,Anne,1,0,,oui\nMD2,Madame,Bob,1,0,,oui\n")
    assert [l["nom"] for l in lire(page_vide, csv)["locataires"]] == ["Anne", "Yves", "Bob", "Zoé"]


def test_doublon_signale(page_vide):
    csv = ("Appartement,Civilité,Nom,Loyer,Charges,Email,Actif\n"
           "MD1,Madame,Anne Roy,1,0,,oui\nMD1,Madame,anne  roy,1,0,,oui\n")
    r = lire(page_vide, csv)
    assert len(r["locataires"]) == 1 and r["ignorees"][0]["raison"] == "en double"


def test_telechargement_erreurs(navigateur, serveur):
    """Le tableau non partagé (page de connexion Google) ou sans réseau → erreurs typées."""
    ctx = navigateur.new_context()
    page = ctx.new_page()
    page.goto(serveur + "/tests/vide.html")
    reponses = {"statut": 401, "corps": "<!DOCTYPE html><html>login</html>"}

    def gerer(route):
        if reponses["statut"] == 0:
            route.abort("internetdisconnected")
        else:
            route.fulfill(status=reponses["statut"], body=reponses["corps"],
                          headers={"Access-Control-Allow-Origin": "*"})
    ctx.route("https://docs.google.com/**", gerer)
    appel = "async () => { try { await (await import('/js/sheet.js')).telechargerLocataires(); return 'ok'; } catch (e) { return e.type; } }"
    assert page.evaluate(appel) == "acces"
    reponses.update(statut=200)
    assert page.evaluate(appel) == "acces"   # page HTML au lieu du tableau
    reponses.update(statut=200, corps="a,b\n1,2")
    assert page.evaluate(appel) == "format"
    reponses.update(statut=0)
    assert page.evaluate(appel) == "reseau"
    ctx.close()
