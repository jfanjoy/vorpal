import { parseArgs as nodeParseArgs } from 'node:util'
import EventEmitter from 'node:events'
import Command from './command.js'
import CommandInstance from './command-instance.js'
import VorpalUtil from './util.js'
import ui from './ui.js'
import Session from './session.js'
import intercept from './intercept.js'

import commons from './vorpal-commons.js'
import chalk from 'chalk'
import os from 'node:os'
import History from './history.js'
import LocalStorage from './local-storage.js'
import wrap from 'wrap-ansi'

class Vorpal extends EventEmitter {
  constructor () {
    super()
    if (!(this instanceof Vorpal)) {
      return new Vorpal()
    }

    this._version = ''
    this._title = ''
    this._description = ''
    this._banner = ''
    this.cmdHistory = new this.CmdHistoryExtension()
    this.commands = []
    this._queue = []
    this._command = undefined
    this.ui = ui
    this.chalk = chalk
    this._delimiter = 'local@' + String(os.hostname()).split('.')[0] + '~$ '
    ui.setDelimiter(this._delimiter)
    this.server = { sessions: [] }
    this._hooked = false
    this._useDeprecatedAutocompletion = false
    this.util = VorpalUtil
    this.Session = Session
    this.session = new this.Session({
      local: true,
      user: 'local',
      parent: this,
      delimiter: this._delimiter
    })
    this.isCommandArgKeyPairNormalized = true
    this._init()
    return this
  }

  _init () {
    const self = this
    ui.on('vorpal_ui_keypress', function (data) {
      self.emit('keypress', data)
      self._onKeypress(data.key, data.value)
    })
    self.use(commons)
  }

  parse (argv, options) {
    options = options || {}
    const args = argv
    let result = this
    const catchExists = this.commands.find(c => c._catch) !== undefined
    args.shift()
    args.shift()
    if (args.length > 0 || catchExists) {
      if (options.use === 'minimist') {
        result = nodeParseArgs({ args, strict: false, allowPositionals: true })
      } else {
        for (let i = 0; i < args.length; ++i) {
          if (i === 0) {
            continue
          }
          if (args[i].indexOf(' ') > -1) {
            args[i] = `"${args[i]}"`
          }
        }
        this.exec(args.join(' '), function (err) {
          if (err !== undefined && err !== null) {
            throw new Error(err)
          }
          process.exit(0)
        })
      }
    }
    return result
  }

  version (version) {
    this._version = version
    return this
  }

  title (title) {
    this._title = title
    return this
  }

  description (description) {
    this._description = description
    return this
  }

  banner (banner) {
    this._banner = banner
    return this
  }

  delimiter (str) {
    this._delimiter = str
    if (this.session.isLocal() && !this.session.client) {
      this.session.delimiter(str)
    }
    return this
  }

  use (commands, options) {
    if (!commands) {
      return this
    }
    if (typeof commands === 'function') {
      commands.call(this, this, options)
    } else if (typeof commands === 'string') {
      return this.use(import(commands), options)
    } else {
      commands = Array.isArray(commands) ? commands : [commands]
      for (let i = 0; i < commands.length; ++i) {
        const cmd = commands[i]
        if (cmd.command) {
          const command = this.command(cmd.command)
          if (cmd.description) {
            command.description(cmd.description)
          }
          if (cmd.options) {
            cmd.options = Array.isArray(cmd.options) ? cmd.options : [cmd.options]
            for (let j = 0; j < cmd.options.length; ++j) {
              command.option(cmd.options[j][0], cmd.options[j][1])
            }
          }
          if (cmd.action) {
            command.action(cmd.action)
          }
        }
      }
    }
    return this
  }

  command (name, desc, opts) {
    opts = opts || {}
    name = String(name)

    const argsRegExp = /(\[[^\]]*\]|\<[^\>]*\>)/g
    const args = []
    let arg

    while ((arg = argsRegExp.exec(name)) !== null) {
      args.push(arg[1])
    }

