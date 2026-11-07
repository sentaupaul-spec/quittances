"""Outils communs aux tests : petit serveur local + navigateur (Playwright) + tableau simulé."""
import functools
import http.server
import socketserver
import threading
from pathlib import Path

import pytest
from playwright.sync_api import sync_playwright

RACINE = Path(__file__).resolve().parent.parent
SORTIE = RACINE / "tests" / "_sortie"

CSV_DEFAUT = (
    "Appartement,Civilité,Nom,Loyer,Charges,Email,Actif\n"
    "MD1,Madame,Exemple À Ignorer,500,50,,non\n"
    "MD1,Monsieur,Jean Dupont,550,\"50,00\",jean.dupont@example.com,oui\n"
    "MD1,Madame,Léa Petit,\"1 200\",\"50,5\",,oui\n"
    "MD2,Madame,Julie Martin,520,80,julie.martin@example.com,oui\n"
    "MD3,Monsieur,Éric Lanus,480,70,,oui\n"
)


class _Silencieux(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def end_headers(self):
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()


@pytest.fixture(scope="session")
def serveur():
    socketserver.TCPServer.allow_reuse_address = True
    handler = functools.partial(_Silencieux, directory=str(RACINE))
    httpd = socketserver.ThreadingTCPServer(("127.0.0.1", 0), handler)
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    yield f"http://127.0.0.1:{httpd.server_address[1]}"
    httpd.shutdown()


@pytest.fixture(scope="session")
def navigateur():
    with sync_playwright() as p:
        nav = p.chromium.launch()
        yield nav
        nav.close()


@pytest.fixture(scope="session", autouse=True)
def dossier_sortie():
    SORTIE.mkdir(exist_ok=True)
    return SORTIE


def simuler_tableau(contexte, etat):
    """Intercepte les appels au Google Sheet. etat = {'csv': str | None, 'statut': int, 'appels': int}"""
    def gerer(route):
        etat["appels"] = etat.get("appels", 0) + 1
        if etat.get("csv") is None:
            route.abort("internetdisconnected")
            return
        route.fulfill(status=etat.get("statut", 200), body=etat["csv"],
                      headers={"Content-Type": "text/csv; charset=utf-8", "Access-Control-Allow-Origin": "*"})
    contexte.route("https://docs.google.com/**", gerer)


@pytest.fixture
def page_vide(navigateur, serveur):
    """Une page sur un module JS (sans l'app), pour les tests unitaires."""
    ctx = navigateur.new_context()
    page = ctx.new_page()
    page.goto(serveur + "/tests/vide.html")
    yield page
    ctx.close()
