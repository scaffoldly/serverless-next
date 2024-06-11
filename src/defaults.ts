import { PluginConfig, ServerlessFunctionImage, Service } from "./types";

export const defaultNextFunctionImageCommand = (
  pluginConfig: PluginConfig
): string => {
  return `next@http://localhost:${pluginConfig.port || 3000}`;
};

export const defaultNextFunctionImageName = (service: Service): string => {
  const { ecr } = service.provider || {};
  if (!ecr) {
    throw new Error("Unable to find ECR configuration in serverless config.");
  }

  const { images } = ecr;
  if (!images) {
    throw new Error(
      "Unable to find images configuration in ECR configuration."
    );
  }

  if (Object.keys(images).length === 0) {
    throw new Error("No images found in ECR configuration.");
  }

  if (Object.keys(images).length > 1) {
    throw new Error("Multiple images found in ECR configuration.");
  }

  return Object.keys(images)[0];
};

export const defaultNextFunctionImage = (
  service: Service,
  pluginConfig: PluginConfig
): ServerlessFunctionImage => {
  return {
    name: defaultNextFunctionImageName(service),
    command: defaultNextFunctionImageCommand(pluginConfig),
  };
};
