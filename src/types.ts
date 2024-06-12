export type PluginConfig = {
  port?: number; // Default 3000
  hooks?: {
    [key: string]: string;
  };
};

type ServerlessCustom = {
  next?: PluginConfig;
  "serverless-offline"?: {
    useDocker?: boolean;
    location?: string;
  };
};

export type Service = {
  service: string;
  custom?: ServerlessCustom;
  provider?: {
    stage: string;
    environment?: { [key: string]: string };
    ecr?: ServiceProviderEcr;
  };
  functions?: {
    next?: ServerlessFunction;
  };
};

export type ServiceProviderEcr = {
  images?: { [key: string]: { path?: string; file?: string } };
};

export type ServerlessFunctionImage = {
  name?: string;
  command?: string[] | string;
};

export type ServerlessFunctionEvent = {
  websocket?: {
    route?: "$connect" | "$disconnect" | "$default";
    routeResponseSelectionExpression?: "$default";
  };
};

export type ServerlessFunction = {
  name: string;
  handler?: string;
  image?: ServerlessFunctionImage;
  runtime?: string;
  events?: ServerlessFunctionEvent[];
};
