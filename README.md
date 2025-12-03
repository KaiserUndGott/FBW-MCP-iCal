# iCloud Calendar MCP Server

Ein lokaler MCP (Model Context Protocol) Server für macOS, der Zugriff auf deinen iCloud Kalender ermöglicht.

## Features

- **Kalender auflisten**: Alle verfügbaren Kalender (iCloud, lokal, abonniert) anzeigen
- **Termine lesen**: Termine in einem Zeitraum abrufen, optional gefiltert nach Kalender
- **Termine erstellen**: Neue Termine mit Titel, Datum, Ort, Beschreibung anlegen
- **Termine aktualisieren**: Bestehende Termine bearbeiten
- **Termine löschen**: Termine entfernen

## Voraussetzungen

- macOS 12.0 oder neuer
- Node.js 18+

## Installation

1. **Repository klonen und Abhängigkeiten installieren:**

```bash
git clone https://github.com/DEIN_USERNAME/FBW-MCP-iCal.git
cd FBW-MCP-iCal
npm install
npm run build
```

2. **In Claude Desktop konfigurieren:**

Füge folgendes zu deiner Claude Desktop Konfiguration hinzu (`~/.claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "icloud-calendar": {
      "command": "node",
      "args": ["/PFAD/ZUM/REPO/dist/index.js"]
    }
  }
}
```

3. **Berechtigung erteilen:**

Beim ersten Aufruf wird macOS fragen, ob Claude die Kalender-App steuern darf.
Gehe zu **Systemeinstellungen > Datenschutz & Sicherheit > Automation** und erlaube Claude den Zugriff auf "Kalender".

## Verfügbare Tools

### `list_calendars`
Listet alle verfügbaren Kalender auf.

**Rückgabe:**
- `name`: Kalendername
- `id`: Index des Kalenders

### `list_events`
Listet Termine in einem Zeitraum auf.

**Parameter:**
- `startDate` (erforderlich): Startdatum im ISO8601-Format
- `endDate` (erforderlich): Enddatum im ISO8601-Format
- `calendarName` (optional): Nur Termine aus diesem Kalender

**Beispiel:**
```json
{
  "startDate": "2024-01-01T00:00:00Z",
  "endDate": "2024-01-31T23:59:59Z",
  "calendarName": "Arbeit"
}
```

### `create_event`
Erstellt einen neuen Termin.

**Parameter:**
- `title` (erforderlich): Titel des Termins
- `startDate` (erforderlich): Startzeit im ISO8601-Format
- `endDate` (erforderlich): Endzeit im ISO8601-Format
- `calendarName` (optional): Kalendername (sonst "Kalender")
- `isAllDay` (optional): Ganztägiger Termin
- `location` (optional): Ort
- `description` (optional): Beschreibung

**Beispiel:**
```json
{
  "title": "Meeting mit Team",
  "startDate": "2024-01-15T10:00:00",
  "endDate": "2024-01-15T11:00:00",
  "calendarName": "Arbeit",
  "location": "Konferenzraum A",
  "description": "Quartalsplanung besprechen"
}
```

### `update_event`
Aktualisiert einen bestehenden Termin.

**Parameter:**
- `eventSummary` (erforderlich): Aktueller Titel des Termins
- `calendarName` (erforderlich): Kalendername
- `newTitle` (optional): Neuer Titel
- `startDate` (optional): Neue Startzeit
- `endDate` (optional): Neue Endzeit
- `location` (optional): Neuer Ort
- `description` (optional): Neue Beschreibung

### `delete_event`
Löscht einen Termin.

**Parameter:**
- `eventSummary` (erforderlich): Titel des zu löschenden Termins
- `calendarName` (erforderlich): Kalendername

## Technische Details

Der MCP Server verwendet AppleScript, um über die macOS Kalender-App auf die Kalender zuzugreifen. Dies ermöglicht den Zugriff auf alle Kalender, die in der Kalender-App konfiguriert sind, einschließlich iCloud, Google, Exchange und lokale Kalender.

## Fehlerbehebung

### "Automation access denied"
Gehe zu **Systemeinstellungen > Datenschutz & Sicherheit > Automation** und erlaube Claude den Zugriff auf die Kalender-App.

### Kalender-App öffnet sich
Das ist normal - der Server startet die Kalender-App im Hintergrund, um auf die Daten zuzugreifen.

### Keine iCloud Kalender sichtbar
Stelle sicher, dass iCloud Kalender in den Systemeinstellungen aktiviert ist und in der Kalender-App angezeigt wird.

## Lizenz

MIT
