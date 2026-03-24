export interface BlueprintModule {
  id: string;
  title: string;
  description: string;
  files: string[];
}

export interface BlueprintData {
  projectName: string;
  generatedAt: string;
  modules: BlueprintModule[];
}

export interface BlueprintOptions {
  outputDir: string;
  projectName?: string;
}
