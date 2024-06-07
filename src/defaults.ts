import { PluginConfig } from "./types";

export const defaultNextFunctionImageCommand = (
  pluginConfig: PluginConfig
): string | string[] => {
  return `next@http://localhost:${pluginConfig.port || 3000}`;
};
