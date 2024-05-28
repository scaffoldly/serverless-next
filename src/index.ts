import "path";
import { exit } from "process";
import path from "path";
import { watch as chokidar } from "chokidar";
import portfinder from "portfinder";

type PluginName = "next";
const PLUGIN_NAME: PluginName = "next";

type PluginConfig = {
  reloadHandler?: boolean; // Default is false
  watch?: string[];
  hooks?: {
    [key: string]: string;
  };
};

type ServerlessCustom = {
  next?: PluginConfig;
  "serverless-offline"?: {
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
  getAllFunctions: () => string[];
  getFunction: (functionName: string) => {
    name: string;
    events?: any[];
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

  get environment(): { [key: string]: string | undefined } {
    return {
      ...(process.env || {}),
      ...((((this.serverless || {}).service || {}).provider || {})
        .environment || {}),
    };
  }

  get workdir(): string {
    return this.serverlessConfig.servicePath;
  }

  setupHooks = () => {
    const hooks: Hooks = {
      initialize: async () => {},
      [`${PLUGIN_NAME}:build`]: async () => {
        this.log.log(`!!! ${PLUGIN_NAME}:build`);
        await this.build(false);
      },
      [`before:${PLUGIN_NAME}:build`]: async () => {
        this.log.log(`!!! before:${PLUGIN_NAME}:build`);
      },
      [`after:${PLUGIN_NAME}:build`]: async () => {
        this.log.log(`!!! after:${PLUGIN_NAME}:build`);
      },
      "before:offline:start": async () => {
        this.log.log("!!! before:offline:start");
        let errored = false;
        try {
          await this.build(this.pluginConfig.reloadHandler);
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
        this.log.log("!!! before:package:createDeploymentArtifacts");
        let errored = false;
        try {
          await this.build(false);
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

  build = async (watch?: boolean): Promise<void> => {
    if (!watch) {
      const build = await import("next/dist/build")
        .then((m) => m.default)
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
    }

    if (watch) {
      const { startServer } = await import("next/dist/server/lib/start-server")
        .then((m) => m.default)
        .catch((e) => {
          throw new Error(
            `Failed to import next/dist/server: ${e.message}. Is \`next\` installed as a dependency?`
          );
        });

      const port = await portfinder.getPortPromise({ startPort: 12000 });

      await startServer({
        dir: this.workdir,
        isDev: true,
        port,
        allowRetry: undefined,
        customServer: undefined,
        hostname: undefined,
        keepAliveTimeout: undefined,
        minimalMode: undefined,
        selfSignedCertificate: undefined,
      });

      const paths = [
        ...(this.pluginConfig.watch || []).map((p) =>
          path.join(this.workdir, p)
        ),
      ];

      this.log.verbose(
        `Watching for changes in:\n${paths.map((p) => ` - ${p}`).join(`\n`)}`
      );

      chokidar(paths, {
        ignoreInitial: true,
        usePolling: true,
        interval: 100,
        awaitWriteFinish: {
          stabilityThreshold: 500,
          pollInterval: 100,
        },
      }).on("all", async () => {
        this.log.log("Change detected, rebuilding...");
        try {
          await this.build(false);
        } catch (e) {
          if (e instanceof Error) {
            this.log.error(e.message);
          }
        }
      });
    }
  };
}

module.exports = ServerlessNext;
