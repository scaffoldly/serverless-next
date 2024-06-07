export type PluginConfig = {
  port?: number; // Default 3000
  hooks?: {
    [key: string]: string;
  };
};

export type ServerlessFunctionImage = {
  name?: string;
  command?: string[] | string;
};

export type ServerlessFunction = {
  name: string;
  handler?: string;
  image?: ServerlessFunctionImage;
  runtime?: string;
};
