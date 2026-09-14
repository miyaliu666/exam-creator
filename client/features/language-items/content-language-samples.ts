import { createEmptyImportRow, type ContentImportRow } from "./content-import-columns";
import { contentLanguageLabel } from "./content-language";

type SampleEntry = { id: string; kind: "lexical" | "grammar"; label: string; meaning: string; pattern?: string; examples: string[] };

const SAMPLES: Record<"en" | "es", SampleEntry[]> = {
  en: [
    { id: "LX-DEMO-EN-HELLO", kind: "lexical", label: "hello", meaning: "A greeting when meeting someone.", examples: ["Hello, Maya!"] },
    { id: "LX-DEMO-EN-THANKS", kind: "lexical", label: "thanks", meaning: "A word used to express gratitude.", examples: ["Thanks for the book."] },
    { id: "LX-DEMO-EN-WATER", kind: "lexical", label: "water", meaning: "The liquid that people drink to stay hydrated.", examples: ["I would like some water."] },
    { id: "LX-DEMO-EN-BOOK", kind: "lexical", label: "book", meaning: "A set of pages containing writing or pictures, joined together.", examples: ["My book is on the table."] },
    { id: "GR-DEMO-EN-BE", kind: "grammar", label: "Identity with be", meaning: "State who someone is or what something is.", pattern: "Subject + am/is/are + noun phrase", examples: ["I am a teacher.", "This is my book."] },
    { id: "GR-DEMO-EN-HAVE", kind: "grammar", label: "Possession with have", meaning: "State that someone owns or has something.", pattern: "Subject + have/has + noun phrase", examples: ["I have a book.", "She has a bicycle."] },
    { id: "GR-DEMO-EN-THERE-IS", kind: "grammar", label: "Existence with there is / there are", meaning: "Introduce something present in a place.", pattern: "There + is/are + noun phrase + place expression", examples: ["There is a café near my house.", "There are two books on the table."] },
  ],
  es: [
    { id: "LX-DEMO-ES-HOLA", kind: "lexical", label: "hola", meaning: "A greeting when meeting someone; hello.", examples: ["¡Hola, Lucía!"] },
    { id: "LX-DEMO-ES-GRACIAS", kind: "lexical", label: "gracias", meaning: "A word used to express gratitude; thanks.", examples: ["Gracias por el libro."] },
    { id: "LX-DEMO-ES-AGUA", kind: "lexical", label: "agua", meaning: "The liquid that people drink to stay hydrated; water.", examples: ["Quiero beber agua."] },
    { id: "LX-DEMO-ES-LIBRO", kind: "lexical", label: "libro", meaning: "A set of joined pages containing writing or pictures; book.", examples: ["Mi libro está en la mesa."] },
    { id: "GR-DEMO-ES-SER", kind: "grammar", label: "Identidad con ser", meaning: "State who someone is or what something is.", pattern: "(Sujeto) + ser conjugado + nombre o grupo nominal", examples: ["Soy profesora.", "Este es mi libro."] },
    { id: "GR-DEMO-ES-TENER", kind: "grammar", label: "Posesión con tener", meaning: "State that someone owns or has something.", pattern: "(Sujeto) + tener conjugado + grupo nominal", examples: ["Tengo un libro.", "Ella tiene una bicicleta."] },
    { id: "GR-DEMO-ES-HAY", kind: "grammar", label: "Existencia con hay", meaning: "Introduce something present in a place using the impersonal form hay.", pattern: "Hay + grupo nominal + expresión de lugar", examples: ["Hay un café cerca de mi casa.", "Hay dos libros en la mesa."] },
  ],
};

export function sampleContentImportRows(language: "en" | "es"): ContentImportRow[] {
  return SAMPLES[language].map((sample, index) => {
    const row = createEmptyImportRow(sample.kind, `${contentLanguageLabel(language)} sample, row ${index + 1}`);
    Object.assign(row.values, {
      ...sample, language, pattern: sample.pattern ?? "", examples: JSON.stringify(sample.examples),
      sources: JSON.stringify(["Original demonstration content created for Exam Creator."]),
      notes: "Illustrative sample for browsing and import. Not an assessed curriculum or calibrated level.",
    });
    row.sourceFields = ["id", "language", "kind", "label", "meaning", "pattern", "examples", "sources", "notes"];
    return row;
  });
}
