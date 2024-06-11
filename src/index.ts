import "path";
import { exit } from "process";
import { endpointSpawn } from "@scaffoldly/awslambda-bootstrap";
import { ChildProcess } from "child_process";
import { PluginConfig, Service } from "./types";
import {
  defaultNextFunctionImage,
  defaultNextFunctionImageCommand,
} from "./defaults";

type PluginName = "next";
const PLUGIN_NAME: PluginName = "next";

type Intent = "serve" | "develop";

type ServerlessConfig = {
  servicePath: string;
};

type Serverless = {
  service: Service;
  pluginManager: {
    spawn: (command: string) => Promise<void>;
    hooks?: {
      [key: string]: any;
    };
  };
  config: any;
};

type Options = {
  verbose?: boolean;
  log?: ServerlessLog;
};

type ServerlessLog = ((message: string) => void) & {
  verbose: (message: string) => void;
  warning: (message: string) => void;
  error: (message: string) => void;
};

class Log {
  constructor(private options: Options) {}

  static msg = (message: string) => {
    return `[${PLUGIN_NAME}] ${message}`;
  };

  log = (message: string) => {
    if (this.options.log) {
      this.options.log(Log.msg(message));
    } else {
      console.log(Log.msg(message));
    }
  };

  verbose = (message: string) => {
    if (this.options.log) {
      this.options.log.verbose(Log.msg(message));
    } else {
      if (this.options.verbose) {
        console.log(Log.msg(message));
      }
    }
  };

  warning = (message: string) => {
    if (this.options.log) {
      this.options.log.warning(Log.msg(message));
    } else {
      console.warn(Log.msg(message));
    }
  };

  error = (message: string) => {
    if (this.options.log) {
      this.options.log.error(Log.msg(message));
    } else {
      console.error(Log.msg(message));
    }
  };
}

type Hooks = {
  [key: string]: () => Promise<void>;
};

type CommandOptions = { [key: string]: { usage: string; type: string } };

type Commands = {
  [key: string]:
    | Commands
    | {
        usage: string;
        lifecycleEvents: string[];
        options?: CommandOptions;
      };
};

class ServerlessNext {
  log: Log;

  serverless: Serverless;
  serverlessConfig: ServerlessConfig;
  pluginConfig: PluginConfig;

  childProcessCommand: string;

  hooks?: Hooks;
  commands?: Commands;

  constructor(serverless: Serverless, protected options: Options) {
    this.serverless = serverless;
    this.serverlessConfig = serverless.config;
    this.pluginConfig =
      (this.serverless.service.custom &&
        this.serverless.service.custom[PLUGIN_NAME]) ||
      {};

    this.log = new Log(options);

    this.hooks = this.setupHooks();

    this.childProcessCommand =
      (Array.isArray(this.serverless.service.functions?.next?.image?.command)
        ? this.serverless.service.functions?.next?.image?.command.join(" ")
        : this.serverless.service.functions?.next?.image?.command) ||
      defaultNextFunctionImageCommand(this.pluginConfig);

    this.commands = {
      [`${PLUGIN_NAME}`]: {
        commands: {
          build: {
            lifecycleEvents: [],
            usage: `Runs \`next build\`.`,
          },
        },
        lifecycleEvents: ["build"],
        usage: "Runs next commands.",
      },
    };
  }

  get environment(): NodeJS.ProcessEnv {
    return {
      ...(process.env || {}),
      ...((((this.serverless || {}).service || {}).provider || {})
        .environment || {}),
    };
  }

  get workdir(): string {
    return this.serverlessConfig.servicePath;
  }

  get useDocker(): boolean {
    const custom = this.serverless.service.custom || {};
    const serverlessOffline = custom["serverless-offline"];

    if (!serverlessOffline) {
      throw new Error(
        "This plugin only supports serverless-offline for local execution. Is it installed?"
      );
    }

    return serverlessOffline.useDocker || false;
  }

  set childProcess(childProcess: ChildProcess | undefined) {
    process.on("SIGINT", () => {
      if (childProcess) {
        childProcess.kill("SIGINT");
      }
    });
    process.on("SIGTERM", () => {
      if (childProcess) {
        childProcess.kill("SIGTERM");
      }
    });
  }

