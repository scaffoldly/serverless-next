import {
  PluginConfig,
  ServerlessFunction,
  ServerlessFunctionImage,
} from "./types";

export const defaultNextFunctionImageCommand = (
  pluginConfig: PluginConfig
): string[] => {
  return [`next@http://localhost:${pluginConfig.port || 3000}`];
};

export const defaultNextFunctionImage = async (
  pluginConfig: PluginConfig
): Promise<ServerlessFunctionImage> => {
  return {
    name: "todo-fetch-container-name",
    command: defaultNextFunctionImageCommand(pluginConfig),
  };
};

export const defaultNextFunction = async (
  pluginConfig: PluginConfig
): Promise<ServerlessFunction> => {
  return {
    name: "next",
    runtime: "provided.al2023",
    image: await defaultNextFunctionImage(pluginConfig),
  };
};
