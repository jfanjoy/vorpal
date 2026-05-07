import EventEmitter from 'node:events'
import os from 'node:os'
import util from './util.js'
import autocomplete from './autocomplete.js'
import CommandInstance from './command-instance.js'

export default class Session extends EventEmitter {
  #commandSetCallback

  constructor (options) {
    super()
    options = options || {}
    this.id = options.id || this._guid()
    this.parent = options.parent || undefined
    this.authenticating = options.authenticating || false
    this.authenticated = options.authenticated || undefined
    this.user = options.user || 'guest'
    this.host = options.host
    this.address = options.address || undefined
    this._isLocal = options.local || undefined
    this._delimiter = options.delimiter || String(os.hostname()).split('.')[0] + '~$'
    this._modeDelimiter = undefined
    // Tracks how many times in a row tab was pressed.
    this._tabCtr = 0
    this.cmdHistory = this.parent.cmdHistory
    // Special command mode vorpal is in at the moment, such as REPL.
    this._mode = undefined
    this._registeredCommands = 0
    this._completedCommands = 0
  }

  /** Pipes logging data through any piped commands, then sends it to ._log. @param {...*} args */
  log (...args) {
    const fixed = util.fixArgsForApply(args)
    return this._log(...fixed)
  }

  /** Routes logging for a given session, whether on a local TTY or remote. @param {...*} args */
  _log (...args) {
    if (this.isLocal()) {
      this.parent.ui.log(...args)
    } else {
      const fixed = []
    for (const arg of args) {
      // If it's an error, expose the stack. Otherwise we get a helpful '{}'.
      let str = arg
        str = (str && str.stack) ? 'Error: ' + str.message : str
        fixed.push(str)
      }
      this.parent._send('vantage-ssn-stdout-downstream', 'downstream', { sessionId: this.id, value: fixed })
    }
    return this
  }

  /** Returns whether given session is on a local TTY, or remote. @return {boolean} */
  isLocal () {
    return this._isLocal
  }

  /** Maps to vorpal.prompt for a session context. @param {object} options @param {function} cb */
  prompt (options, cb) {
    options = options || {}
    options.sessionId = this.id
    return this.parent.prompt(options, cb)
  }

  /** Gets the full (normal + mode) delimiter for this session. @return {string} */
  fullDelimiter () {
    const result = this._delimiter +
      ((this._modeDelimiter !== undefined) ? this._modeDelimiter : '')
    return result
  }

  /** Sets the delimiter for this session. @param {string} [str] @return {Session} */
  delimiter (str) {
    if (str === undefined) {
      return this._delimiter
    }
    this._delimiter = String(str).trim() + ' '
    if (this.isLocal()) {
      this.parent.ui.refresh()
    } else {
      this.parent._send('vantage-delimiter-downstream', 'downstream', { value: str, sessionId: this.id })
    }
    return this
  }

  /** Sets the mode delimiter for this session. @param {string} [str] @return {Session} */
  modeDelimiter (str) {
    if (str === undefined) {
      return this._modeDelimiter
    }
    if (!this.isLocal()) {
      this.parent._send('vantage-mode-delimiter-downstream', 'downstream', { value: str, sessionId: this.id })
    } else {
      if (str === false || str === 'false') {
        this._modeDelimiter = undefined
      } else {
        this._modeDelimiter = String(str).trim() + ' '
      }
      this.parent.ui.refresh()
    }
    return this
  }

  /** Returns the result of a keypress string, depending on the type.
   *  @param {string} key @param {string} value @param {function} cb */
  getKeypressResult (key, value, cb) {
    cb = cb || function () {}
    const keyMatch = (['up', 'down', 'tab'].indexOf(key) > -1)
    if (key !== 'tab') {
      this._tabCtr = 0
    }
    if (keyMatch) {
      if (['up', 'down'].indexOf(key) > -1) {
        cb(undefined, this.getHistory(key))
      } else if (key === 'tab') {
        // If the user has any commands that use command.autocompletion, defer to the
        // deprecated version. Otherwise, default to the new version.
        const fn = (this.parent._useDeprecatedAutocompletion)
          ? 'getAutocompleteDeprecated'
          : 'getAutocomplete'
        this[fn](value, function (err, data) {
          cb(err, data)
        })
      }
    }
  }

