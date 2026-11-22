# SmartCart DE – Wocheneinkaufsplaner, Preisvergleich & Warenkorb-Bridge

Schlüsselfertiges Fullstack-Projekt für **Cloudflare Pages**, **Cloudflare Workers**, **Cloudflare D1 (SQLite)**, **Cloudflare Access (Google Auth)** sowie die begleitende **Chrome-Browser-Extension (`smartcart-bridge/`)** für **dm** und **REWE**.

---

## Projektstruktur

```text
smartcart-de/
├── README.md                  # Diese Anleitung
├── package.json               # Frontend-Abhängigkeiten & Build-Skripte
├── vite.config.js             # Vite-Konfiguration (inkl. Proxy für lokale Entwicklung)
├── tailwind.config.js         # Tailwind CSS Konfiguration
├── postcss.config.js          # PostCSS Konfiguration
├── index.html                 # HTML-Einstiegspunkt
├── wrangler.toml              # Cloudflare Pages, D1 & Cron-Trigger Konfiguration
├── schema.sql                 # Datenbank-Schema & Startdaten (dm, REWE, Lidl, Aldi)
├── src/
│   ├── main.jsx               # React Einstiegspunkt
│   ├── index.css              # Tailwind Styles
│   └── App.jsx                # Vollständige SmartCart DE Webanwendung (verbunden mit D1 API & Extension)
├── functions/
│   └── api/
│       ├── list.js            # GET / POST: Einkaufsliste & PLZ in Cloudflare D1 laden/speichern
│       ├── products.js        # GET: Aktuelle Produktpreise & Angebote aus D1 abrufen
│       └── sync-prices.js     # POST: Preis-Update-Endpunkt (für Cronjobs / Extension-Sync)
└── smartcart-bridge/          # Chrome-Browser-Extension für dm.de & shop.rewe.de
    ├── manifest.json          # Chrome Manifest V3
    ├── background.js          # Empfängt Warenkorb-Payloads aus der Web-App & öffnet Shop-Tabs
    └── content.js             # Befüllt den Warenkorb auf dm.de & shop.rewe.de & überträgt Preise
```

---

## Setup in 5 Schritten (GitHub + Cloudflare + Google Auth)

### Schritt 1: Code auf GitHub hochladen
1. Erstelle auf [github.com](https://github.com) ein neues **privates** Repository namens `smartcart-de`.
2. Entpacke dieses ZIP-Archiv und lade alle Dateien (außer optional `smartcart-bridge/` oder inkl. allem) in das Repository hoch:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: SmartCart DE"
   git branch -M main
   git remote add origin https://github.com/<DEIN-USER>/smartcart-de.git
   git push -u origin main
   ```

### Schritt 2: Cloudflare D1 Datenbank anlegen
1. Öffne das [Cloudflare Dashboard](https://dash.cloudflare.com) -> **Storage & Databases** -> **D1 SQL Database**.
2. Klicke auf **Create** und nenne die Datenbank `smartcart-db`.
3. Kopiere die angezeigte **Database ID** und trage sie in `wrangler.toml` bei `database_id = "..."` ein (und pushe die Änderung auf GitHub).
4. Öffne im D1-Dashboard den Tab **Console**, kopiere den gesamten Inhalt der Datei `schema.sql` hinein und klicke auf **Execute**, um Tabellen und Start-Artikel anzulegen.

### Schritt 3: Cloudflare Pages mit GitHub verbinden
1. Gehe im Cloudflare Dashboard zu **Workers & Pages** -> **Create** -> **Pages** -> **Connect to Git**.
2. Wähle dein Repository `smartcart-de` aus.
3. Trage als Build-Einstellungen ein:
   - **Framework preset:** `Vite`
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. Klicke auf **Save and Deploy**.
5. Gehe anschließend in deinem Pages-Projekt zu **Settings** -> **Functions** -> **D1 database bindings**:
   - **Variable name:** `DB`
   - **D1 database:** `smartcart-db`
   - Speichern & einmal neu deployen (**Deployments** -> **Retry deployment**).

### Schritt 4: Mit Google Auth absichern (Cloudflare Access)
1. Öffne im Cloudflare Dashboard **Zero Trust** -> **Access** -> **Applications** -> **Add an application** -> **Self-hosted**.
2. Gib als **Application domain** deine Pages-Domain an (z. B. `smartcart-de.pages.dev`).
3. Wähle unter **Identity providers** **Google** aus (einmalig Google OAuth Client ID & Secret aus der Google Cloud Console hinterlegen).
4. Erstelle eine Policy: **Action: Allow** -> **Include: Emails** -> *Deine eigene Google-E-Mail-Adresse*.
5. Ab sofort ist deine Einkaufs-App weltweit nur noch mit deinem Google-Login erreichbar.

### Schritt 5: Chrome-Extension (`smartcart-bridge`) installieren
1. Öffne in Google Chrome (oder Edge/Brave) die Adresse `chrome://extensions`.
2. Aktiviere oben rechts den **Entwicklermodus (Developer mode)**.
3. Klicke auf **Entpackte Erweiterung laden (Load unpacked)** und wähle den Ordner `smartcart-bridge/` aus diesem Archiv.
4. Logge dich einmalig in Chrome auf `https://www.dm.de` und `https://shop.rewe.de` ein (inkl. Auswahl deines REWE-Marktes).
5. Klicke in deiner SmartCart Web-App auf **„Bestellung & Export starten“** -> **„Warenkorb direkt in Chrome füllen“**. Die Extension öffnet die Shops automatisch und legt alle Artikel in deinen Warenkorb!
