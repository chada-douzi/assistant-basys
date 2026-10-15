import { describe, it, expect } from 'vitest';
import {
  normalizeText,
  extractEquipmentIds,
  hasExhaustiveKeyword,
  extractSearchTerms,
  containsEquipmentTheme,
  containsMaintenanceTheme,
  calculateDocumentLimit,
  scoreDocument,
  calculateScoreThreshold,
  type ScoredDocument
} from '../rag-utils.js';

describe('normalizeText', () => {
  it('supprime les accents français', () => {
    expect(normalizeText('équipements')).toBe('equipements');
    expect(normalizeText('Maintenance préventive')).toBe('maintenance preventive');
    expect(normalizeText('complète')).toBe('complete');
  });

  it('convertit en minuscules', () => {
    expect(normalizeText('ÉQUIPEMENTS')).toBe('equipements');
    expect(normalizeText('Équipements')).toBe('equipements');
  });

  it('gère les valeurs null/undefined', () => {
    expect(normalizeText(null)).toBe('');
    expect(normalizeText(undefined)).toBe('');
  });

  it('préserve les caractères non accentués', () => {
    expect(normalizeText('maintenance')).toBe('maintenance');
    expect(normalizeText('eq-003')).toBe('eq-003');
  });
});

describe('extractEquipmentIds', () => {
  it('extrait les identifiants au format XX-NNN', () => {
    const ids = extractEquipmentIds('Quelle est la pression du compresseur EQ-003 ?');
    expect(ids).toEqual(['eq-003']);
  });

  it('extrait plusieurs identifiants', () => {
    const ids = extractEquipmentIds('Comparer EQ-001 et EQ-002');
    expect(ids).toHaveLength(2);
    expect(ids).toContain('eq-001');
    expect(ids).toContain('eq-002');
  });

  it('déduplique les identifiants', () => {
    const ids = extractEquipmentIds('EQ-003 est un compresseur. Le EQ-003 est en observation.');
    expect(ids).toEqual(['eq-003']);
  });

  it('normalise en minuscules', () => {
    const ids = extractEquipmentIds('Fiche EQ-003');
    expect(ids).toEqual(['eq-003']);
  });

  it('retourne tableau vide si aucun identifiant', () => {
    const ids = extractEquipmentIds('Quels sont les équipements ?');
    expect(ids).toEqual([]);
  });

  it('accepte formats INT-XXX et INC-XXX', () => {
    const idsInt = extractEquipmentIds('Intervention INT-001');
    expect(idsInt).toEqual(['int-001']);
    
    const idsInc = extractEquipmentIds('Incident INC-001');
    expect(idsInc).toEqual(['inc-001']);
  });
});

describe('hasExhaustiveKeyword', () => {
  it('détecte "liste complète"', () => {
    expect(hasExhaustiveKeyword('Liste complète des équipements')).toBe(true);
  });

  it('détecte "tous"', () => {
    expect(hasExhaustiveKeyword('Donne-moi tous les équipements')).toBe(true);
  });

  it('détecte "exhaustif"', () => {
    expect(hasExhaustiveKeyword('Inventaire exhaustif')).toBe(true);
  });

  it('insensible aux accents', () => {
    expect(hasExhaustiveKeyword('Liste complète')).toBe(true);
    expect(hasExhaustiveKeyword('Liste complete')).toBe(true);
  });

  it('insensible à la casse', () => {
    expect(hasExhaustiveKeyword('LISTE COMPLÈTE')).toBe(true);
  });

  it('retourne false si aucun mot-clé', () => {
    expect(hasExhaustiveKeyword('Quels sont les équipements ?')).toBe(false);
    expect(hasExhaustiveKeyword('Fiche EQ-003')).toBe(false);
  });
});

