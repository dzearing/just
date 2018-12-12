import Undertaker from 'undertaker';
import { logger } from './logger';
import chalk from 'chalk';
import { wrapTask } from './wrapTask';

const undertaker = new Undertaker();
const NS_PER_SEC = 1e9;

let topLevelTask: string | undefined = undefined;
let errorReported: boolean = false;
let tasksInProgress: { [key: string]: boolean } = {};

const colors = [chalk.cyanBright, chalk.magentaBright, chalk.blueBright, chalk.greenBright, chalk.yellowBright];
const taskColor: { [taskName: string]: number } = {};
let colorIndex = 0;

function shouldLog(taskArgs: any) {
  return !taskArgs.branch && taskArgs.name !== '<anonymous>' && !taskArgs.name.endsWith('?');
}

function colorizeTaskName(taskName: string) {
  if (taskColor[taskName] === undefined) {
    taskColor[taskName] = colorIndex;
    colorIndex = (colorIndex + 1) % colors.length;
  }

  return colors[taskColor[taskName]](taskName);
}

undertaker.on('start', function(args: any) {
  if (shouldLog(args)) {
    if (!topLevelTask) {
      topLevelTask = args.name;
    }

    tasksInProgress[args.name] = true;

    logger.info(`started '${colorizeTaskName(args.name)}'`);
  }
});

undertaker.on('stop', function(args: any) {
  if (shouldLog(args)) {
    const duration = args.duration;
    const durationInSecs = Math.round(((duration[0] * NS_PER_SEC + duration[1]) / NS_PER_SEC) * 100) / 100;

    delete tasksInProgress[args.name];

    logger.info(`finished '${colorizeTaskName(args.name)}' in ${chalk.yellow(String(durationInSecs) + 's')}`);
  }
});

undertaker.on('error', function(args: any) {
  delete tasksInProgress[args.name];

  if (!errorReported) {
    errorReported = true;
    logger.error(chalk.red(`Error detected while running '${colorizeTaskName(args.name)}'`));
    logger.error(chalk.yellow('------------------------------------'));
    logger.error(chalk.yellow(args.error));
    logger.error(chalk.yellow('------------------------------------'));
  } else if (shouldLog(args)) {
    logger.error(chalk.dim(`Error previously detected. See above for error messages.`));
  }

  if (topLevelTask === args.name && Object.keys(tasksInProgress).length > 0) {
    logger.error(
      `Other tasks that did not complete: [${Object.keys(tasksInProgress)
        .map(taskName => colorizeTaskName(taskName))
        .join(', ')}]`
    );
    process.exit(1);
  }
});

export function parallel(...tasks: Undertaker.Task[]) {
  const newTasks = tasks.map(task => {
    if (typeof task === 'string') {
      return task;
    } else {
      return wrapTask(task);
    }
  });

  return undertaker.parallel(newTasks);
}

export function series(...tasks: Undertaker.Task[]) {
  const newTasks = tasks.map(task => {
    if (typeof task === 'string') {
      return task;
    } else {
      return wrapTask(task);
    }
  });

  return undertaker.series(newTasks);
}

undertaker.series.bind(undertaker);

export { undertaker };