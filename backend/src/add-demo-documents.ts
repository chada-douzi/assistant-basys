import "dotenv/config";
import mongoose from "mongoose";
import { KnowledgeDocument } from "./models/KnowledgeDocument.js";

const entries = [
  ["equipement-pompe-demo", "Fiche équipement — Pompe industrielle", "Équipements", "Exemple fictif : EQ-001 est une pompe industrielle située dans l'atelier A. Son état simulé est en service et sa dernière maintenance est datée du 2026-09-15. Ces données ne proviennent pas de BaSYS.", "EQ-001|pompe|équipement|atelier A|en service"],
  ["equipement-moteur-demo", "Fiche équipement — Moteur électrique", "Équipements", "Exemple fictif : EQ-002 est un moteur électrique localisé dans l'atelier B. Son état simulé est en maintenance. Les données ne proviennent pas de BaSYS.", "EQ-002|moteur|équipement|atelier B|maintenance"],
  ["equipement-compresseur-demo", "Fiche équipement — Compresseur", "Équipements", "Exemple fictif : EQ-003 est un compresseur installé dans la zone C. Son état simulé est en observation. Cette donnée ne permet pas de conclure à une panne réelle.", "EQ-003|compresseur|équipement|zone C|observation"],
  ["equipement-capteur-demo", "Fiche équipement — Capteur de température", "Équipements", "Exemple fictif : EQ-004 est un capteur de température associé à la zone A. Cet exemple teste la recherche par type et localisation. Aucune mesure réelle n'est disponible.", "EQ-004|capteur|température|équipement|zone A"],
  ["equipement-ventilateur-demo", "Fiche équipement — Ventilateur", "Équipements", "Exemple fictif : EQ-005 est un ventilateur situé dans la zone B. Son état simulé est disponible et ne décrit aucun équipement réel.", "EQ-005|ventilateur|équipement|zone B|disponible"],
  ["equipement-generateur-demo", "Fiche équipement — Générateur", "Équipements", "Exemple fictif : EQ-006 est un générateur situé dans le local technique. Sa fiche contient un identifiant, un type, une localisation et un état simulé.", "EQ-006|générateur|équipement|local technique"],
  ["equipement-filtre-demo", "Fiche équipement — Filtre industriel", "Équipements", "Exemple fictif : EQ-007 est un filtre industriel situé dans la zone de traitement. Cet exemple teste la recherche par nom, identifiant et emplacement.", "EQ-007|filtre|équipement|traitement|emplacement"],
  ["equipement-vanne-demo", "Fiche équipement — Vanne", "Équipements", "Exemple fictif : EQ-008 est une vanne localisée dans le secteur D. Les valeurs sont simulées et ne doivent pas servir à une intervention réelle.", "EQ-008|vanne|équipement|secteur D"],
  ["maintenance-historique-demo", "Consulter l'historique de maintenance", "Maintenance", "Dans le prototype, l'historique regroupe les interventions fictives associées à un équipement. L'utilisateur recherche l'équipement par identifiant. Si aucune intervention n'est enregistrée, l'assistant doit le signaler.", "historique|maintenance|intervention|équipement"],
  ["maintenance-intervention-demo", "Consulter une intervention de maintenance", "Maintenance", "Exemple fictif : l'intervention INT-001 est associée à EQ-001. Son statut simulé est terminée. Cet exemple ne prouve aucune intervention réelle.", "INT-001|intervention|maintenance|EQ-001|terminée"],
  ["maintenance-planification-demo", "Principes de planification des inspections", "Maintenance", "Les inspections pédagogiques sont planifiées selon l'équipement et les consignes applicables. Le dataset ne définit aucun intervalle universel. Pour une périodicité réelle, consulter la documentation autorisée.", "planification|inspection|périodicité|maintenance"],
  ["maintenance-statut-demo", "Comprendre les statuts de maintenance", "Maintenance", "Pour le prototype, les statuts fictifs peuvent être planifiée, en cours ou terminée. Ils illustrent le suivi documentaire et ne garantissent pas les statuts utilisés dans BaSYS.", "statut|planifiée|en cours|terminée|maintenance"],
  ["maintenance-donnees-manquantes-demo", "Traiter une information de maintenance absente", "Maintenance", "Si une date de maintenance ou le détail d'une intervention manque, l'assistant doit signaler l'information indisponible. Il ne doit inventer ni date, ni durée, ni périodicité, ni intervention.", "information absente|date|durée|maintenance|fiabilité"],
  ["incident-identification-demo", "Identifier un incident", "Procédure de diagnostic", "Exemple fictif : INC-001 désigne une anomalie de communication signalée dans la zone A. Rechercher cet identifiant pour consulter sa description. Il ne provient d'aucun système BaSYS réel.", "INC-001|incident|anomalie|communication|zone A"],
  ["incident-priorite-demo", "Consulter la priorité d'un incident", "Procédure de diagnostic", "Dans le dataset fictif, un incident peut avoir un champ de priorité. Si cette priorité n'est pas renseignée, l'assistant doit signaler son absence sans attribuer lui-même un niveau.", "incident|priorité|niveau|classification"],
  ["incident-observations-demo", "Consulter les observations d'un incident", "Procédure de diagnostic", "Les observations fictives décrivent les éléments consignés lors du signalement. L'assistant peut les résumer, mais ne doit pas ajouter de mesures, de causes ou de symptômes non documentés.", "incident|observations|symptômes|description"],
  ["incident-suivi-demo", "Suivre le traitement d'un incident", "Procédure de diagnostic", "Le suivi fictif d'un incident permet de consulter son identifiant, son statut et les observations enregistrées. Le prototype ne modifie aucun statut et n'agit pas sur une infrastructure réelle.", "incident|suivi|statut|observations"],
  ["incident-escalade-demo", "Transmettre un incident non résolu", "Procédure de diagnostic", "Si les observations ne permettent pas d'expliquer un incident, le dossier est transmis au responsable technique pour examen. L'assistant ne doit pas annoncer une résolution sans preuve.", "incident|non résolu|responsable technique|escalade"],
  ["guide-recherche-equipement-demo", "Rechercher un équipement par identifiant", "Guide utilisateur", "Dans le prototype, l'utilisateur peut rechercher un identifiant fictif comme EQ-001. L'assistant recherche les documents correspondants et présente les informations disponibles. Il ne s'agit pas d'une connexion à BaSYS.", "recherche|identifiant|EQ-001|équipement"],
  ["guide-recherche-mots-cles-demo", "Rechercher des informations par mots-clés", "Guide utilisateur", "Le prototype utilise les mots de la question pour rechercher des documents dans MongoDB. La pertinence dépend des titres, catégories, tags et contenus. Une question reformulée peut produire des résultats différents.", "recherche|mots-clés|MongoDB|RAG|documents"],
  ["guide-sources-reponse-demo", "Comprendre les sources d'une réponse", "Guide utilisateur", "L'API retourne une réponse générée et les documents sélectionnés pour construire son contexte. Une source indique qu'un document a été transmis au modèle, mais ne garantit pas à elle seule que chaque phrase est exacte.", "sources|réponse|contexte|RAG|API"],
  ["guide-reformulation-question-demo", "Reformuler une question sans réponse", "Guide utilisateur", "Si aucune information pertinente n'est trouvée, préciser le nom ou l'identifiant de l'équipement, la catégorie ou l'incident concerné. Une reformulation ne doit pas conduire l'assistant à inventer des informations.", "question|reformulation|identifiant|recherche"],
  ["guide-limites-recherche-demo", "Limites de la recherche documentaire", "Guide utilisateur", "La recherche du prototype repose sur des correspondances textuelles et un score calculé à partir des titres, tags, catégories et contenus. Un document pertinent peut être manqué si les termes diffèrent.", "limites|recherche textuelle|score|pertinence"],
  ["faq-donnees-reelles-demo", "L'assistant utilise-t-il des données réelles de BaSYS ?", "FAQ", "Non. Le prototype utilise un dataset fictif créé pour les essais. Il n'est pas connecté à une base BaSYS réelle et ne confirme aucune valeur, aucun incident ni aucune intervention en production.", "FAQ|données réelles|données fictives|BaSYS"],
  ["faq-commande-automatique-demo", "L'assistant peut-il exécuter une commande automatiquement ?", "FAQ", "Non. Dans cette version, l'assistant recherche des documents et génère des réponses textuelles. Il ne commande aucun équipement, ne modifie aucune configuration et ne répare aucun incident automatiquement.", "FAQ|commande|automatisation|configuration|sécurité"],
  ["faq-information-inconnue-demo", "Que faire si une information est absente ?", "FAQ", "Lorsque les documents ne contiennent pas l'information demandée, l'assistant doit le dire explicitement. Il ne doit inventer aucune valeur, procédure, date ou commande. Pour une opération réelle, consulter une documentation autorisée.", "FAQ|information absente|hallucination|fiabilité"]
] as const;

async function main(): Promise<void> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI absente du fichier .env");

  await mongoose.connect(uri);
  try {
    for (const [slug, title, category, content, tagText] of entries) {
      await KnowledgeDocument.updateOne(
        { slug },
        {
          $set: {
            slug,
            title,
            category,
            content,
            source: "Dataset fictif — prototype Assistant BaSYS",
            tags: tagText.split("|")
          }
        },
        { upsert: true }
      );
    }
    console.log(`${entries.length} documents de démonstration ajoutés ou mis à jour.`);
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("Erreur pendant l'ajout des documents :", error);
  process.exitCode = 1;
});