describe('extractSearchTerms', () => {
  it('extrait les termes significatifs', () => {
    const terms = extractSearchTerms('Quels sont les équipements documentés ?');
    expect(terms).toContain('equipements');
    expect(terms).toContain('documentes');
  });

  it('filtre les stopwords', () => {
    const terms = extractSearchTerms('Quels sont les équipements dans la zone');
    expect(terms).not.toContain('quels');
    expect(terms).not.toContain('sont');
    expect(terms).not.toContain('les');
    expect(terms).not.toContain('dans');
    expect(terms).not.toContain('la');
  });

  it('filtre les termes trop courts (<3 caractères)', () => {
    const terms = extractSearchTerms('Équipements de la zone A ou B');
    expect(terms).not.toContain('de');
    expect(terms).not.toContain('la');
    expect(terms).not.toContain('ou');
    // Note: "a" et "b" sont stopwords donc déjà filtrés
  });

  it('normalise les accents', () => {
    const terms = extractSearchTerms('Liste complète des équipements');
    expect(terms).toContain('liste');
    expect(terms).toContain('complete');
    expect(terms).toContain('equipements');
  });

  it('limite le nombre de termes', () => {
    const longQuestion = 'mot1 mot2 mot3 mot4 mot5 mot6 mot7 mot8 mot9 mot10 mot11 mot12';
    const terms = extractSearchTerms(longQuestion, 10);
    expect(terms.length).toBeLessThanOrEqual(10);
  });

  it('déduplique les termes', () => {
    const terms = extractSearchTerms('équipements équipements maintenance');
    expect(terms.filter(t => t === 'equipements').length).toBe(1);
  });
});

describe('containsEquipmentTheme', () => {
  it('détecte "equipement"', () => {
    expect(containsEquipmentTheme(['liste', 'equipement'])).toBe(true);
  });

  it('détecte "equipements" (pluriel)', () => {
    expect(containsEquipmentTheme(['liste', 'equipements'])).toBe(true);
  });

  it('retourne false si absent', () => {
    expect(containsEquipmentTheme(['liste', 'maintenance'])).toBe(false);
  });
});

describe('containsMaintenanceTheme', () => {
  it('détecte "maintenance"', () => {
    expect(containsMaintenanceTheme(['historique', 'maintenance'])).toBe(true);
  });

  it('détecte variantes avec "mainten"', () => {
    expect(containsMaintenanceTheme(['maintenances'])).toBe(true);
    expect(containsMaintenanceTheme(['mainteneur'])).toBe(true);
  });

  it('retourne false si absent', () => {
    expect(containsMaintenanceTheme(['liste', 'equipements'])).toBe(false);
  });
});

describe('calculateDocumentLimit', () => {
  it('retourne 10 pour liste exhaustive avec thème', () => {
    expect(calculateDocumentLimit(true, true)).toBe(10);
  });

  it('retourne 5 pour liste exhaustive sans thème', () => {
    expect(calculateDocumentLimit(true, false)).toBe(5);
  });

  it('retourne 5 pour question standard', () => {
    expect(calculateDocumentLimit(false, true)).toBe(5);
    expect(calculateDocumentLimit(false, false)).toBe(5);
  });
});