    const cmdNameRegExp = /^([^\[\<]*)/
    const cmdName = cmdNameRegExp.exec(name)[0].trim()

    const cmd = new Command(cmdName, this)

    if (desc) {
      cmd.description(desc)
      this.executables = true
    }

    cmd._noHelp = Boolean(opts.noHelp)
    cmd._mode = opts.mode || false
    cmd._catch = opts.catch || false
    cmd._parseExpectedArgs(args)
    cmd.parent = this

    let exists = false
    for (let i = 0; i < this.commands.length; ++i) {
      exists = (this.commands[i]._name === cmd._name) ? true : exists
      if (exists) {
        this.commands[i] = cmd
        break
      }
    }
    if (!exists) {
      this.commands.push(cmd)
    } else {
      console.warn(chalk.yellow('Warning: command named "' + name + '" was registered more than once.\nIf you intend to override a command, you should explicitly remove the first command with command.remove().'))
    }

    this.emit('command_registered', { command: cmd, name })

    return cmd
  }

  mode (name, desc, opts) {
    return this.command(name, desc, Object.assign((opts || {}), { mode: true }))
  }

  catch (name, desc, opts) {
    return this.command(name, desc, Object.assign((opts || {}), { catch: true }))
  }

  default (name, desc, opts) {
    return this.command(name, desc, Object.assign((opts || {}), { catch: true }))
  }

  log (...args) {
    this.ui.log(...args)
    return this
  }

  pipe (fn) {
    if (this.ui) {
      this.ui._pipeFn = fn
    }
    return this
  }

  hook (fn) {
    if (fn !== undefined) {
      this._hook(fn)
    } else {
      this._unhook()
    }
    return this
  }

  _unhook () {
    if (this._hooked && this._unhook !== undefined) {
      this._unhook()
      this._hooked = false
    }
    return this
  }

  _hook (fn) {
    if (this._hooked && this._unhook !== undefined) {
      this._unhook()
    }
    this._unhook = intercept(fn)
    this._hooked = true
    return this
  }

  get CmdHistoryExtension () {
    return History
  }

  history (id) {
    this.cmdHistory.setId(id)
    return this
  }

  localStorage (id) {
    const ls = Object.create(LocalStorage)
    ls.setId(id)
    const storage = Object.assign(function (newId) {
      ls.setId(newId)
      storage._localStorage = ls._localStorage
    }, {
      setId: ls.setId.bind(ls),
      getItem: ls.getItem.bind(ls),
      setItem: ls.setItem.bind(ls),
      removeItem: ls.removeItem.bind(ls),
      _localStorage: ls._localStorage
    })
    this.localStorage = storage
    return this
  }

  historyStoragePath (path) {
    this.cmdHistory.setStoragePath(path)
    return this
  }

  show () {
    ui.attach(this)
    return this
  }

  hide () {
    ui.detach(this)
    return this
  }

  _onKeypress (key, value) {
    const self = this
    if (this.session.isLocal() && !this.session.client && !this._command) {
      this.session.getKeypressResult(key, value, function (err, result) {
        if (!err && result !== undefined) {
          if (Array.isArray(result)) {
            const formatted = VorpalUtil.prettifyArray(result)
            self.ui.imprint()
            self.session.log(formatted)
          } else {
            self.ui.input(result)
          }
        }
      })
    } else {
      this._send('vantage-keypress-upstream', 'upstream', {
        key,
        value,
        sessionId: this.session.id
      })
    }
  }

  prompt (options = {}, userCallback) {
    return new Promise((resolve) => {
      const cb = (response) => {
        resolve(response)
        if (userCallback) {
          userCallback(response)
        }
      }

      let prompt
      const ssn = this.getSessionById(options.sessionId)

      if (!ssn) {
        throw new Error('Vorpal.prompt was called without a passed Session ID.')
      }

      const handler = (data) => {
        const response = data.value
        this.removeListener('vantage-prompt-upstream', handler)
        cb(response)
      }

      if (ssn.isLocal()) {
        ui.setDelimiter(options.message || ssn.delimiter())
        prompt = ui.prompt(options, (result) => {
          ui.setDelimiter(ssn.delimiter())
          cb(result)
        })
      } else {
        this.on('vantage-prompt-upstream', handler)
        this._send('vantage-prompt-downstream', 'downstream', { options, value: undefined, sessionId: ssn.id })
      }
      return prompt
    })
  }

  _prompt (data) {
    const self = this
    let prompt
    data = data || {}
    if (!data.sessionId) {
      data.sessionId = self.session.id
    }
    const ssn = self.getSessionById(data.sessionId)

    if (!ssn.isLocal()) {
      this._send('vantage-resume-downstream', 'downstream', { sessionId: data.sessionId })
      return self
    }

    if (ui.midPrompt()) {
      return self
    }

    prompt = ui.prompt({
      type: 'input',
      name: 'command',
      message: ssn.fullDelimiter()
    }, function (result) {
      if (self.ui._cancelled === true) {
        self.ui._cancelled = false; return
      }
      const str = String(result.command).trim()
      self.emit('client_prompt_submit', str)
      if (str === '' || str === 'undefined') {
        self._prompt(data); return
      }
      self.exec(str, function () {
        self._prompt(data)
      })
    })

    return prompt
  }

