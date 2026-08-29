# Roller-Tuner

Eine lokale App, um E-Scooter per Bluetooth **auszulesen und zu tunen** —
**Xiaomi**, **Segway·Ninebot** und **Navee**. Läuft komplett im Browser:
kein Server, kein Konto, keine Daten verlassen das Gerät.

> ⚠︎ **Nur auf privatem Gelände.** Wer einen E-Scooter über 20 km/h fährt,
> verliert im öffentlichen Straßenverkehr die Betriebserlaubnis und den
> Versicherungsschutz. Diese App ist zum Schrauben am **eigenen** Roller
> gedacht. Falsche Schreibwerte können Motor, Steuergerät oder Akku
> beschädigen.

Eigenständiges Projekt — **nichts** mit `Rollerwerkstatt` oder dem
Handy-Prüfstand (`App bauen2`) zu tun.

## Starten

```bash
npm install
npm run dev      # http://localhost:5173
```

Weitere Befehle:

```bash
npm run build    # statische Dateien nach dist/
npm run preview  # gebaute App lokal ansehen
npm test         # Tests (Vitest)
npm run lint     # oxlint
```

## Was die App kann

- **Verbinden**: Marke & Modell wählen; Demo-Modus zum Ausprobieren ohne Roller.
- **Übersicht**: Tempo, Akku, Spannung, Temperatur, Kilometerstand, Firmware.
- **Tunen**: Höchstgeschwindigkeit, Fahrmodus (Eco/Drive/Sport), Rekuperation,
  Tempomat, Zero Start.
- **ZT3**: eigener Reiter für die verschlüsselten Gen-3-Ninebot („Encryption2").

## Grenzen — ehrlich

- **Bluetooth nur in Chrome/Edge** (PC oder Android). Safari/iPhone können kein
  Web Bluetooth.
- **Stand jetzt**: Oberfläche, Modell-Katalog und Demo-Modus stehen. Die echte
  Bluetooth-Verbindung und die Schreibvorgänge werden gerade eingebaut.
- **ZT3 Pro / Gen 3**: Wir bauen den dokumentierten **Auth-Handshake** nach —
  keinen Bootloader-/Signatur-Bruch (Brick-Risiko). Ein bereits **gekoppelter**
  ZT3 lehnt ein neues Sitzungspasswort ab und muss evtl. zuerst zurückgesetzt
  werden (Unlock-Kabel / ScooterHacking Utility).
- **Navee** ist schlechter dokumentiert — erst zuverlässig auslesen, bevor
  geschrieben wird.

## Technik

Vite + React + TypeScript, Tests mit Vitest, Linting mit oxlint. Kein Backend.
Die Protokolle sind aus offener Doku der Scooter-Hacking-Gemeinde nachgebaut
(nicht kopiert).
