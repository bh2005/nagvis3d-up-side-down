// DOM-Hilfsfunktionen
// ─────────────────────────────────────────────────────────────

// Escaped HTML-Sonderzeichen, damit Live-Daten (Plugin-Output, Hostnamen, …)
// aus dem WebSocket-Status-Update nicht als Markup interpretiert werden.
export function escHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
