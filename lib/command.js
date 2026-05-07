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

  /** Registers an option for given command. @param {string} flags @param {string} description @param {*} autocomplete @return {Command} */
  option (flags, description, autocomplete) {
    const option = new Option(flags, description, autocomplete)
    const oname = option.name()
    const name = _camelcase(oname)
    // preassign default value only for --no-*, [optional], or <required>
    let defaultValue

    if (option.bool === false || option.optional || option.required) {
      // when --no-* we make sure default is true
    if (option.bool === false) {
        defaultValue = true
      }
      // preassign only if we have a default
    if (defaultValue !== undefined) {
        this[name] = defaultValue
      }
    }

    // register the option
    this.options.push(option)

    // when it's passed assign the value and conditionally invoke the callback
    this.on(oname, function (val) {
      // unassigned or bool
      if (typeof this[name] === 'boolean' || typeof this[name] === 'undefined') {
        // if no value, bool true, and we have a default, then use it!
        if (val === null) {
          this[name] = option.bool ?
            defaultValue || true :
            false
        } else {
          this[name] = val
        }
      } else if (val !== null) {
        // reassign
        this[name] = val
      }
    })

    return this
  }

  /** Defines an action for a given command. @param {function} fn @return {Command} */
  action (fn) {
    this._fn = fn
    return this
  }

  /** Lets you compose other functions to extend the command. @param {function} fn @return {Command} */
  use (fn) {
    return fn(this)
  }

  /** Defines a function to validate arguments before action is performed.
   *  Arguments are valid if no errors are thrown. @param {function} fn @return {Command} */
  validate (fn) {
    this._validate = fn
    return this
  }

  /** Defines a function to be called when the command is canceled. @param {function} fn @return {Command} */
  cancel (fn) {
    this._cancel = fn
    return this
  }

  /** Defines a method to be called when the command set has completed. @param {function} fn @return {Command} */
  done (fn) {
    this._done = fn
    return this
  }

  /** Defines tabbed auto-completion for the given command.
   *  Favored over deprecated command.autocompletion. @param {*} obj @return {Command} */
  autocomplete (obj) {
    this._autocomplete = obj
    return this
  }

  /** Defines tabbed auto-completion rules for the given command.
   *  @param {function|object} param @return {Command} */
  autocompletion (param) {
    this._parent._useDeprecatedAutocompletion = true
    if (typeof param !== 'function' && (typeof param !== 'object' || param === null)) {
      throw new Error('An invalid object type was passed into the first parameter of command.autocompletion: function expected.')
    }

    this._autocompletion = param
    return this
  }

  /** Defines an init action for a mode command. @param {function} fn @return {Command} */
  init (fn) {
    if (this._mode !== true) {
      throw Error('Cannot call init from a non-mode action.')
    }
    this._init = fn
    return this
  }

  /** Defines a prompt delimiter for a mode once entered. @param {string} delimiter @return {Command} */
  delimiter (delimiter) {
    this._delimiter = delimiter
    return this
  }

  /** Sets args for static typing of options using minimist. @param {object} types @return {Command} */
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

  /** Defines an alias for a given command. @param {...string} aliases @return {Command} */
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

  /** Defines description for given command. @param {string} [str] @return {Command|string} */
  description (str) {
    if (str === undefined) {
      return this._description
    }
    this._description = str
    return this
  }

  /** Removes self from Vorpal instance. @return {Command} */
  remove () {
    const self = this
    this._parent.commands = this._parent.commands.filter(function (command) {
      return command._name !== self._name
    })
    return this
  }

  /** Returns the command arguments as string. @param {string} desc @return {Command} */
  arguments (desc) {
    return this._parseExpectedArgs(desc.split(/ +/))
  }

  /** Returns the help info for given command. @return {string} */
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

  /** Doesn't show command in the help menu. @return {Command} */
  hidden () {
    this._hidden = true
    return this
  }

  /** Allows undeclared options to be passed in with the command. @param {boolean} allowUnknownOptions @return {Command} */
  allowUnknownOptions (allowUnknownOptions = true) {
    allowUnknownOptions = allowUnknownOptions === "false" ? false : allowUnknownOptions

    this._allowUnknownOptions = !!allowUnknownOptions
    return this
  }

  /** Returns the command usage string for help. @param {string} [str] @return {Command|string} */
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

  /** Returns the help string for the command's options. @return {string} */
  optionHelp () {
    const width = this._largestOptionLength()

    return [VorpalUtil.pad('--help', width) + '  output usage information']
      .concat(this.options.map(function (option) {
        return VorpalUtil.pad(option.flags, width) + '  ' + option.description
      }))
      .join('\n')
  }

  /** Returns the length of the longest option. @return {number} */
  _largestOptionLength () {
    return this.options.reduce(function (max, option) {
      return Math.max(max, option.flags.length)
    }, 0)
  }

  /** Adds custom handling for the --help flag. @param {function} fn @return {Command} */
  help (fn) {
    if (typeof fn === 'function') {
      this._help = fn
    }
    return this
  }

  /** Edits the raw command string before it is executed. @param {function} fn @return {Command} */
  parse (fn) {
    if (typeof fn === 'function') {
      this._parse = fn
    }
    return this
  }

  /** Adds a command to be executed after command completion. @param {function} fn @return {Command} */
  after (fn) {
    if (typeof fn === 'function') {
      this._after = fn
    }
    return this
  }

  /** Parses and returns expected command arguments. @param {string[]} args */
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
      // If the user entered args in a weird order, properly sequence them.
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

/** Converts a flag string to camelCase. @param {string} flag @return {string} */
function _camelcase (flag) {
  return flag.split('-').reduce(function (str, word) {
    return str + word[0].toUpperCase() + word.slice(1)
  })
}