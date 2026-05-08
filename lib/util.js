import { parseArgs as nodeParseArgs } from 'node:util'
import strip from 'strip-ansi'

function isEmpty (obj) {
  return Object.keys(obj).length === 0
}

function isObject (obj) {
  return obj !== null && (typeof obj === 'object' || typeof obj === 'function')
}

/** Wrapper around node:util.parseArgs that replicates minimist behavior:
 *  - Handles --no-xxx flags (sets xxx to false)
 *  - Registers value-taking options from `takesValue` so nodeParseArgs consumes the next arg
 *  - Auto-coerces numeric strings to Number (except for keys in `string` list)
 *  - Auto-coerces numeric positionals to Number */
function minimistCompat (args, opts) {
  opts = opts || {}
  const options = {}
  const booleans = opts.boolean || []
  const strings = opts.string || []
  const takesValue = opts.takesValue || []
  const noCoerce = new Set(strings)

  for (const name of booleans) {
    options[name] = { type: 'boolean' }
  }
  for (const name of [...strings, ...takesValue]) {
    options[name] = { type: 'string' }
  }

  const result = nodeParseArgs({
    args,
    options,
    strict: false,
    allowPositionals: true
  })

  const out = { _: result.positionals }
  for (const [key, value] of Object.entries(result.values)) {
    if (key.startsWith('no-') && value === true) {
      const baseKey = key.slice(3)
      out[baseKey] = false
    } else {
      out[key] = value
    }
  }

  for (const key of Object.keys(out)) {
    if (key === '_') continue
    if (noCoerce.has(key)) continue
    if (typeof out[key] === 'string' && /^\d+$/.test(out[key])) {
      out[key] = Number(out[key])
    }
  }

  for (let i = 0; i < out._.length; i++) {
    if (typeof out._[i] === 'string' && /^\d+$/.test(out._[i])) {
      out._[i] = Number(out._[i])
    }
  }

  return out
}

