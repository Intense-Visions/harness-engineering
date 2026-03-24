export interface Quiz {
  question: string;
  options: string[];
  answer: number;
}

export interface Content {
  codeTranslation: string;
  keyInsights: string[];
}

export interface BlueprintModule {
  id: string;
  title: string;
  description: string;
  files: string[];
  content?: Content;
  quiz?: Quiz[];
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
