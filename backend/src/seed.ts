import "dotenv/config";
import mongoose from "mongoose";
import { KnowledgeDocument } from "./models/KnowledgeDocument.js";

const documents = [
  {
    slug: "consultation-equipement-demo",
    title: "Consulter une fiche équipement",
    category: "Guide utilisateur",
    content: "Dans ce scénario de démonstration, l'utilisateur recherche un équipement par son identifiant, ouvre sa fiche et vérifie son type, sa localisation, son état et la date de sa dernière maintenance. Les données présentées sont fictives et ne proviennent pas de BaSYS.",
    source: "Guide de démonstration — projet Assistant BaSYS",
    tags: ["équipement", "fiche", "identifiant", "localisation", "état"]
  },
  {
    slug: "diagnostic-anomalie-reseau-demo",
    title: "Premières vérifications en cas d'anomalie réseau",
    category: "Procédure de diagnostic",
    content: "Pour ce scénario fictif, commencer par identifier le réseau concerné, noter l'identifiant de l'anomalie et vérifier les dernières observations disponibles. Comparer les informations avec l'historique documenté. Si la cause n'est pas établie, transmettre le dossier au responsable technique plutôt que de conclure sans preuve.",
    source: "Procédure expérimentale — projet Assistant BaSYS",
    tags: ["réseau", "anomalie", "diagnostic", "historique", "responsable"]
  },
  {
    slug: "maintenance-preventive-demo",
    title: "Principes de maintenance préventive",
    category: "Maintenance",
    content: "La maintenance préventive vise à réduire les risques de défaillance par des inspections planifiées, la consignation des interventions et le suivi des recommandations du fabricant. Les intervalles doivent être définis selon les équipements et les procédures réellement applicables. Ce document est pédagogique et ne remplace pas une procédure officielle.",
    source: "Note pédagogique — projet Assistant BaSYS",
    tags: ["maintenance", "préventive", "inspection", "intervention", "équipement"]
  },
  {
    slug: "faq-assistant-demo",
    title: "FAQ — limites de l'assistant de démonstration",
    category: "FAQ",
    content: "L'assistant répond à partir des documents disponibles dans sa base de connaissances. Il doit indiquer lorsqu'une information n'est pas trouvée et citer les documents utilisés. Ce prototype n'est pas connecté à l'environnement réel de BaSYS et ne peut pas confirmer l'état réel d'une infrastructure.",
    source: "FAQ du prototype — projet Assistant BaSYS",
    tags: ["assistant", "FAQ", "sources", "limites", "documentation"]
  }
];

async function seed(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI absente du fichier .env");

  await mongoose.connect(uri);

  for (const document of documents) {
    await KnowledgeDocument.updateOne(
      { slug: document.slug },
      { $set: document },
      { upsert: true }
    );
  }

  console.log(`${documents.length} documents de démonstration enregistrés.`);
  await mongoose.disconnect();
}

seed().catch(async (error: unknown) => {
  console.error("Erreur pendant l'initialisation :", error);
  await mongoose.disconnect();
  process.exitCode = 1;
});
