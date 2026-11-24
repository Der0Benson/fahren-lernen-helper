# Fahren Lernen Helper

Userscript für den Übungsmodus von Fahren Lernen. Es liest die angezeigte Fragennummer, ruft eine Lösungsseite ab und ordnet die Antworten den Eingabefeldern zu. Optional übernimmt es auch das Absenden und den Wechsel zur nächsten Frage.

Das Projekt ist experimentell und unabhängig von den Betreibern der beiden Webseiten.

## Installation

1. Tampermonkey im Browser installieren und für `html.fahren-lernen.de` aktivieren.
2. Ein neues Userscript anlegen und den vollständigen Inhalt von [`fahren-lernen.user.js`](fahren-lernen.user.js) einfügen.
3. Speichern und die Lernseite neu laden.

Zum Aktualisieren den bisherigen Scriptinhalt ersetzen. Keine zweite Kopie parallel aktivieren. Das private Repository bietet keine automatische Update-Verteilung.

## Bedienung

| Schaltfläche | Funktion |
| --- | --- |
| Aktuelle Frage ausfüllen | Lösung abrufen und passende Antworten eintragen. Sendet nicht ab. |
| Automatik starten | Im geführten Übungsmodus ausfüllen, absenden, Auswertung abwarten und weitergehen. |
| Stopp | Verhindert weitere Klicks. Bereits abgesendete Antworten werden nicht zurückgenommen. |

Während eines automatischen Durchlaufs nicht gleichzeitig Fragen wechseln oder Antworten ändern. Nach einem Neuladen muss die Automatik erneut gestartet werden.

## Unterstützte Aufgaben

- Multiple Choice mit eindeutig übereinstimmenden Antworttexten; die Reihenfolge ist unerheblich.
- Zahlenfragen mit einem einzelnen Eingabefeld und einem eindeutig erkannten Zahlenwert.
- Bildfragen mit passenden Textantworten.
- Vorbereitung von Videofragen über die Start- und Frage-Schaltflächen der Lernseite.
- Zweiter Abruf mit dem Zusatz `-M`, wenn die Adresse ohne Zusatz einen HTTP-404-Fehler liefert.

Bei abweichenden Antworttexten, mehreren Zahlenfeldern, unbekannten Bedienelementen oder unerwarteten Seitenwechseln hält das Script an. Bilder und Videos werden nicht inhaltlich ausgewertet. Die Zuordnung einer Mutterfrage garantiert daher nicht, dass jede Variante dieselbe Lösung hat.

Der Videoablauf und die vollständige Automatik sind nicht durch automatisierte Tests gegen die echte Lernplattform abgesichert. Änderungen an deren Oberfläche können Anpassungen erforderlich machen.

## Netzwerk und Daten

Das Script läuft auf `https://html.fahren-lernen.de/*`. Es ruft Lösungsseiten ausschließlich von `www.fuehrerscheintest-online.de` ab. Die Fragennummer steht dabei in der URL und ist für den Anbieter sichtbar; ebenso fallen die üblichen Verbindungsdaten an.

Die Lösungsanfragen verwenden `anonymous: true`. Es gibt keine eigene Telemetrie, keinen eigenen Server und keine dauerhafte Speicherung von Antworten. Im Automatikmodus werden Antworten über die normalen Schaltflächen der Lernplattform abgeschickt und können deren Lernfortschritt verändern.

Anfragen erfolgen nacheinander. Nur bei HTTP 404 wird gegebenenfalls die Variante mit `-M` versucht. Bei HTTP 403, 429 oder Serverfehlern hält der Durchlauf an. Das ersetzt keine Erlaubnis zum automatisierten Abruf.

## Entwicklung

Voraussetzung: Node.js 24. Keine zusätzlichen Pakete und kein Build-Schritt erforderlich.

```sh
node --check fahren-lernen.user.js
node --test tests/*.test.cjs
```

Die Tests verwenden lokale Nachbildungen der benötigten Browserfunktionen. Sie prüfen die Zuordnung von Antwortfeldern, Auswahlzustände, den URL-Fallback, das Absenden und Weitergehen sowie Abbruchbedingungen. Sie stellen keine Verbindung zu den Lernplattformen her und ersetzen keine Browserprüfung.

Vor einer neuen Version prüfen:

- Bereits ausgewählte Antworten werden nicht erneut umgeschaltet.
- Stopp verhindert weitere Eingaben und Navigation, auch während eines Abrufs.
- Absenden und Weitergehen warten jeweils auf die erwartete neue Seite.
- Ein unbekannter Zustand beendet den Durchlauf, statt einen Klick zu wiederholen.

## Nutzungshinweise

Die Veröffentlichung oder Weitergabe des Codes stellt keine Erlaubnis zum automatisierten Zugriff auf fremde Dienste dar. Beachte deren Nutzungsbedingungen sowie geltende Urheber- und Datenbankrechte. Hole erforderliche Genehmigungen vor der Nutzung ein.

Verwende das Script nicht für massenhafte oder belastende Anfragen, zur Umgehung von Zugriffsbeschränkungen oder zur Vortäuschung eigener Lern- und Prüfungsleistungen. Ein Hinweis in dieser Datei ersetzt weder eine Genehmigung noch eine rechtliche Prüfung.

Es werden keine Zusagen zu Richtigkeit, Verfügbarkeit oder Eignung gemacht. Gewährleistung und Haftung werden nur im gesetzlich zulässigen Umfang ausgeschlossen. Fremde Fragen, Antworten und Medien sind nicht Bestandteil dieses Repositorys.

## Lizenzstatus

Derzeit wird keine Open-Source-Lizenz eingeräumt. Das Repository dient zunächst der privaten Entwicklung. Rechte an Inhalten und Marken der genannten Anbieter verbleiben bei den jeweiligen Rechteinhabern.
