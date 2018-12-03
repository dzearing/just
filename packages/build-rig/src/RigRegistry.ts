import yargs from 'yargs';
import fs from 'fs';
import path from 'path';
import { logger, taskLogger } from './logger';
import { taskCommandModuleMap } from './taskCommandModuleMap';

import UndertakerRegistry from 'undertaker-registry';
import Undertaker from 'undertaker';

interface WithTaskMap {
  _tasks: { [task: string]: any };
}

export class RigRegistry extends UndertakerRegistry {
  public argv: yargs.Argv;
  private taker: Undertaker | undefined;

  constructor(argv: yargs.Argv) {
    super();
    this.argv = argv;
  }

  init(taker: Undertaker) {
    let rigFile = this.argv.argv.config || 'rig.js';

    if (!path.isAbsolute(rigFile)) {
      rigFile = path.join(process.cwd(), rigFile);
    }

    if (fs.existsSync(rigFile)) {
      require(rigFile);
    } else {
      logger.error(`Cannot find '${rigFile}'. Please create one called "rig.js" in the root of the project next to "package.json"`);
    }

    this.taker = taker;
  }

  set<TTaskFunction>(this: RigRegistry & WithTaskMap, taskName: string, fn: TTaskFunction): TTaskFunction {
    let commandModule = taskCommandModuleMap[taskName];

    const registry = this;

    commandModule = commandModule || {};

    commandModule = {
      ...commandModule,
      command: commandModule.command || taskName,
      ...(taskName === 'default' && { aliases: [...(commandModule.aliases ? commandModule.aliases : []), ...['*']] }),
      handler(argvParam: any) {
        registry.argv = argvParam;
        return registry.taker!.parallel(taskName)(() => {});
      }
    };

    this.argv = this.argv.command(commandModule as yargs.CommandModule);

    const task = (this._tasks[taskName] = this.wrapFn(taskName, fn));
    return task as any;
  }

  private wrapFn(taskName: string, fn: any) {
    const context = {
      logger: taskLogger(taskName)
    };

    Object.defineProperty(context, 'argv', {
      get: () => this.argv
    });

    return function(done: any) {
      let origFn = fn;
      if (fn.unwrap) {
        origFn = fn.unwrap();
      }

      if (origFn.length > 0) {
        (fn as any).call(context, done);
      } else {
        let results = (fn as any).apply(context);
        if (results && results.then) {
          results.then(() => {
            done();
          });
        } else {
          done();
        }
      }
    };
  }
}