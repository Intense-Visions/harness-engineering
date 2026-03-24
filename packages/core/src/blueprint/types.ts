export interface Quiz {
  questions: {
    question: string;
    answer: string;
  }[];
}

export interface Content {
  codeTranslation: string;
  quiz: Quiz;
}

export interface BlueprintModule {
  id: string;
  title: string;
  description: string;
  files: string[];
  content?: Content;
}

export interface Hotspot {
  file: string;
  function: string;
  score: number;
}

export interface ModuleDependency {
  from: string;
  to: string;
}

export interface BlueprintData {
  projectName: string;
  generatedAt: string;
  modules: BlueprintModule[];
  hotspots: Hotspot[];
  dependencies: ModuleDependency[];
}

export interface BlueprintOptions {
  outputDir: string;
  projectName?: string;
}