  exec (cmd, args, cb) {
    const self = this
    let ssn = self.session

    cb = (typeof args === 'function') ? args : cb
    args = args || {}

    if (args.sessionId) {
      ssn = self.getSessionById(args.sessionId)
    }

    const command = {
      command: cmd,
      args,
      callback: cb,
      session: ssn
    }

    if (cb !== undefined) {
      self._queue.push(command)
      self._queueHandler()
      return self
    }

    return new Promise(function (resolve, reject) {
      command.resolve = resolve
      command.reject = reject
      self._queue.push(command)
      self._queueHandler()
    })
  }

  execSync (cmd, options) {
    const self = this
    let ssn = self.session
    options = options || {}
    if (options.sessionId) {
      ssn = self.getSessionById(options.sessionId)
    }

    const command = {
      command: cmd,
      args: options,
      session: ssn,
      sync: true,
      options
    }

    return self._execQueueItem(command)
  }

  _queueHandler () {
    if (this._queue.length > 0 && this._command === undefined) {
      const item = this._queue.shift()
      this._execQueueItem(item)
    }
  }

  _execQueueItem (cmd) {
    const self = this
    self._command = cmd
    if (cmd.session.isLocal() && !cmd.session.client) {
      return this._exec(cmd)
    }
    self._send('vantage-command-upstream', 'upstream', {
      command: cmd.command,
      args: cmd.args,
      completed: false,
      sessionId: cmd.session.id
    })
  }

  _exec (item = {}) {
    const self = this
    item.command = item.command || ''
    const modeCommand = item.command
    item.command = (item.session._mode) ? item.session._mode : item.command

    let promptCancelled = false
    if (this.ui._midPrompt) {
      promptCancelled = true
      this.ui.cancel()
    }

    if (!item.session) {
      throw new Error('Fatal Error: No session was passed into command for execution: ' + item)
    }

    if (item.command === undefined) {
      throw new Error('vorpal._exec was called with an undefined command.')
    }

    item.session.history((item.session._mode ? modeCommand : item.command))

    const commandData = this.util.parseCommand(item.command, this.commands)

    item.command = commandData.command
    item.pipes = commandData.pipes
    const match = commandData.match
    const matchArgs = commandData.matchArgs

    function throwHelp (cmd, msg, alternativeMatch) {
      if (msg) {
        cmd.session.log(msg)
      }
      const pickedMatch = alternativeMatch || match
      cmd.session.log(pickedMatch.helpInformation())
    }

    function callback (cmd, err, msg, argus) {
      if (promptCancelled) {
        self._prompt()
      }
      if (cmd.sync) {
        delete self._command
        if (err) {
          if (cmd.options && (cmd.options.fatal === true || self._fatal === true)) {
            throw new Error(err)
          }
          return err
        }
        return msg
      } else if (cmd.callback) {
        if (argus) {
          cmd.callback.apply(self, argus)
        } else {
          cmd.callback.call(self, err, msg)
        }
      } else if (!err && cmd.resolve) {
        cmd.resolve(msg)
      } else if (err && cmd.reject) {
        cmd.reject(msg)
      }
      delete self._command
      self._queueHandler()
    }

    if (match) {
      const { _fn, _cancel, _validate } = match
      Object.assign(item, { fn: _fn, _cancel, validate: _validate, commandObject: match })
      const init = match._init || function (arrgs, cb) {
        cb()
      }
      const delimiter = match._delimiter || String(item.command) + ':'

      item.args = self.util.buildCommandArgs(matchArgs, match, item, self.isCommandArgKeyPairNormalized)
      if (typeof item.args === 'string' || !VorpalUtil.isObject(item.args)) {
        throwHelp(item, item.args)
        return callback(item, undefined, item.args)
      }

      let allValid = true

      for (let j = 0; j < item.pipes.length; ++j) {
        const commandParts = self.util.matchCommand(item.pipes[j], self.commands)
        if (!commandParts.command) {
          item.session.log(self._commandHelp(item.pipes[j]))
          allValid = false
          break
        }
        commandParts.args = self.util.buildCommandArgs(commandParts.args, commandParts.command)
        if (typeof commandParts.args === 'string' || !VorpalUtil.isObject(commandParts.args)) {
          throwHelp(item, commandParts.args, commandParts.command)
          allValid = false
          break
        }
        item.pipes[j] = commandParts
      }
      if (!allValid) {
        return callback(item)
      }

      if (item.args.options.help && typeof match._help === 'function') {
        item.fn = match._help
        delete item.validate
        delete item._cancel
      } else if (item.args.options.help) {
        throwHelp(item, '')
        return callback(item)
      }

      if (match._mode === true && !item.session._mode) {
        item.session._mode = item.command
        item.fn = init
        delete item.validate

        self.cmdHistory.enterMode()
        item.session.modeDelimiter(delimiter)
      } else if (item.session._mode) {
        if (String(modeCommand).trim() === 'exit') {
          self._exitMode({ sessionId: item.session.id })
          return callback(item)
        }
        item.args = modeCommand
      }

      if (item.sync === true) {
        let response
        let error
        try {
          response = item.fn.call(new CommandInstance({
            downstream: undefined,
            commandWrapper: item,
            commandObject: item.commandObject,
            args: item.args
          }), item.args)
        } catch (e) {
          error = e
        }
        return callback(item, error, response)
      }

      item.pipes = item.pipes.map(function (pipe) {
        return new CommandInstance({
          commandWrapper: item,
          command: pipe.command._name,
          commandObject: pipe.command,
          args: pipe.args
        })
      })

      for (let k = item.pipes.length - 1; k > -1; --k) {
        const downstream = item.pipes[k + 1]
        item.pipes[k].downstream = downstream
      }

      item.session.execCommandSet(item, function (wrapper, err, data, argus) {
        callback(wrapper, err, data, argus)
      })
    } else {
      item.session.log(this._commandHelp(item.command))
      return callback(item, undefined, 'Invalid command.')
    }
  }

