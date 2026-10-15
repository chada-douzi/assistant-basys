// Test simple de la détection exhaustive

const question = "Liste complète des équipements";

const words = question
  .toLocaleLowerCase("fr")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ")
  .split(/\s+/);

console.log("Question:", question);
console.log("Words:", words);

const normalizeSimple = (text) => text.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
const exhaustiveKeywords = ["tous", "toutes", "liste", "lister", "complet", "complete", "exhaustif", "exhaustive"];
const normalizedWords = words.map(normalizeSimple);

console.log("Normalized words:", normalizedWords);

const hasExhaustiveKeyword = normalizedWords.some(w => exhaustiveKeywords.includes(w));

console.log("Has exhaustive keyword:", hasExhaustiveKeyword);
console.log("Matched words:", normalizedWords.filter(w => exhaustiveKeywords.includes(w)));