  history (str) {
    const exceptions = []
    if (str && exceptions.indexOf(String(str).toLowerCase()) === -1) {
      this.cmdHistory.newCommand(str)
    }
  }

  /** New autocomplete. @param {string} str @param {function} cb */
  getAutocomplete (str, cb) {
    return autocomplete.exec.call(this, str, cb)
  }

  /** Deprecated autocomplete — being removed in Vorpal 2.0. @param {string} str @param {function} cb */
  getAutocompleteDeprecated (str, cb) {
    cb = cb || function () {}

    const cursor = this.parent.ui._activePrompt.rl.cursor
    let trimmed = String(str).trim()
    const cut = String(trimmed).slice(0, cursor)
    const remainder = String(trimmed).slice(cursor, trimmed.length).replace(/ +$/, '')
    trimmed = cut

    let pre = ''
    const lastPipeIndex = trimmed.lastIndexOf('|')
    if (lastPipeIndex !== -1) {
      pre = trimmed.slice(0, lastPipeIndex + 1) + ' '
      trimmed = trimmed.slice(lastPipeIndex + 1).trim()
    }

    const names = this.parent.commands.map(({ _name }) => _name)
    const aliases = this.parent.commands.map(({ _aliases }) => _aliases).flat()
    const commands = [...names, ...aliases]
    const result = this._autocomplete(trimmed, commands)
    if (result && trimmed.length < String(result).trim().length) {
      cb(undefined, pre + result + remainder)
      return
    }

    let match
    let extra

    names.forEach(function (name) {
      if (trimmed.slice(0, name.length) === name && String(name).trim() !== '') {
        match = name
        extra = trimmed.slice(name.length).trim()
      }
    })

    let command = (match)
      ? this.parent.commands.find(com => com._name === match)
      : undefined

    if (!command) {
      command = this.parent.commands.find(com => com._catch)
      if (command) {
        extra = trimmed
      }
    }

    if (command && typeof command._autocompletion === 'function') {
      this._tabCtr++
      command._autocompletion.call(this, extra, this._tabCtr, function (err, autocomplete) {
        if (err) {
          return cb(err)
        }
        if (Array.isArray(autocomplete)) {
          return cb(undefined, autocomplete)
        } else if (autocomplete === undefined) {
          return cb(undefined, undefined)
        }
        return cb(undefined, pre + autocomplete + remainder)
      })
    } else {
      cb(undefined, undefined)
    }
  }

  /** Public facing autocomplete helper. @param {string} str @param {string[]} arr */
  _autocomplete (str, arr) {
    return autocomplete.match.call(this, str, arr)
  }

  help (command) {
    this.log(this.parent._commandHelp(command || ''))
  }

  /** Public facing autocomplete match helper. @param {string} str @param {string[]} arr */
  match (str, arr) {
    return this._autocomplete(str, arr)
  }

