// Test de diagnostic pour voir exactement ce que contient normalizedTerms

const question = "Liste complète des équipements";

console.log("=== DIAGNOSTIC TERMS ===");
console.log("Question originale:", question);

// Étape 1: words
const words = question
  .toLocaleLowerCase("fr")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ")
  .split(/\s+/);

console.log("\n1. Words:", words);
console.log("   Types:", words.map(w => typeof w));
console.log("   Lengths:", words.map(w => w.length));

// Étape 2: normalizedWords (pour exhaustive detection)
const normalizeSimple = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const normalizedWords = words.map(normalizeSimple);
console.log("\n2. Normalized Words:", normalizedWords);

// Étape 3: filtrage stopwords
const stopWords = new Set([
  "le", "la", "les", "un", "une", "des", "de", "du",
  "et", "ou", "mais", "donc", "or", "ni", "car",
  "ce", "cette", "ces", "mon", "ton", "son",
  "je", "tu", "il", "elle", "nous", "vous", "ils", "elles",
  "me", "te", "se", "que", "qui", "quoi", "dont",
  "sur", "pour", "dans", "par", "avec", "sans",
  "est", "sont", "a", "ont", "être", "avoir",
  "peut", "veut", "doit", "faire", "dire"
]);

const terms = [
  ...new Set(
    words.filter(
      (term) => term.length >= 3 && !stopWords.has(term)
    )
  )
].slice(0, 10);

console.log("\n3. Terms (après filtrage):", terms);
console.log("   Count:", terms.length);

// Étape 4: normalizedTerms
const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

const normalizedTerms = terms.map(normalizeText);

console.log("\n4. Normalized Terms:", normalizedTerms);
console.log("   JSON:", JSON.stringify(normalizedTerms));

// Étape 5: vérifications individuelles
console.log("\n5. Vérifications individuelles:");
normalizedTerms.forEach((t, i) => {
  console.log(`   [${i}] "${t}"`);
  console.log(`       Type: ${typeof t}`);
  console.log(`       Length: ${t.length}`);
  console.log(`       CharCodes: ${[...t].map(c => c.charCodeAt(0)).join(',')}`);
  console.log(`       Includes "equipement": ${t.includes("equipement")}`);
  console.log(`       Includes "mainten": ${t.includes("mainten")}`);
});

// Étape 6: test de la condition exacte
const containsEquipment = normalizedTerms.some(t => t.includes("equipement"));
const containsMaintenance = normalizedTerms.some(t => t.includes("mainten"));

console.log("\n6. Résultats finaux:");
console.log("   containsEquipment:", containsEquipment);
console.log("   containsMaintenance:", containsMaintenance);

console.log("\n=== FIN DIAGNOSTIC ===");
