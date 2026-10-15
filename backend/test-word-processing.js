const question = "Liste complète des équipements";

console.log("Question:", question);

// Étape par étape
const step1 = question.toLocaleLowerCase("fr");
console.log("\n1. toLowerCase:", step1);
console.log("   Chars:", [...step1].map(c => `${c}(${c.charCodeAt(0)})`).join(' '));

const step2 = step1.replace(/[^\p{L}\p{N}\s-]/gu, " ");
console.log("\n2. After replace:", step2);
console.log("   Chars:", [...step2].map(c => `${c}(${c.charCodeAt(0)})`).join(' '));

const words = step2.split(/\s+/);
console.log("\n3. After split:", words);
words.forEach((w, i) => {
  console.log(`   [${i}] "${w}" length=${w.length} chars=${[...w].map(c => c.charCodeAt(0)).join(',')}`);
});

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

const terms = [
  ...new Set(
    words.filter(
      (term) => term.length >= 3 && !stopWords.has(term)
    )
  )
].slice(0, 10);

console.log("\n4. After filtering (terms):", terms);
terms.forEach((t, i) => {
  console.log(`   [${i}] "${t}" length=${t.length} chars=${[...t].map(c => c.charCodeAt(0)).join(',')}`);
});