  _exitMode (options) {
    const ssn = this.getSessionById(options.sessionId)
    ssn._mode = false
    this.cmdHistory.exitMode()
    ssn.modeDelimiter(false)
    this.emit('mode_exit', this.cmdHistory.peek())
  }

  sigint (fn) {
    if (typeof fn === 'function') {
      ui.sigint(fn)
    } else {
      throw new Error('vorpal.sigint must be passed in a valid function.')
    }
    return this
  }

  find (name) {
    return this.commands.find(c => c._name === name)
  }

  help (fn) {
    this._help = fn
  }

  _commandHelp (command) {
    if (!this.commands.length) {
      return ''
    }

    if (this._help !== undefined && typeof this._help === 'function') {
      return this._help(command)
    }

    let matches = []
    const singleMatches = []

    command = (command) ? String(command).trim() : undefined
    for (let i = 0; i < this.commands.length; ++i) {
      const parts = String(this.commands[i]._name).split(' ')
      if (parts.length === 1 && parts[0] === command && !this.commands[i]._hidden && !this.commands[i]._catch) {
        singleMatches.push(command)
      }
      let str = ''
      for (let j = 0; j < parts.length; ++j) {
        str = String(str + ' ' + parts[j]).trim()
        if (str === command && !this.commands[i]._hidden && !this.commands[i]._catch) {
          matches.push(this.commands[i])
          break
        }
      }
    }

    const invalidString =
      (command && matches.length === 0 && singleMatches.length === 0)
        ? ['', '  Invalid Command. Showing Help:', ''].join('\n')
        : ''

    const commandMatch = (matches.length > 0)
    const commandMatchLength = (commandMatch) ? String(command).trim().split(' ').length + 1 : 1
    matches = (matches.length === 0) ? this.commands : matches

    const skipGroups = !((matches.length + 6) > process.stdout.rows)

    const commands = matches.filter(function (cmd) {
      return !cmd._noHelp
    }).filter(function (cmd) {
      return !cmd._catch
    }).filter(function (cmd) {
      return !cmd._hidden
    }).filter(function (cmd) {
      if (skipGroups === true) {
        return true
      }
      return (String(cmd._name).trim().split(' ').length <= commandMatchLength)
    }).map(function (cmd) {
      const args = cmd._args.map(function (arg) {
        return VorpalUtil.humanReadableArgName(arg)
      }).join(' ')

      return [
        cmd._name +
          (cmd._alias
            ? '|' + cmd._alias
            : '') +
          (cmd.options.length
            ? ' [options]'
            : '') +
          ' ' + args,
        (cmd.description() || '')
      ]
    })

    const width = commands.reduce(function (max, commandX) {
      return Math.max(max, commandX[0].length)
    }, 0)

    const counts = {}

    let groups = [...new Set(matches.filter(function (cmd) {
      return (String(cmd._name).trim().split(' ').length > commandMatchLength)
    }).map(function (cmd) {
      return String(cmd._name).split(' ').slice(0, commandMatchLength).join(' ')
    }))].map(function (cmd) {
      counts[cmd] = counts[cmd] || 0
      counts[cmd]++
      return cmd
    }).map(function (cmd) {
      const prefix = `    ${VorpalUtil.pad(cmd + ' *', width)}  ${counts[cmd]} sub-command${((counts[cmd] === 1) ? '' : 's')}.`
      return prefix
    })

    groups = (skipGroups) ? [] : groups

    const descriptionWidth = process.stdout.columns - (width + 4)

    const commandsString = (commands.length < 1)
      ? ''
      : '\n  Commands:\n\n' +
      commands.map(function (cmd) {
        const prefix = '    ' + VorpalUtil.pad(cmd[0], width) + '  '
        let suffix = wrap(cmd[1], descriptionWidth - 8).split('\n')
        for (let i = 0; i < suffix.length; ++i) {
          if (i !== 0) {
            suffix[i] = VorpalUtil.pad('', width + 6) + suffix[i]
          }
        }
        suffix = suffix.join('\n')
        return prefix + suffix
      })
        .join('\n') +
      '\n\n'

    const groupsString = (groups.length < 1)
      ? ''
      : '  Command Groups:\n\n' + groups.join('\n') + '\n'

    const results = String(
      this._helpHeader(!!invalidString) +
      invalidString +
      commandsString + '\n' +
      groupsString
    )
      .replace(/\n\n\n/g, '\n\n')
      .replace(/\n\n$/, '\n')

    return results
  }

