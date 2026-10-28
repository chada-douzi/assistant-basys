export interface EquipmentSummary {
  id: string;
  title: string;
  equipmentType: string;
  location: string | null;
  status: string | null;
  lastMaintenanceDate: string | null;
  isFictional: boolean;
}

const extractField = (
  text: string,
  pattern: RegExp
): string | null => {
  const match = text.match(pattern);
  return match?.[1]?.trim() ?? null;
};

export function extractEquipmentSummary(
  document: { title: string; content: string; category: string; tags?: string[] }
): EquipmentSummary | null {
  if (document.category !== "Équipements") return null;

  const searchableText = [
    document.title,
    document.content,
    ...(document.tags ?? [])
  ].join(" ");

  const id = searchableText.match(/\bEQ-\d{3}\b/i)?.[0]?.toUpperCase();
  if (!id) return null;

  const equipmentType = extractField(
    document.content,
    new RegExp(`\\b${id}\\s+est\\s+(?:un|une)\\s+(.+?)(?=\\s+(?:situé|situee|située|localisé|localisée|localise|installé|installee|associé|associe|dans|$))`, "i")
  );

  const location =
    extractField(document.content, /\b(?:située?|localisée?|installée?)\s+(?:dans|au|à|en)\s+(.+?)(?=[.;]|$)/i) ??
    extractField(document.content, /\bassocié[e]?\s+à\s+(.+?)(?=[.;]|$)/i);

  const statusMatch = document.content.match(
    /état simulé est (en service|en maintenance|en observation|disponible)\b/i
  );
  const status = statusMatch?.[1]?.toLowerCase() ?? null;
  const lastMaintenanceDate = extractField(
    document.content,
    /\bdernière maintenance est datée du\s+(\d{4}-\d{2}-\d{2})\b/i
  );

  const normalizedStatus = status && /n'est pas renseigné/i.test(status)
    ? null
    : status;

  return {
    id,
    title: document.title,
    equipmentType: equipmentType ?? document.title.replace(/^Fiche équipement\s*[—-]\s*/i, ""),
    location,
    status: normalizedStatus,
    lastMaintenanceDate,
    isFictional: /exemple fictif|ne proviennent pas de BaSYS|dataset fictif/i.test(
      `${document.content} ${document.title}`
    )
  };
}
