import EventEmitter from 'node:events'
import readline from 'node:readline'
import chalk from 'chalk'
import util from './util.js'
import logUpdate from 'log-update'
import { input as inquirerInput, confirm as inquirerConfirm, select as inquirerSelect, password as inquirerPassword, checkbox as inquirerCheckbox, expand as inquirerExpand, rawlist as inquirerRawlist } from '@inquirer/prompts'

const promptMap = {
  input: inquirerInput,
  confirm: inquirerConfirm,
  select: inquirerSelect,
  list: inquirerSelect,
  password: inquirerPassword,
  checkbox: inquirerCheckbox,
  expand: inquirerExpand,
  rawlist: inquirerRawlist
}

class UI extends EventEmitter {
  constructor () {
    super()
    const self = this

    this.parent = undefined
    this._activePrompt = undefined
    this._midPrompt = false
    this._cancelled = false
    this._pipeFn = undefined

    this._sigintCalled = false
    this._sigintCount = 0
    this._sigint = () => {
      if (this._sigintCount > 1) {
        this.parent.emit('vorpal_exit')
        process.exit(0)
      } else {
        const text = this.input()
        if (!this.parent) {
          process.exit(0)
        } else if (this.parent.session.cancelCommands) {
          this.imprint()
          this.submit('')
          this._sigintCalled = false
          this._sigintCount = 0
          this.parent.session.emit('vorpal_command_cancel')
        } else if (String(text).trim() !== '') {
          this.imprint()
          this.submit('')
          this._sigintCalled = false
          this._sigintCount = 0
        } else {
          this._sigintCalled = false
          this.delimiter(' ')
          this.submit('')
          this.log('(^C again to quit)')
        }
      }
    }

    process.stdin.on('keypress', (letter, key) => {
      key = key || {}
      if (key.ctrl === true && key.shift === false && key.meta === false && ['c', 'C'].indexOf(key.name) > -1) {
        this._sigintCount++
        if (this._sigint !== undefined && !this._sigintCalled) {
          this._sigintCalled = true
          this._sigint.call(self.parent)
          this._sigintCalled = false
        }
      } else {
        this._sigintCalled = false
        this._sigintCount = 0
      }
    })

    const onSigInt = () => {
      if (typeof this._sigint === 'function' && !this._sigintCalled) {
        this._sigintCalled = true
        this._sigint.call(this.parent)
      }
    }
    process.on('SIGINT', onSigInt)
    process.on('SIGTERM', onSigInt)
  }

  sigint (fn) {
    if (typeof fn === 'function') {
      this._sigint = fn
    } else {
      throw new Error('vorpal.ui.sigint must be passed in a valid function.')
    }
    return this
  }

  prompt (options, cb) {
    let prompt
    options = options || {}
    if (!this.parent) {
      return prompt
    }
    if (options.delimiter) {
      this.setDelimiter(options.delimiter)
    }
    if (options.message) {
      this.setDelimiter(options.message)
    }

    const promptType = options.type || 'input'
    const promptFn = promptMap[promptType] || inquirerInput

    const promptOptions = {
      message: options.message || options.name || 'Prompt',
      default: options.default
    }

    if (promptType === 'select' || promptType === 'checkbox' || promptType === 'expand' || promptType === 'rawlist') {
      promptOptions.choices = options.choices || []
    }

    const p = promptFn(promptOptions)
    p.then((result) => {
      const response = {}
      response[options.name || 'command'] = result
      this._midPrompt = false
      if (this._cancelled) {
        this._cancelled = false
      } else {
        cb(response)
      }
    }).catch((err) => {
      this._midPrompt = false
      if (err && err.message !== 'User force closed the prompt') {
        console.log('Vorpal Prompt error:', err)
      }
    })

    this._midPrompt = true
    return p
  }

  midPrompt () {
    return (this._midPrompt === true && this.parent !== undefined)
  }

  setDelimiter (str) {
    if (!this.parent) {
      return
    }
    str = String(str).trim() + ' '
    this._lastDelimiter = str
  }

  pause () {
    if (!this.parent || !this._activePrompt || !this._midPrompt) {
      return false
    }
    const val = this._lastDelimiter + this._activePrompt.line
    this._midPrompt = false
    if (this._activePrompt && this._activePrompt.rl) {
      this._activePrompt.rl.output.unmute()
      this._activePrompt.rl.close()
    }
    return val
  }

  resume (val) {
    if (!this.parent) {
      return this
    }
    val = val || ''
    if (!this._activePrompt) {
      return this
    }
    if (this._midPrompt) {
      return this
    }
    this._midPrompt = true
    if (this._activePrompt && this._activePrompt.rl) {
      this._activePrompt.rl.write(val)
    }
    return this
  }

  cancel () {
    if (this.midPrompt()) {
      this._cancelled = true
      this.submit('')
      this._midPrompt = false
    }
    return this
  }

  attach (vorpal) {
    this.parent = vorpal
    this.refresh()
    this.parent._prompt()
    return this
  }

  detach (vorpal) {
    if (vorpal === this.parent) {
      this.parent = undefined
    }
    return this
  }

  log (...logArgs) {
    let args = util.fixArgsForApply(logArgs)
    args = (typeof this._pipeFn === 'function')
      ? this._pipeFn(args)
      : args
    if (args === '') {
      return this
    }
    args = util.fixArgsForApply(args)
    if (this.midPrompt()) {
      const data = this.pause()
      console.log.apply(console.log, args)
      if (typeof data !== 'undefined' && data !== false) {
        this.resume(data)
      } else {
        console.log('Log got back \'false\' as data. This shouldn\'t happen.', data)
      }
    } else {
      console.log.apply(console.log, args)
    }
    return this
  }

  submit () {
    if (this._activePrompt && this._activePrompt.rl) {
      this._activePrompt.rl.emit('line')
    }
    return this
  }

  delimiter (str) {
    if (!this._activePrompt) {
      return this
    }
    if (str === undefined) {
      return this._lastDelimiter || ''
    }
    this._lastDelimiter = str
    this.refresh()
    return this
  }

  input (str) {
    if (!this._activePrompt) {
      return undefined
    }
    const rl = this._activePrompt.rl
    if (str === undefined) {
      return rl.line
    }
    rl.line = str
    rl.cursor = str.length
    this.refresh()
    return this
  }

  imprint () {
    if (!this.parent) {
      return this
    }
    const val = this._activePrompt ? this._activePrompt.rl.line : ''
    const delimiter = this._lastDelimiter || this.delimiter() || ''
    this.log(delimiter + val)
    return this
  }

  refresh () {
    if (!this.parent || !this._activePrompt) {
      return this
    }
    this._activePrompt.rl.output.write(this._activePrompt.rl.line)
    return this
  }

  redraw (str) {
    logUpdate(str)
    return this
  }
}

const ui = new UI()

ui.redraw.clear = function () {
  logUpdate.clear()
  return ui
}

ui.redraw.done = function () {
  logUpdate.done()
  ui.refresh()
  return ui
}

// Prevent duplicate UI instances when multiple vorpal instances
// are created in the same process — only one can own the TTY.
global.__vorpal = global.__vorpal || {}
global.__vorpal.ui = global.__vorpal.ui || {
  exists: false,
  instance: undefined
}

if (!global.__vorpal.ui.exists) {
  global.__vorpal.ui.exists = true
  global.__vorpal.ui.instance = ui
}

export default global.__vorpal.ui.instance