describe('scoreDocument', () => {
  const mockDoc: ScoredDocument = {
    slug: 'equipement-pompe-demo',
    title: 'Fiche équipement EQ-001 — Pompe industrielle',
    category: 'Équipements',
    content: 'EQ-001 est une pompe industrielle située dans l\'atelier A.',
    tags: ['eq-001', 'pompe', 'équipement', 'atelier a']
  };

  it('boost massif pour identifiant exact dans titre', () => {
    const score = scoreDocument(mockDoc, {
      terms: ['pompe'],
      equipmentIds: ['eq-001'],
      hasEquipmentInQuestion: true,
      hasMaintenanceInQuestion: false
    });
    
    expect(score).toBeGreaterThan(1000);
  });

  it('boost catégorie si thème équipement détecté', () => {
    const score = scoreDocument(mockDoc, {
      terms: ['pompe'],
      equipmentIds: [],
      hasEquipmentInQuestion: true,
      hasMaintenanceInQuestion: false
    });
    
    expect(score).toBeGreaterThan(50);
  });

  it('score correct pour terme dans titre', () => {
    const score = scoreDocument(mockDoc, {
      terms: ['pompe'],
      equipmentIds: [],
      hasEquipmentInQuestion: false,
      hasMaintenanceInQuestion: false
    });
    
    // pompe dans title (+10) + content (+1) + tags (+6)
    expect(score).toBeGreaterThanOrEqual(10);
  });

  it('score 0 si aucune correspondance', () => {
    const score = scoreDocument(mockDoc, {
      terms: ['couscous'],
      equipmentIds: [],
      hasEquipmentInQuestion: false,
      hasMaintenanceInQuestion: false
    });
    
    expect(score).toBe(0);
  });

  it('boost maintenance si thème maintenance détecté', () => {
    const maintenanceDoc: ScoredDocument = {
      slug: 'maintenance-historique',
      title: 'Consulter l\'historique de maintenance',
      category: 'Maintenance',
      content: 'L\'historique regroupe les interventions.',
      tags: ['historique', 'maintenance']
    };

    const score = scoreDocument(maintenanceDoc, {
      terms: ['historique'],
      equipmentIds: [],
      hasEquipmentInQuestion: false,
      hasMaintenanceInQuestion: true
    });
    
    expect(score).toBeGreaterThan(30);
  });

  it('accumule les scores pour plusieurs termes', () => {
    const score = scoreDocument(mockDoc, {
      terms: ['pompe', 'atelier'],
      equipmentIds: [],
      hasEquipmentInQuestion: false,
      hasMaintenanceInQuestion: false
    });
    
    // pompe: title(10) + content(1) + tags(6) = 17
    // atelier: content(1) + tags(6) = 7
    // Total >= 24
    expect(score).toBeGreaterThanOrEqual(20);
  });
});

describe('calculateScoreThreshold', () => {
  it('retourne 1 pour questions multi-thèmes', () => {
    expect(calculateScoreThreshold(true)).toBe(1);
  });

  it('retourne 3 pour questions mono-thème', () => {
    expect(calculateScoreThreshold(false)).toBe(3);
  });
});

describe('Scénarios intégrés', () => {
  it('Pipeline complet: recherche par ID exact', () => {
    const question = 'Quelle est la pression du compresseur EQ-003 ?';
    
    const equipmentIds = extractEquipmentIds(question);
    expect(equipmentIds).toContain('eq-003');
    
    const terms = extractSearchTerms(question);
    expect(terms).toContain('pression');
    expect(terms).toContain('compresseur');
    
    const hasExhaustive = hasExhaustiveKeyword(question);
    expect(hasExhaustive).toBe(false);
  });

  it('Pipeline complet: liste exhaustive', () => {
    const question = 'Liste complète des équipements';
    
    const terms = extractSearchTerms(question);
    expect(terms).toContain('liste');
    expect(terms).toContain('complete');
    expect(terms).toContain('equipements');
    
    const hasExhaustive = hasExhaustiveKeyword(question);
    expect(hasExhaustive).toBe(true);
    
    const hasEquipment = containsEquipmentTheme(terms);
    expect(hasEquipment).toBe(true);
    
    const limit = calculateDocumentLimit(hasExhaustive, hasEquipment);
    expect(limit).toBe(10);
  });

  it('Pipeline complet: question multi-thèmes', () => {
    const question = 'Quels équipements sont présents et quelles informations de maintenance ?';
    
    const terms = extractSearchTerms(question);
    const hasEquipment = containsEquipmentTheme(terms);
    const hasMaintenance = containsMaintenanceTheme(terms);
    
    expect(hasEquipment).toBe(true);
    expect(hasMaintenance).toBe(true);
    
    const threshold = calculateScoreThreshold(hasEquipment && hasMaintenance);
    expect(threshold).toBe(1);
  });

  it('Pipeline complet: question hors domaine', () => {
    const question = 'Quelle est la recette du couscous tunisien ?';
    
    const terms = extractSearchTerms(question);
    expect(terms).toContain('recette');
    expect(terms).toContain('couscous');
    
    const hasEquipment = containsEquipmentTheme(terms);
    const hasMaintenance = containsMaintenanceTheme(terms);
    
    expect(hasEquipment).toBe(false);
    expect(hasMaintenance).toBe(false);
  });
});
