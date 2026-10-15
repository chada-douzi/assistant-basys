const normalizeText = (value) =>
  String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("fr");

const terms = ['liste', 'complète', 'équipements'];

console.log("Terms:", terms);
console.log("\nNormalization process:");

terms.forEach((term, i) => {
  console.log(`\n[${i}] Original: "${term}"`);
  console.log(`    CharCodes: ${[...term].map(c => c.charCodeAt(0)).join(',')}`);
  
  const nfd = term.normalize("NFD");
  console.log(`    After NFD: "${nfd}"`);
  console.log(`    CharCodes: ${[...nfd].map(c => c.charCodeAt(0)).join(',')}`);
  
  const withoutAccents = nfd.replace(/[\u0300-\u036f]/g, "");
  console.log(`    After removing accents: "${withoutAccents}"`);
  console.log(`    CharCodes: ${[...withoutAccents].map(c => c.charCodeAt(0)).join(',')}`);
  
  const final = withoutAccents.toLocaleLowerCase("fr");
  console.log(`    Final (toLowerCase): "${final}"`);
  console.log(`    CharCodes: ${[...final].map(c => c.charCodeAt(0)).join(',')}`);
  console.log(`    Length: ${final.length}`);
  console.log(`    Includes "equipement": ${final.includes("equipement")}`);
});

const normalizedTerms = terms.map(normalizeText);
console.log("\n\nFinal normalizedTerms:", normalizedTerms);
console.log("JSON:", JSON.stringify(normalizedTerms));

const containsEquipment = normalizedTerms.some(t => t.includes("equipement"));
console.log("\ncontainsEquipment:", containsEquipment);