  /** Gets a new command set ready. Accepts a command wrapper and callback.
   *  @param {object} wrapper @param {function} callback */
  execCommandSet (wrapper, callback) {
    const self = this
    let response = {}
    let res
    const cbk = callback
    this._registeredCommands = 1
    this._completedCommands = 0

    // Create the command instance for the first command and hook it up to the pipe chain.
    const commandInstance = new CommandInstance({
      downstream: wrapper.pipes[0],
      commandObject: wrapper.commandObject,
      commandWrapper: wrapper
    })

    wrapper.commandInstance = commandInstance

    function sendDones (itm) {
      if (itm.commandObject && itm.commandObject._done) {
        itm.commandObject._done.call(itm)
      }
      if (itm.downstream) {
        sendDones(itm.downstream)
      }
    }

    // Called when command is cancelled
    this.cancelCommands = function () {
      const callCancel = function (commandInstance) {
        if (typeof commandInstance.commandObject._cancel === 'function') {
          commandInstance.commandObject._cancel.call(commandInstance)
        }

        if (commandInstance.downstream) {
          callCancel(commandInstance.downstream)
        }
      }

      callCancel(wrapper.commandInstance)

      // Check if there is a cancel method on the promise
      if (res && typeof res.cancel === 'function') {
        res.cancel(wrapper.commandInstance)
      }

      self.removeListener('vorpal_command_cancel', self.cancelCommands)
      self.cancelCommands = undefined
      self.#commandSetCallback = undefined
      self._registeredCommands = 0
      self._completedCommands = 0
      self.parent.emit('client_command_cancelled', { command: wrapper.command })

      cbk(wrapper)
    }

    this.on('vorpal_command_cancel', self.cancelCommands)

    // Gracefully handles all instances of the command completing.
    this.#commandSetCallback = function () {
      const err = response.error
      const data = response.data
      const argus = response.args
      if (self.isLocal() && err) {
        let stack
        if (data && data.stack) {
          stack = data.stack
        } else if (err && err.stack) {
          stack = err.stack
        } else {
          stack = err
        }
        self.log(stack)
        self.parent.emit('client_command_error', { command: wrapper.command, error: err })
      } else if (self.isLocal()) {
        self.parent.emit('client_command_executed', { command: wrapper.command })
      }

      self.removeListener('vorpal_command_cancel', self.cancelCommands)
      self.cancelCommands = undefined
      cbk(wrapper, err, data, argus)
      sendDones(commandInstance)
    }

    function onCompletion (wrapper, err, data, argus) {
      response = {
        error: err,
        data,
        args: argus
      }
      self.completeCommand()
    }

    let valid
    if (typeof wrapper.validate === 'function') {
      try {
        valid = wrapper.validate.call(commandInstance, wrapper.args)
      } catch (e) {
        // Complete with error on validation error
        onCompletion(wrapper, e)
        return self
      }
    }

    if (valid !== true && valid !== undefined) {
      onCompletion(wrapper, valid || null)
      return self
    }

    if (wrapper.args && typeof wrapper.args === 'object') {
      wrapper.args.rawCommand = wrapper.command
    }

    // If the command as declared by the user returns a promise, handle accordingly.
    res = wrapper.fn.call(commandInstance, wrapper.args, function (...callerArgs) {
      const argus = util.fixArgsForApply(callerArgs)
      onCompletion(wrapper, argus[0], argus[1], argus)
    })

    if (res && typeof res.then === 'function') {
      res.then(function (data) {
        onCompletion(wrapper, undefined, data)
      }).catch(function (err) {
        onCompletion(wrapper, true, err)
      })
    }

    return self
  }

  /** Adds on a command or sub-command in progress. */
  registerCommand () {
    this._registeredCommands = this._registeredCommands || 0
    this._registeredCommands++
    return this
  }

  /** Marks a command or subcommand as having completed. If all commands
   *  have completed, calls back to the root command as being done. */
  completeCommand () {
    this._completedCommands++
    if (this._registeredCommands <= this._completedCommands) {
      this._registeredCommands = 0
      this._completedCommands = 0
      if (this.#commandSetCallback) {
        this.#commandSetCallback()
      }
      this.#commandSetCallback = undefined
    }
    return this
  }

  /** Returns the appropriate command history string based on an 'Up' or 'Down'
   *  arrow key pressed by the user. @param {string} direction @return {string|undefined} */
  getHistory (direction) {
    let history
    if (direction === 'up') {
      history = this.cmdHistory.getPreviousHistory()
    } else if (direction === 'down') {
      history = this.cmdHistory.getNextHistory()
    }
    return history
  }

  /** Generates random GUID for Session ID. @return {string} */
  _guid () {
    function s4 () {
      return Math.floor((1 + Math.random()) * 0x10000)
        .toString(16)
        .slice(1)
    }
    return s4() + s4() + '-' + s4() + '-' + s4() + '-' +
      s4() + '-' + s4() + s4() + s4()
  }
}