  _helpHeader (hideTitle) {
    const header = []

    if (this._banner) {
      header.push(VorpalUtil.padRow(this._banner), '')
    }

    if (this._title && !hideTitle) {
      let title = this._title

      if (this._version) {
        title += ' v' + this._version
      }

      header.push(VorpalUtil.padRow(title))

      if (this._description) {
        const descWidth = process.stdout.columns * 0.75

        header.push(VorpalUtil.padRow(wrap(this._description, descWidth)))
      }
    }

    if (header.length) {
      header.unshift('')
      header.push('')
    }

    return header.join('\n')
  }

  _send (str, direction, data, options) {
    options = options || {}
    data = data || {}
    const ssn = this.getSessionById(data.sessionId)
    if (!ssn) {
      throw new Error('No Sessions logged for ID ' + data.sessionId + ' in vorpal._send.')
    }
    if (direction === 'upstream') {
      if (ssn.client) {
        ssn.client.emit(str, data)
      }
    } else if (direction === 'downstream') {
      if (ssn.server) {
        ssn.server.emit(str, data)
      }
    }
  }

  _proxy (str, direction, data, options) {
    const self = this
    return new Promise(function (resolve) {
      const ssn = self.getSessionById(data.sessionId)
      if (ssn && (!ssn.isLocal() && ssn.client)) {
        self._send(str, direction, data, options)
      } else {
        resolve()
      }
    })
  }

  getSessionById (id) {
    if (VorpalUtil.isObject(id)) {
      throw new Error('vorpal.getSessionById: id ' + JSON.stringify(id) + ' should not be an object.')
    }
    let ssn = this.server.sessions.find(s => s.id === id)
    ssn = (this.session.id === id) ? this.session : ssn
    if (!id) {
      throw new Error('vorpal.getSessionById was called with no ID passed.')
    }
    if (!ssn) {
      const sessions = {
        local: this.session.id,
        server: this.server.sessions.map(s => s.id)
      }
      throw new Error('No session found for id ' + id + ' in vorpal.getSessionById. Sessions: ' + JSON.stringify(sessions))
    }
    return ssn
  }

  exit (options) {
    const ssn = this.getSessionById(options.sessionId)
    this.emit('vorpal_exit')
    if (ssn.isLocal()) {
      process.exit(0)
    } else {
      ssn.server.emit('vantage-close-downstream', { sessionId: ssn.id })
    }
  }

  get activeCommand () {
    const result = (this._command) ? this._command.commandInstance : undefined
    return result
  }
}

export default Vorpal