  setupHooks = () => {
    const hooks: Hooks = {
      initialize: async () => {},
      [`${PLUGIN_NAME}:build`]: async () => {
        this.log.verbose(`${PLUGIN_NAME}:build`);
        await this.build();
      },
      [`before:${PLUGIN_NAME}:build`]: async () => {
        this.log.verbose(`before:${PLUGIN_NAME}:build`);
      },
      [`after:${PLUGIN_NAME}:build`]: async () => {
        this.log.verbose(`after:${PLUGIN_NAME}:build`);
      },
      "before:offline:start": async () => {
        this.log.verbose("before:offline:start");
        let errored = false;
        try {
          await this.run();
        } catch (e) {
          errored = true;
          if (e instanceof Error) {
            this.log.error(e.message);
          }
        } finally {
          if (errored) {
            exit(1);
          }
        }
      },
      "before:package:createDeploymentArtifacts": async () => {
        this.log.verbose("before:package:createDeploymentArtifacts");
        let errored = false;
        try {
          await this.build();
        } catch (e) {
          errored = true;
          if (e instanceof Error) {
            this.log.error(e.message);
          }
          throw e;
        } finally {
          if (errored) {
            exit(1);
          }
        }
      },
    };

    const pluginHooks = this.pluginConfig.hooks || {};

    Object.entries(pluginHooks).forEach(([hook, _target]) => {
      if (hook === `${PLUGIN_NAME}:build`) {
        this.log.warning(
          `Hook "${hook}" is reserved for the "${PLUGIN_NAME}" plugin. Use \`before:${hook}\` or \`after:${hook}\` instead.`
        );
        return;
      }
      hooks[hook] = async () => {
        throw new Error(`Hook "${hook}" is not implemented yet.`);
      };
    });

    return hooks;
  };

  async cleanup() {
    const command = await new Promise((resolve) => {
      process
        .on("SIGINT", () => resolve("SIGINT"))
        .on("SIGTERM", () => resolve("SIGTERM"));
    });

    this.log.log(`Got ${command} signal...`);
  }

  enrichCommandWithIntent = (intent: Intent, command?: string): string => {
    if (!command) {
      command = defaultNextFunctionImageCommand(this.pluginConfig);
    }

    if (!command.startsWith("next")) {
      throw new Error("Image command must start with `next`");
    }

    if (command.startsWith("next@")) {
      if (intent === "develop") {
        command = command.replace("next@", "next dev@");
      } else if (intent === "serve") {
        command = command.replace("next@", "next start@");
      } else {
        throw new Error(`Unknown intent: ${intent}`);
      }
    }

    return command;
  };

  setHandlerIntent = (intent: Intent, endpoint?: URL) => {
    const { next } = this.serverless.service.functions || {};
    if (!next) {
      throw new Error(
        `Unable to find a function named \`next\` in serverless config.`
      );
    }

    const command = this.enrichCommandWithIntent(
      intent,
      this.childProcessCommand
    );

    if (intent === "serve") {
      delete next.handler;
      return;
    }

    if (intent === "develop") {
      if (!endpoint) {
        throw new Error(`Endpoint is required for intent: ${intent}`);
      }
      next.handler = endpoint.toString();
    }

    this.setImageIntent(intent, command);
  };

  setImageIntent = (intent: Intent, command: string) => {
    const { next } = this.serverless.service.functions || {};
    if (!next) {
      throw new Error(
        `Unable to find a function named \`next\` in serverless config.`
      );
    }

    if (intent === "develop") {
      delete next.image;
      return;
    }

    next.image =
      next.image ||
      defaultNextFunctionImage(this.serverless.service, this.pluginConfig);

    next.image.command = this.enrichCommandWithIntent(intent, command);
  };

  build = async (): Promise<void> => {
    const build = await import("next/dist/build")
      .then((m) => m!.default)
      .catch((e) => {
        throw new Error(
          `Failed to import next/dist/build: ${e.message}. Is \`next\` installed as a dependency?`
        );
      });

    await build(
      this.workdir,
      false,
      false,
      false,
      false,
      false,
      false,
      "default"
    );

    this.setHandlerIntent("serve");
  };

  run = async (): Promise<void> => {
    if (this.useDocker) {
      throw new Error("Not implemented: useDocker");
    }

    const { next } = this.serverless.service.functions || {};
    if (!next) {
      throw new Error(
        `Unable to find a function named \`next\` in serverless config.`
      );
    }

    const { childProcess, endpoint } = await endpointSpawn(
      this.childProcessCommand,
      this.environment
    );

    this.setHandlerIntent("develop", endpoint);

    this.childProcess = childProcess;
  };
}

module.exports = ServerlessNext;
