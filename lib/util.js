import { parseArgs as nodeParseArgs } from 'node:util'
import strip from 'strip-ansi'

function isEmpty (obj) {
  return Object.keys(obj).length === 0
}

function isObject (obj) {
  return obj !== null && (typeof obj === 'object' || typeof obj === 'function')
}

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

  parseCommand (command, commands) {
    const self = this
    let pipes = []
    let match
    let matchArgs
    let matchParts

    function parsePipes () {
      const naivePipes = String(command).trim().split('|')
      const newPipes = []
      const quoteChars = ['"', '\'', '`']
      const quoteTracker = {}
      let commandPart = ''

      for (const [key, possiblePipe] of naivePipes.entries()) {
        commandPart += possiblePipe

        for (let i = 0; i < possiblePipe.length; i++) {
          const char = possiblePipe[i]
          if (quoteChars.indexOf(char) !== -1) {
            quoteTracker[char] = !quoteTracker[char]
          }
        }

        const inQuote = quoteChars.some((quoteChar) => quoteTracker[quoteChar])

        if (!inQuote || key * 1 === naivePipes.length - 1) {
          newPipes.push(commandPart.trim())
          commandPart = ''
        } else {
          commandPart += '|'
        }
      }

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
      match = cmds.find(c => c._catch)
      if (match) {
        const allCommands = cmds.map(c => c._name)
        let wordMatch = false
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

  buildCommandArgs (passedArgs, cmd, execCommand, isCommandArgKeyPairNormalized) {
    const args = { options: {} }
    if (isCommandArgKeyPairNormalized) {
      const reg = /(['"]?)(\w+)=(?:(['"])((?:(?!\3).)*)\3|(\S+))\1/g
      passedArgs = passedArgs.replace(reg, '"$2=\'$4$5\'"')
    }

    const types = cmd._types || {}

    const booleans = cmd.options.map((opt) => {
      if (!opt.required && !opt.optional) {
        const { short, long } = opt
        return [short, long].filter(Boolean)
      }
    }).flat()

    const takesValue = cmd.options.map((opt) => {
      if (opt.required || opt.optional) {
        const { short, long } = opt
        return [short, long].filter(Boolean)
      }
    }).flat().map(function (str) {
      return String(str).replace(/^-*/, '')
    })

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

    const parsedArgs = this.parseArgs(passedArgs, types)
    function validateArg (arg, cmdArg) {
      return !(arg === undefined && cmdArg.required === true)
    }

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

    if (execCommand && execCommand.args && isObject(execCommand.args)) {
      Object.assign(args, execCommand.args)
    }

    if (parsedArgs.help || parsedArgs._.indexOf('/?') > -1) {
      args.options.help = true
    }

    return args
  },

  humanReadableArgName (arg) {
    const nameOutput = arg.name + (arg.variadic === true ? '...' : '')
    return arg.required
      ? `<${nameOutput}>`
      : `[${nameOutput}]`
  },

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

  pad (str, width, delimiter) {
    width = Math.floor(width)
    delimiter = delimiter || ' '
    const len = Math.max(0, width - strip(str).length)
    return str + delimiter.repeat(len)
  },

  padRow (str) {
    return str.split('\n').map(function (row) {
      return '  ' + row + '  '
    }).join('\n')
  },

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