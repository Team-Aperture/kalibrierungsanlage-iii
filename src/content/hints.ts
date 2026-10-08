/**
 * Three-stage hints per puzzle: 1 = gentle nudge, 2 = the underlying principle,
 * 3 = a substantially more explicit strategy (but never a move list).
 * Future puzzles register their hints here under their puzzle id.
 */

export const HINTS: Record<string, [string, string, string]> = {
  energiepfad: [
    'Verfolge das grüne Leuchten: Es zeigt, wie weit der Strom von der QUELLE aus schon kommt. Dreh an dem Segment, an dem es endet.',
    'Zwei Segmente leiten nur, wenn ihre Öffnungen genau aneinanderstoßen. Das verschweißte Mittelstück lässt sich nicht drehen – und das verbrannte Segment unten darf keinen Strom bekommen. Jede Öffnung, die dorthin weiterleitet, löst einen Kurzschluss aus.',
    'Führe den Strom über die obere Reihe: von der Quelle nach oben in die linke obere Ecke, dann nach rechts und an der rechten Seite hinunter zum Ziel. Das T-Stück oben in der Mitte muss mit seinem Stiel nach oben zeigen – nicht nach unten ins Mittelstück, das direkt zum verbrannten Segment führt.',
  ],
};
