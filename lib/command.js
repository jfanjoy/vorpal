import EventEmitter from 'node:events'
import Option from './option.js'
import VorpalUtil from './util.js'

export default class Command extends EventEmitter {
  constructor (name, parent) {
    super()
    this.commands = []
    this.options = []
    this._args = []
    this._aliases = []
    this._name = name
    this._relay = false
    this._hidden = false
    this._parent = parent
    this._mode = false
    this._catch = false
    this._help = undefined
    this._init = undefined
    this._after = undefined
    this._allowUnknownOptions = false
  }

  option (flags, description, autocomplete) {
    const option = new Option(flags, description, autocomplete)
    const oname = option.name()
    const name = _camelcase(oname)
    let defaultValue

    if (option.bool === false || option.optional || option.required) {
      if (option.bool === false) {
        defaultValue = true
      }
      if (defaultValue !== undefined) {
        this[name] = defaultValue
      }
    }

    this.options.push(option)

    this.on(oname, function (val) {
      if (typeof this[name] === 'boolean' || typeof this[name] === 'undefined') {
        if (val === null) {
          this[name] = option.bool ?
            defaultValue || true :
            false
        } else {
          this[name] = val
        }
      } else if (val !== null) {
        this[name] = val
      }
    })

    return this
  }

  action (fn) {
    this._fn = fn
    return this
  }

  use (fn) {
    return fn(this)
  }

  validate (fn) {
    this._validate = fn
    return this
  }

  cancel (fn) {
    this._cancel = fn
    return this
  }

  done (fn) {
    this._done = fn
    return this
  }

  autocomplete (obj) {
    this._autocomplete = obj
    return this
  }

  autocompletion (param) {
    this._parent._useDeprecatedAutocompletion = true
    if (typeof param !== 'function' && (typeof param !== 'object' || param === null)) {
      throw new Error('An invalid object type was passed into the first parameter of command.autocompletion: function expected.')
    }

    this._autocompletion = param
    return this
  }

  init (fn) {
    if (this._mode !== true) {
      throw Error('Cannot call init from a non-mode action.')
    }
    this._init = fn
    return this
  }

  delimiter (delimiter) {
    this._delimiter = delimiter
    return this
  }

  types (types) {
    const supported = ['string', 'boolean']
    for (const item in types) {
      if (supported.indexOf(item) === -1) {
        throw new Error('An invalid type was passed into command.types(): ' + item)
      }
      types[item] = (!Array.isArray(types[item])) ? [types[item]] : types[item]
    }
    this._types = types
    return this
  }

  alias (...aliases) {
    for (const alias of aliases) {
      if (Array.isArray(alias)) {
        for (let j = 0; j < alias.length; ++j) {
          this.alias(alias[j])
        }
        return this
      }
      this._parent.commands.forEach((cmd) => {
        if (cmd._aliases && cmd._aliases.length > 0) {
          if (cmd._aliases.includes(alias)) {
            throw new Error('Duplicate alias "' + alias + '" for command "' + this._name + '" detected. Was first reserved by command "' + cmd._name + '".')
          }
        }
      })
      this._aliases.push(alias)
    }
    return this
  }

  description (str) {
    if (str === undefined) {
      return this._description
    }
    this._description = str
    return this
  }

  remove () {
    const self = this
    this._parent.commands = this._parent.commands.filter(function (command) {
      return command._name !== self._name
    })
    return this
  }

  arguments (desc) {
    return this._parseExpectedArgs(desc.split(/ +/))
  }

  helpInformation () {
    const desc = []
    const cmdName = this._name
    let alias = ''

    if (this._description) {
      desc.push('  ' + this._description, '')
    }

    if (this._aliases.length > 0) {
      alias = '  Alias: ' + this._aliases.join(' | ') + '\n'
    }
    const usage = [
      '',
      '  Usage: ' + cmdName + ' ' + this.usage(),
      ''
    ]

    const cmds = []

    const help = String(this.optionHelp().replace(/^/gm, '    '))
    const options = [
      '  Options:',
      '',
      help,
      ''
    ]

    let res = usage
      .concat(cmds)
      .concat(alias)
      .concat(desc)
      .concat(options)
      .join('\n')

    res = res.replace(/\n\n\n/g, '\n\n')

    return res
  }

  hidden () {
    this._hidden = true
    return this
  }

  allowUnknownOptions (allowUnknownOptions = true) {
    allowUnknownOptions = allowUnknownOptions === "false" ? false : allowUnknownOptions

    this._allowUnknownOptions = !!allowUnknownOptions
    return this
  }

  usage (str) {
    const args = this._args.map(function (arg) {
      return VorpalUtil.humanReadableArgName(arg)
    })

    const usageStr = '[options]' +
      (this.commands.length ? ' [command]' : '') +
      (this._args.length ? ' ' + args.join(' ') : '')

    if (str === undefined) {
      return (this._usage || usageStr)
    }

    this._usage = str

    return this
  }

  optionHelp () {
    const width = this._largestOptionLength()

    return [VorpalUtil.pad('--help', width) + '  output usage information']
      .concat(this.options.map(function (option) {
        return VorpalUtil.pad(option.flags, width) + '  ' + option.description
      }))
      .join('\n')
  }

  _largestOptionLength () {
    return this.options.reduce(function (max, option) {
      return Math.max(max, option.flags.length)
    }, 0)
  }

  help (fn) {
    if (typeof fn === 'function') {
      this._help = fn
    }
    return this
  }

  parse (fn) {
    if (typeof fn === 'function') {
      this._parse = fn
    }
    return this
  }

  after (fn) {
    if (typeof fn === 'function') {
      this._after = fn
    }
    return this
  }

  _parseExpectedArgs (args) {
    if (!args.length) {
      return
    }
    const self = this
    args.forEach(function (arg) {
      const argDetails = {
        required: false,
        name: '',
        variadic: false
      }

      switch (arg[0]) {
        case '<':
          argDetails.required = true
          argDetails.name = arg.slice(1, -1)
          break
        case '[':
          argDetails.name = arg.slice(1, -1)
          break
        default:
          break
      }

      if (argDetails.name.length > 3 && argDetails.name.slice(-3) === '...') {
        argDetails.variadic = true
        argDetails.name = argDetails.name.slice(0, -3)
      }
      if (argDetails.name) {
        self._args.push(argDetails)
      }
    })

    if (self._args.length > 1) {
      self._args = self._args.sort(function (argu1, argu2) {
        if (argu1.required && !argu2.required) {
          return -1
        } else if (argu2.required && !argu1.required) {
          return 1
        } else if (argu1.variadic && !argu2.variadic) {
          return 1
        } else if (argu2.variadic && !argu1.variadic) {
          return -1
        }
        return 0
      })
    }

    return
  }
}

function _camelcase (flag) {
  return flag.split('-').reduce(function (str, word) {
    return str + word[0].toUpperCase() + word.slice(1)
  })
}