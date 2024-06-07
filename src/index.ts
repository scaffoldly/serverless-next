import "path";
import { exit } from "process";
import { endpointSpawn } from "@scaffoldly/awslambda-bootstrap";
import { ChildProcess } from "child_process";
import { PluginConfig, ServerlessFunction } from "./types";
import { defaultNextFunctionImageCommand } from "./defaults";

type PluginName = "next";
const PLUGIN_NAME: PluginName = "next";

type Intent = "serve" | "develop";

type ServerlessCustom = {
  next?: PluginConfig;
  "serverless-offline"?: {
    useDocker?: boolean;
    location?: string;
  };
};

type ServerlessService = {
  service: string;
  custom?: ServerlessCustom;
  provider: {
    stage: string;
    environment?: { [key: string]: string };
  };
  functions?: {
    next?: ServerlessFunction;
  };
};

type ServerlessConfig = {
  servicePath: string;
};

type Serverless = {
  service: ServerlessService;
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

  childProcess?: ChildProcess;
  childProcessCommand?: string[];

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
      this.serverless.service.functions?.next?.image?.command;

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

  enrichCommandWithIntent = (intent: Intent, command?: string[]): string[] => {
    if (!command || !command.length) {
      command = defaultNextFunctionImageCommand(this.pluginConfig);
    }

    console.log("!!! command", command);

    if (!command[0].startsWith("next")) {
      throw new Error("Image command must start with `next`");
    }

    if (command[0].startsWith("next@")) {
      if (intent === "develop") {
        command[0] = command[0].replace("next@", "next dev@");
      } else {
        command[0] = command[0].replace("next@", "next start@");
      }
    }

    return command;
  };

  setHandlerIntent = (intent: Intent) => {
    const { next } = this.serverless.service.functions || {};
    if (!next) {
      throw new Error(
        `Unable to find a function named \`next\` in serverless config.`
      );
    }

    if (intent === "serve" || (intent === "develop" && this.useDocker)) {
      delete next.handler;
      return;
    }

    let command = this.enrichCommandWithIntent(
      intent,
      this.childProcessCommand
    );
    next.handler = command[0].split("@").slice(1).join("@");

    return this.setImageIntent(intent);
  };

  setImageIntent = (intent: Intent): string | undefined => {
    const { next } = this.serverless.service.functions || {};
    if (!next) {
      throw new Error(
        `Unable to find a function named \`next\` in serverless config.`
      );
    }

    if (intent === "develop" && !this.useDocker) {
      delete next.image;
      return;
    }

    const { image } = next;
    if (!image) {
      throw new Error(
        `Unable to find an image configuration for the \`next\` function.`
      );
    }

    image.command = this.enrichCommandWithIntent(intent, image.command);

    return image.command[0];
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

    const spawnCommand = this.setHandlerIntent("develop");

    if (!spawnCommand) {
      throw new Error("Unable to create spawn command");
    }

    const { childProcess } = await endpointSpawn(
      spawnCommand,
      this.environment
    );

    this.childProcess = childProcess;
  };
}

module.exports = ServerlessNext;
