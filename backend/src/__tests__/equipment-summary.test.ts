import { describe, expect, it } from "vitest";
import { extractEquipmentSummary } from "../equipment-summary.js";

const makeDoc = (id: string, content: string) => ({
  category: "Équipements",
  title: `Fiche équipement — ${id}`,
  content,
  tags: [id]
});

describe("extractEquipmentSummary", () => {
  it("extrait le statut et la date d'EQ-001", () => {
    const result = extractEquipmentSummary(makeDoc(
      "EQ-001",
      "Exemple fictif : EQ-001 est une pompe industrielle située dans l'atelier A. Son état simulé est en service et sa dernière maintenance est datée du 2026-09-15. Ces données ne proviennent pas de BaSYS."
    ));

    expect(result?.id).toBe("EQ-001");
    expect(result?.status).toBe("en service");
    expect(result?.lastMaintenanceDate).toBe("2026-09-15");
    expect(result?.isFictional).toBe(true);
  });

  it.each([
    ["EQ-002", "moteur électrique localisé dans l'atelier B. Son état simulé est en maintenance.", "en maintenance"],
    ["EQ-003", "compresseur installé dans la zone C. Son état simulé est en observation.", "en observation"],
    ["EQ-005", "ventilateur situé dans la zone B. Son état simulé est disponible et ne décrit aucun équipement réel.", "disponible"]
  ])("préserve le statut documenté de %s", (id, detail, expectedStatus) => {
    const result = extractEquipmentSummary(makeDoc(id, `Exemple fictif : ${id} est un ${detail}`));
    expect(result?.status).toBe(expectedStatus);
  });

  it.each([
    ["EQ-004", "capteur de température associé à la zone A. L'état opérationnel n'est pas renseigné. Aucune mesure réelle n'est disponible."],
    ["EQ-006", "générateur situé dans le local technique. Sa fiche contient un identifiant, un type et une localisation. L'état opérationnel n'est pas renseigné."],
    ["EQ-007", "filtre industriel situé dans la zone de traitement. L'état opérationnel n'est pas renseigné."],
    ["EQ-008", "vanne localisée dans le secteur D. L'état opérationnel n'est pas renseigné."]
  ])("n'invente pas de statut pour %s", (id, content) => {
    const result = extractEquipmentSummary(makeDoc(id, `Exemple fictif : ${id} est un ${content}`));
    expect(result?.status).toBeNull();
  });

  it.each([
    ["EQ-001", "pompe industrielle située dans l'atelier A.", "pompe industrielle", "l'atelier A"],
    ["EQ-002", "moteur électrique localisé dans l'atelier B.", "moteur électrique", "l'atelier B"],
    ["EQ-003", "compresseur installé dans la zone C.", "compresseur", "la zone C"],
    ["EQ-004", "capteur de température associé à la zone A.", "capteur de température", "la zone A"],
    ["EQ-005", "ventilateur situé dans la zone B.", "ventilateur", "la zone B"],
    ["EQ-006", "générateur situé dans le local technique.", "générateur", "le local technique"],
    ["EQ-007", "filtre industriel situé dans la zone de traitement.", "filtre industriel", "la zone de traitement"],
    ["EQ-008", "vanne localisée dans le secteur D.", "vanne", "le secteur D"]
  ])("extrait le type et la localisation de %s", (id, detail, expectedType, expectedLocation) => {
    const result = extractEquipmentSummary(
      makeDoc(id, `Exemple fictif : ${id} est un ${detail}`)
    );

    expect(result?.equipmentType).toBe(expectedType);
    expect(result?.location).toBe(expectedLocation);
  });
  it("ignore les documents hors catégorie Équipements", () => {
    const result = extractEquipmentSummary({
      category: "Maintenance",
      title: "Intervention EQ-001",
      content: "Exemple fictif : EQ-001 est en service.",
      tags: ["EQ-001"]
    });
    expect(result).toBeNull();
  });
});