const util = {
  isEmpty,
  isObject,

  /** Parses command arguments from multiple sources.
   *  @param {string} str @param {object} opts @return {object} */
  parseArgs (str, opts) {
    const reg = /"(.*?)"|'(.*?)'|`(.*?)`|([^\s"]+)/gi
    let arr = []
    let match
    do {
      match = reg.exec(str)
      if (match !== null) {
        arr.push(match[1] || match[2] || match[3] || match[4])
      }
    } while (match !== null)

    arr = minimistCompat(arr, opts)
    arr._ = arr._ || []
    return arr
  },

  /** Prepares a command and all its parts for execution.
   *  @param {string} command @param {Command[]} commands @return {object} */
  parseCommand (command, commands) {
    const self = this
    let pipes = []
    let match
    let matchArgs
    let matchParts

    function parsePipes () {
      // First, split the command by pipes naively. This will split command
      // arguments in half when the argument contains a pipe character.
      // For example, say "(Vorpal|vorpal)" will be split into... which isn't good.
      const naivePipes = String(command).trim().split('|')
      const newPipes = []
      // We will look for pipe characters within these quotes to rejoin together.
      const quoteChars = ['"', '\'', '`']
      // Toggled off and on as each quote type is opened and closed.
      const quoteTracker = {}
      // The current command piece before being rejoined with its other half.
      let commandPart = ''

      for (const [key, possiblePipe] of naivePipes.entries()) {
        commandPart += possiblePipe
        // Loop through each individual character tracking the opening and closing of quotes.
        for (let i = 0; i < possiblePipe.length; i++) {
          const char = possiblePipe[i]
          if (quoteChars.indexOf(char) !== -1) {
            quoteTracker[char] = !quoteTracker[char]
          }
        }

        // Does the pipe end on an unfinished quote?
        const inQuote = quoteChars.some((quoteChar) => quoteTracker[quoteChar])

        // If the quotes have all been closed or this is the last possible pipe, add as pipe.
        if (!inQuote || key * 1 === naivePipes.length - 1) {
          newPipes.push(commandPart.trim())
          commandPart = ''
        } else {
          // Quote was left open. The pipe character was previously removed when the array was split.
          commandPart += '|'
        }
      }

      // Set the first pipe to command and the rest to pipes.
      command = newPipes.shift()
      pipes = pipes.concat(newPipes)
    }

    function parseMatch () {
      matchParts = self.matchCommand(command, commands)
      match = matchParts.command
      matchArgs = matchParts.args
    }

    parsePipes()
    parseMatch()

    if (match && typeof match._parse === 'function') {
      command = match._parse(command, matchParts.args)
      parsePipes()
      parseMatch()
    }

    return ({
      command,
      match,
      matchArgs,
      pipes
    })
  },

  /** Runs a raw command string against a given list of commands, and if there
   *  is a match, parses the results.
   *  @param {string} cmd @param {Command[]} cmds @return {object} */
  matchCommand (cmd, cmds) {
    const parts = String(cmd).trim().split(' ')

    let match
    let matchArgs
    for (let i = 0; i < parts.length; ++i) {
      const subcommand = String(parts.slice(0, parts.length - i).join(' ')).trim()
      match = cmds.find(c => c._name === subcommand) || match
      if (!match) {
        for (const c of cmds) {
          const idx = c._aliases.indexOf(subcommand)
          match = (idx > -1) ? c : match
        }
      }
      if (match) {
        matchArgs = parts.slice(parts.length - i, parts.length).join(' ')
        break
      }
    }
    if (!match) {
      // If there's no command match, check if there's a catch command, which catches all missed commands.
      match = cmds.find(c => c._catch)
      if (match) {
        const allCommands = cmds.map(c => c._name)
        let wordMatch = false
        // If there is a catch, we still need to make sure we aren't partially matching
        // command groups, such as `do things` when there is a command `do things well`.
        // If we match partially, we still want to show the help menu for that command group.
        for (const c of allCommands) {
          const parts2 = String(c).split(' ')
          const cmdParts = String(match.command).split(' ')
          let matchAll = true
          for (let k = 0; k < cmdParts.length; ++k) {
            if (parts2[k] !== cmdParts[k]) {
              matchAll = false
              break
            }
          }
          if (matchAll) {
            wordMatch = true
            break
          }
        }
        if (wordMatch) {
          match = undefined
        } else {
          matchArgs = cmd
        }
      }
    }

    return ({
      command: match,
      args: matchArgs
    })
  },

  /** Builds the arguments object for a command execution.
   *  @param {string} passedArgs @param {Command} cmd @param {object} [execCommand] @param {boolean} [isCommandArgKeyPairNormalized] @return {object|string} */
  buildCommandArgs (passedArgs, cmd, execCommand, isCommandArgKeyPairNormalized) {
    const args = { options: {} }
    if (isCommandArgKeyPairNormalized) {
      // Normalize all foo="bar" with "foo='bar'" - this helps implement unix-like key value pairs.
      const reg = /(['"]?)(\w+)=(?:(['"])((?:(?!\3).)*)\3|(\S+))\1/g
      passedArgs = passedArgs.replace(reg, '"$2=\'$4$5\'"')
    }

    // Types are custom arg types passed into minimist as per its docs.
    const types = cmd._types || {}

    // Make a list of all boolean options registered for this command.
    // These are simply commands that don't have required or optional args.
    const booleans = cmd.options.flatMap((opt) => {
      if (!opt.required && !opt.optional) {
        const { short, long } = opt
        return [short, long].filter(Boolean)
      }
      return []
    })

    const takesValue = cmd.options.flatMap((opt) => {
      // Options with required or optional values - these take a value, not just boolean.
      if (opt.required || opt.optional) {
        const { short, long } = opt
        return [short, long].filter(Boolean)
      }
      return []
    }).map(function (str) {
      return String(str).replace(/^-*/, '')
    })

    // Review the args passed into the command, and filter out the boolean list
    // to only those options passed in by the caller.
    const passedArgParts = passedArgs.split(' ')
    types.boolean = booleans.map(function (str) {
      return String(str).replace(/^-*/, '')
    }).filter(function (str) {
      let match2 = false
      const strings = [`-${str}`, `--${str}`, `--no-${str}`]
      for (let i = 0; i < passedArgParts.length; ++i) {
        if (strings.indexOf(passedArgParts[i]) > -1) {
          match2 = true
          break
        }
      }
      return match2
    })
    types.takesValue = takesValue

    // Use minimist to parse the args.
    const parsedArgs = this.parseArgs(passedArgs, types)
    function validateArg (arg, cmdArg) {
      return !(arg === undefined && cmdArg.required === true)
    }

    // Builds variadic args and assigns positional arguments.
    let valid = true
    const remainingArgs = [...parsedArgs._]

    for (let l = 0; l < 10; ++l) {
      const matchArg = cmd._args[l]
      const passedArg = parsedArgs._[l]
      if (matchArg !== undefined) {
        valid = (!valid) ? false : validateArg(parsedArgs._[l], matchArg)
        if (!valid) {
          break
        }
        if (passedArg !== undefined) {
          if (matchArg.variadic === true) {
            args[matchArg.name] = remainingArgs
          } else {
            args[matchArg.name] = passedArg
            remainingArgs.shift()
          }
        }
      }
    }

    if (!valid) {
      return '\n  Missing required argument. Showing Help:'
    }

    // Looks for omitted required options and throws help.
    for (let m = 0; m < cmd.options.length; ++m) {
      const o = cmd.options[m]
      const short2 = String(o.short || '').replace(/-/g, '')
      const long2 = String(o.long || '').replace(/--no-/g, '').replace(/^-*/g, '')
      let exist = (parsedArgs[short2] !== undefined) ? parsedArgs[short2] : undefined
      exist = (exist === undefined && parsedArgs[long2] !== undefined) ? parsedArgs[long2] : exist
      const existsNotSet = (exist === true || exist === false)
      if (existsNotSet && o.required !== 0) {
        return `\n  Missing required value for option ${(o.long || o.short)}. Showing Help:`
      }
      if (exist !== undefined) {
        args.options[long2 || short2] = exist
      }
    }

    // Looks for supplied options that don't exist in the options list.
    // If the command allows unknown options, adds it, otherwise throws help.
    const passedOpts = Object.keys(parsedArgs)
      .filter(k => k !== '_' && k !== 'help')

    for (const opt of passedOpts) {
      const optionFound = cmd.options.find(function (expected) {
        if ('--' + opt === expected.long ||
            '--no-' + opt === expected.long ||
            '-' + opt === expected.short) {
          return true
        }
        return false
      })
      if (optionFound === undefined) {
        if (cmd._allowUnknownOptions) {
          args.options[opt] = parsedArgs[opt]
        } else {
          return `\n  Invalid option: '${opt}'. Showing Help:`
        }
      }
    }

    // If args were passed into the programmatic vorpal.exec(cmd, args, callback), merge them here.
    if (execCommand && execCommand.args && isObject(execCommand.args)) {
      Object.assign(args, execCommand.args)
    }

    // Looks for a help arg and throws help if any.
    if (parsedArgs.help || parsedArgs._.indexOf('/?') > -1) {
      args.options.help = true
    }

    return args
  },

  /** Makes an argument name pretty for help. @param {object} arg @return {string} */
  humanReadableArgName (arg) {
    const nameOutput = arg.name + (arg.variadic === true ? '...' : '')
    return arg.required
      ? `<${nameOutput}>`
      : `[${nameOutput}]`
  },

  /** Formats an array to display in a TTY in a pretty fashion. @param {string[]} arr @return {string} */
  prettifyArray (arr) {
    arr = arr || []
    const arrClone = [...arr]
    const width = process.stdout.columns
    const longest = strip((arrClone.sort(function (a, b) {
      return strip(b).length - strip(a).length
    })[0] || '')).length + 2
    const fullWidth = strip(String(arr.join(''))).length
    const fitsOneLine = ((fullWidth + (arr.length * 2)) <= width)
    let cols = Math.floor(width / longest)
    cols = (cols < 1) ? 1 : cols
    if (fitsOneLine) {
      return arr.join('  ')
    }
    let col = 0
    const lines = []
    let line = ''
    for (const arrEl of arr) {
      if (col < cols) {
        col++
      } else {
        lines.push(line)
        line = ''
        col = 1
      }
      line += this.pad(arrEl, longest, ' ')
    }
    if (line !== '') {
      lines.push(line)
    }
    return lines.join('\n')
  },

  /** Pads a value with space or a specified delimiter to match a given width. @param {string} str @param {number} width @param {string} [delimiter] @return {string} */
  pad (str, width, delimiter) {
    width = Math.floor(width)
    delimiter = delimiter || ' '
    const len = Math.max(0, width - strip(str).length)
    return str + delimiter.repeat(len)
  },

  /** Pad a row on the start and end with spaces. @param {string} str @return {string} */
  padRow (str) {
    return str.split('\n').map(function (row) {
      return '  ' + row + '  '
    }).join('\n')
  },

  /** When passing down applied args, we need to turn them from { '0': 'foo', '1': 'bar' }
   *  into ['foo', 'bar'] instead. @param {object} obj @return {Array} */
  fixArgsForApply (obj) {
    if (typeof obj === 'function' || (typeof obj !== 'object' || obj === null)) {
      if (!Array.isArray(obj)) {
        return [obj]
      }
      return obj
    }
    const argArray = Object.values(obj)
    return argArray
  }
}

export default util
export { isEmpty, isObject }
