# Vorpal

<a href="https://www.npmjs.com/package/vorpal">
  <img src="https://img.shields.io/npm/v/vorpal.svg" alt="NPM Version" />
</a>
<a href="https://www.npmjs.com/package/vorpal">
  <img src="https://img.shields.io/npm/dt/vorpal.svg" alt="NPM Downloads" />
</a>

> Conquer the command-line.

```text
              (O)
              <M
   o          <M
  /| ......  /:M\------------------------------------------------,,,,,,
(O)[ vorpal ]::@+}==========================================------------>
  \| ^^^^^^  \:W/------------------------------------------------''''''
   o          <W
              <W
              (O)
```

Vorpal is Node's first framework for building interactive CLI applications. With a simple and powerful API, Vorpal opens the door to a new breed of rich, immersive CLI environments like [cash](https://github.com/dthree/cash) and [wat](https://github.com/dthree/wat).

## Contents

* [Introduction](#introduction)
* [Getting Started](#getting-started)
* [API](#api)
* [Extensions](#extensions)
* [Migrating from 1.x](#migrating-from-1x)
* [License](#license)

## Introduction

Inspired by and based on [commander.js](https://www.npmjs.com/package/commander), Vorpal is a framework for building immersive CLI applications built on an interactive prompt. Vorpal launches Node into an isolated CLI environment and provides a suite of API commands and functionality including:

* [x] Simple, powerful command creation
* [x] Supports optional, required and variadic arguments and options
* [x] Piped commands
* [x] Persistent command history
* [x] Built-in help
* [x] Built-in tabbed auto-completion
* [x] Command-specific auto-completion
* [x] Customizable prompts
* [x] Extensive terminal control
* [x] Custom event listeners
* [x] And more

## Getting Started

##### Quick Start

Install `vorpal` into your project:

```bash
$ npm install vorpal --save
```

Create a `.js` file and add the following:

```js
import Vorpal from 'vorpal';

const vorpal = new Vorpal();

vorpal
  .command('foo', 'Outputs "bar".')
  .action(function(args, callback) {
    this.log('bar');
    callback();
  });

vorpal
  .delimiter('myapp$')
  .show();
```

This creates an instance of Vorpal, adds a command which logs "bar", sets the prompt delimiter to say "myapp$", and shows the prompt.

Run your project file. Your Node app has become a CLI:

```bash
$ node server.js
myapp~$
```

Try out your "foo" command.

```bash
myapp~$ foo
bar
myapp~$
```

Now type "help" to see Vorpal's built in commands in addition to "foo":

```bash
myapp~$ help

  Commands

    help [command]    Provides help for a given command.
    exit [options]    Exits instance of Vorpal.
    foo               Outputs "bar".

myapp~$
```

##### Requirements

- Node.js >= 18.0.0
- ESM only (no CommonJS support)

##### Community

- [Stack Overflow](http://stackoverflow.com/questions/tagged/vorpal.js)
- [Vorpal extensions](https://github.com/vorpaljs/awesome-vorpaljs#vorpal-extensions)
- [Projects made with Vorpal](https://github.com/vorpaljs/awesome-vorpaljs)

## API

##### Command
- `vorpal.command`
- `command.description`
- `command.alias`
- `command.parse`
- `command.option`
- `command.hidden`
- `command.remove`
- `command.help`
- `command.autocomplete`
- `command.action`
- `command.cancel`

##### Mode
- `vorpal.mode`
- `mode.delimiter`
- `mode.init`
- `mode.action`

##### Catch
- `vorpal.catch`

##### CommandInstance
- `commandInstance.log`
- `commandInstance.prompt`
- `commandInstance.delimiter`

##### UI
- `ui.delimiter`
- `ui.input`
- `ui.imprint`
- `ui.submit`
- `ui.cancel`
- `ui.redraw`
- `ui.redraw.clear`
- `ui.redraw.done`

##### Vorpal
- `.parse`
- `.delimiter`
- `.show`
- `.find`
- `.exec`
- `.execSync`
- `.log`
- `.history`
- `.localStorage`
- `.help`
- `.pipe`
- `.use`

##### Events

## Extensions

You can build your own Vorpal commands and extensions.

- [List of awesome extensions](https://github.com/vorpaljs/awesome-vorpaljs#vorpal-extensions)

## Migrating from 1.x

Version 2.0 is a breaking rewrite. Key changes:

- **ESM only** — `import Vorpal from 'vorpal'` replaces `require('vorpal')()`
- **Node 18+ required** — uses `node:util.parseArgs`, `node:readline`, and modern JS features
- **No build step** — source is distributed directly from `lib/` with no Babel transpilation
- **`@inquirer/prompts` replaces `inquirer`** — the REPL loop now uses `node:readline` directly; user-facing prompts (`vorpal.prompt()`) use `@inquirer/prompts`
- **Lodash removed** — replaced with native methods and a small `util` helper
- **`babel-polyfill` removed** — all polyfilled features are natively available in Node 18+
- **`minimist` removed** — replaced with `node:util.parseArgs`
- **`node-localstorage` removed** — replaced with a built-in file-backed `Store` module with atomic writes
- **`vorpal.lodash` removed** — consumers should import lodash directly if needed
- **Classes** — `Vorpal`, `Session`, `Command`, `History`, `Store`, `Option` are now proper ES6 classes
- **Private fields** — internal-only state uses `#private` syntax where possible; members accessed by the framework (e.g., `command._name`, `session._mode`) remain `_`-prefixed public properties for extension compatibility

## Why Vorpal?

```text
One, two! One, two! and through and through
The vorpal blade went snicker-snack!
He left it dead, and with its head
He went galumphing back.

Lewis Carroll, Jabberwocky
```

## License

MIT