const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

const word = "équipements";
const normalized = normalizeText(word);

console.log("Original:", word);
console.log("Normalized:", normalized);
console.log("Starts with 'equipement':", normalized.startsWith("equipement"));
console.log("Includes 'equipement':", normalized.includes("equipement"));
console.log("Character codes:", [...normalized].map(c => `${c}:${c.charCodeAt(0)}`).join(' '));
