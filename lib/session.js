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
    this._tabCtr = 0
    this.cmdHistory = this.parent.cmdHistory
    this._mode = undefined
    this._registeredCommands = 0
    this._completedCommands = 0
  }

  log (...args) {
    const fixed = util.fixArgsForApply(args)
    return this._log(...fixed)
  }

  _log (...args) {
    if (this.isLocal()) {
      this.parent.ui.log(...args)
    } else {
      const fixed = []
      for (const arg of args) {
        let str = arg
        str = (str && str.stack) ? 'Error: ' + str.message : str
        fixed.push(str)
      }
      this.parent._send('vantage-ssn-stdout-downstream', 'downstream', { sessionId: this.id, value: fixed })
    }
    return this
  }

  isLocal () {
    return this._isLocal
  }

  prompt (options, cb) {
    options = options || {}
    options.sessionId = this.id
    return this.parent.prompt(options, cb)
  }

  fullDelimiter () {
    const result = this._delimiter +
      ((this._modeDelimiter !== undefined) ? this._modeDelimiter : '')
    return result
  }

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

  getAutocomplete (str, cb) {
    return autocomplete.exec.call(this, str, cb)
  }

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

  _autocomplete (str, arr) {
    return autocomplete.match.call(this, str, arr)
  }

  help (command) {
    this.log(this.parent._commandHelp(command || ''))
  }

  match (str, arr) {
    return this._autocomplete(str, arr)
  }

  execCommandSet (wrapper, callback) {
    const self = this
    let response = {}
    let res
    const cbk = callback
    this._registeredCommands = 1
    this._completedCommands = 0

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

  registerCommand () {
    this._registeredCommands = this._registeredCommands || 0
    this._registeredCommands++
    return this
  }

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

  getHistory (direction) {
    let history
    if (direction === 'up') {
      history = this.cmdHistory.getPreviousHistory()
    } else if (direction === 'down') {
      history = this.cmdHistory.getNextHistory()
    }
    return history
  }

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