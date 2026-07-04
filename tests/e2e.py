# tests/e2e.py — Test end-to-end (browser reale). Eseguire con: python3 tests/e2e.py
# Richiede playwright. Serve l'app in locale e verifica i comportamenti critici.
import asyncio, http.server, socketserver, threading, os, sys, re

BASE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
os.chdir(BASE)
PORT = 8899
socketserver.TCPServer.allow_reuse_address = True
httpd = socketserver.TCPServer(("", PORT), http.server.SimpleHTTPRequestHandler)
threading.Thread(target=httpd.serve_forever, daemon=True).start()

from playwright.async_api import async_playwright

falliti = []
def check(nome, cond, dettaglio=''):
    print(f"  {'✅' if cond else '❌'} {nome} {dettaglio if not cond else ''}")
    if not cond: falliti.append(nome)

async def conta_movimenti(pg):
    # resiliente: durante il boot l'app fa redirect via location.hash, che può
    # distruggere il contesto di evaluate. Riprovo dopo un piccolo settle.
    for tentativo in range(4):
        try:
            return await pg.evaluate("""async () => {
              const req = indexedDB.open('FinanzePersonaliDB');
              return new Promise(res => { req.onsuccess = e => {
                const tx = e.target.result.transaction('movimenti','readonly').objectStore('movimenti').count();
                tx.onsuccess = () => res(tx.result);
              };});
            }""")
        except Exception:
            await pg.wait_for_timeout(1000)
    return 0

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':414,'height':896})
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.route('**cdnjs**', lambda r: r.abort())

        print('— PRIMO AVVIO (seed + sincronizzazione) —')
        await pg.goto(f'http://localhost:{PORT}/index.html', wait_until='domcontentloaded')
        await pg.wait_for_timeout(6000)
        n1 = await conta_movimenti(pg)
        check(f'app avviata senza errori JS', len(errs) == 0, str(errs[:3]))
        check(f'movimenti presenti dopo il seed ({n1})', n1 > 5000)

        print('— TEST D\'ORO: doppio avvio NON deve duplicare nulla —')
        await pg.goto(f'http://localhost:{PORT}/index.html', wait_until='domcontentloaded')
        await pg.wait_for_timeout(5000)
        n2 = await conta_movimenti(pg)
        check(f'stesso numero di movimenti al secondo avvio ({n1} = {n2})', n1 == n2, f'{n1} vs {n2}')

        print('— DOPPIONI RATE MUTUO —')
        dup = await pg.evaluate("""async () => {
          const req = indexedDB.open('FinanzePersonaliDB');
          return new Promise(res => { req.onsuccess = e => {
            const tx = e.target.result.transaction('movimenti','readonly').objectStore('movimenti').getAll();
            tx.onsuccess = () => {
              const rate = tx.result.filter(m => m.sub === 'Rata Mutuo');
              const per = {}; rate.forEach(r => { const k = r.data.slice(0,7); per[k] = (per[k]||0)+1; });
              res(Object.values(per).filter(n => n > 1).length);
            };
          };});
        }""")
        check('nessun mese con rata mutuo doppia', dup == 0, f'{dup} mesi doppi')

        print('— UNA SOLA RICORRENZA PER PRESTITO —')
        ric = await pg.evaluate("""async () => {
          const req = indexedDB.open('FinanzePersonaliDB');
          return new Promise(res => { req.onsuccess = e => {
            const tx = e.target.result.transaction('ricorrenti','readonly').objectStore('ricorrenti').getAll();
            tx.onsuccess = () => {
              const per = {}; tx.result.forEach(r => { if (r.origineMutuo) per[r.origineMutuo] = (per[r.origineMutuo]||0)+1; });
              res(Object.values(per).filter(n => n > 1).length);
            };
          };});
        }""")
        check('nessun prestito con ricorrenze duplicate', ric == 0, f'{ric} duplicati')

        print('— SCHERMATE PRINCIPALI SENZA ERRORI —')
        for rotta in ['spese','movimenti','patrimonio','ricorrenti','analisi','impostazioni','mutuo','finanziamenti','categorie']:
            errs.clear()
            await pg.goto(f'http://localhost:{PORT}/index.html#/{rotta}', wait_until='domcontentloaded')
            await pg.wait_for_timeout(1500)
            # settle: alcune schermate riscrivono l'header via location.hash durante il
            # render; attendo che il contesto sia stabile prima di interrogarlo
            try:
                vuota = await pg.evaluate("document.getElementById('app-root').innerHTML.trim().length < 10")
            except Exception:
                await pg.wait_for_timeout(800)
                vuota = await pg.evaluate("document.getElementById('app-root').innerHTML.trim().length < 10")
            check(f'{rotta}: renderizza senza errori', len(errs) == 0 and not vuota, str(errs[:2]))

        print('— VERSIONE IN IMPOSTAZIONI —')
        await pg.goto(f'http://localhost:{PORT}/index.html#/impostazioni', wait_until='domcontentloaded')
        await pg.wait_for_timeout(1200)
        txt = await pg.evaluate("document.body.innerText")
        ver = open(os.path.join(BASE,'js/core/version.js')).read()
        app_v = re.search(r"APP_VERSION\s*=\s*'([^']+)'", ver).group(1)
        check(f'la versione {app_v} è visibile in Impostazioni', app_v in txt)

        await b.close()

asyncio.run(main())
httpd.shutdown()
print()
if falliti:
    print(f'❌ {len(falliti)} TEST E2E FALLITI: {falliti}'); sys.exit(1)
print('✅ TUTTI I TEST E2E PASSANO')
