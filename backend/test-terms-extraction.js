const question = "Liste complète des équipements";

const stopWords = new Set([
  "que", "quoi", "qui", "comment", "pourquoi", "quand",
  "faire", "faut", "peut", "peux", "dois", "est", "sont",
  "dans", "pour", "avec", "sans", "sur", "sous", "chez",
  "les", "des", "une", "un", "la", "le", "du", "de",
  "en", "et", "ou", "au", "aux", "ce", "ces", "cette",
  "mon", "ma", "mes", "son", "sa", "ses", "je", "tu",
  "il", "elle", "nous", "vous", "ils", "elles", "on",
  "y", "a", "d", "l", "ne", "pas", "plus", "cas"
]);

const words = question
  .toLocaleLowerCase("fr")
  .replace(/[^\p{L}\p{N}\s-]/gu, " ")
  .split(/\s+/);

const terms = [
  ...new Set(
    words.filter(
      (term) => term.length >= 3 && !stopWords.has(term)
    )
  )
].slice(0, 10);

console.log("Words:", words);
console.log("Terms:", terms);

const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

const normalizedTerms = terms.map(normalizeText);

console.log("Normalized Terms:", normalizedTerms);

const containsEquipment = normalizedTerms.some(t => t.includes("equipement"));
console.log("Contains equipement:", containsEquipment);
console.log("Match:", normalizedTerms.filter(t => t.includes("equipement")));
