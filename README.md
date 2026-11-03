# 🎓 DOD Formulář (Den otevřených dveří – INFIS)

Minimalistický webový formulář pro studenty a administrátorské rozhraní pro sběr odpovědí a fotografií na Den otevřených dveří.

---

## ⚡ Rychlé spuštění

Aplikace je kompletně připravená a funkční.

```bash
# 1. Spuštění serveru
npm start

# Nebo pro vývoj s automatickým restartem:
npm run dev
```

Po spuštění otevřete v prohlížeči:
- **Formulář pro studenty:** [http://localhost:3000](http://localhost:3000)
- **Přehled odpovědí (Admin):** [http://localhost:3000/admin](http://localhost:3000/admin)

---

## 📋 Připravená struktura formuláře

Formulář je rozdělen do čistých logických sekcí:

1. **Základní údaje**
   - Jméno a příjmení (`fullName`) *– povinné*
   - Třída a obor (`schoolClass`) *– povinné* (např. IT3, 2.TL, GD4)
   - E-mailová adresa (`email`) *(volitelné)*
2. **Tvoje zkušenost se školou**
   - Proč sis vybral/a naši školu? (`whySchool`) *– povinné*
   - Co se ti na škole nejvíc líbí / co tě baví? (`whatYouLike`) *– povinné*
   - Oblíbený předmět nebo zaměření (`favoriteSubject`) *(volitelné)*
   - Rada nebo vzkaz pro budoucí prváky (`adviceForFreshmen`) *(volitelné)*
3. **Projekty a úspěchy**
   - Projekty, na kterých jsi pracoval/a (`projects`) *(volitelné)*
   - Soutěže, hackathony a ocenění (`competitions`) *(volitelné)*
4. **Odkazy a sociální sítě**
   - Instagram (`instagram`)
   - GitHub (`github`)
   - LinkedIn (`linkedin`)
   - Portfolio / vlastní web (`portfolio`)
5. **Reprezentativní fotka**
   - Drag & drop nahrání nebo výběr ze souboru (`photo`)
   - Živý náhled, informace o velikosti, možnost fotku smazat/vyměnit
   - Podporuje JPG, PNG, WEBP, HEIC (max 15 MB)
6. **Souhlas se zveřejněním**
   - GDPR / souhlas se zveřejněním na webu školy a DOD (`consent`)

---

## 🛡️ Administrace (`/admin`)

V přehledu na `/admin` můžete:
- **Prohlížet všechny odeslané odpovědi** v přehledných kartách.
- **Filtrovat** podle třídy, vyhledávat v textu a filtrovat záznamy s/bez fotky.
- **Zobrazit detail studenta** v okně s formátovanými odpověďmi a klikacími odkazy.
- **Stahovat originální fotografie** ve vysoké kvalitě jedním kliknutím.
- **Exportovat data do CSV** (s kódováním UTF-8 BOM optimalizovaným pro Microsoft Excel v češtině).
- **Exportovat data do JSON**.
- **Mazat odpovědi** (automaticky smaže i soubor fotky z disku).

---

## 📁 Ukládání dat

Všechna data se ukládají lokálně bez nutnosti konfigurovat externí databázi:
- `data/submissions.json` – všechny odpovědi a metadata.
- `data/uploads/` – nahrané fotografie studentů.

---

## 🛠️ Jak upravit otázky

Jakmile budete mít finální znění otázek, stačí:
1. V souboru [public/index.html](file:///public/index.html) upravit popisky nebo přidat další `<input>` / `<textarea>`.
2. V souboru [src/storage.js](file:///src/storage.js) případně přidat nová pole do objektu submission.
