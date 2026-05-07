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
    // Hook to reference active prompt. The UI can only attach to one Vorpal instance
    // at a time, and directs all events to that instance.
    this._activePrompt = undefined
    // Fail-safe to ensure there is no double prompt in odd situations.
    this._midPrompt = false
    // Whether a prompt is currently in cancel mode.
    this._cancelled = false
    // Middleware for piping stdout through.
    this._pipeFn = undefined

    // Custom function on sigint event — double Ctrl+C to quit.
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

  /** Hook for sigint event. @param {function} fn @return {UI} */
  sigint (fn) {
    if (typeof fn === 'function') {
      this._sigint = fn
    } else {
      throw new Error('vorpal.ui.sigint must be passed in a valid function.')
    }
    return this
  }

  /** Creates an inquirer prompt on the TTY. @param {object} options @param {function} cb */
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

  /** Returns whether user is mid another prompt. @return {boolean} */
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

  /** Pauses active prompt, returning the value of what had been typed so far. @return {string|boolean} */
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

  /** Resumes active prompt, accepting a string which will fill the prompt
   *  with that text and put the cursor at the end. @param {string} val @return {UI} */
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

  /** Cancels the active prompt, essentially cutting out of the prompt loop. @return {UI} */
  cancel () {
    if (this.midPrompt()) {
      this._cancelled = true
      this.submit('')
      this._midPrompt = false
    }
    return this
  }

  /** Attaches TTY prompt to a given Vorpal instance. @param {Vorpal} vorpal @return {UI} */
  attach (vorpal) {
    this.parent = vorpal
    this.refresh()
    this.parent._prompt()
    return this
  }

  /** Detaches UI from a given Vorpal instance. @param {Vorpal} vorpal @return {UI} */
  detach (vorpal) {
    if (vorpal === this.parent) {
      this.parent = undefined
    }
    return this
  }

  /** Receives and runs logging through a piped function if one is provided through ui.pipe().
   *  Pauses any active prompts, logs the data and then if paused, resumes the prompt.
   *  @param {...*} logArgs @return {UI} */
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

  /** Submits a given prompt. @return {UI} */
  submit () {
    if (this._activePrompt && this._activePrompt.rl) {
      this._activePrompt.rl.emit('line')
    }
    return this
  }

  /** Does a literal, one-time write to the current prompt delimiter. @param {string} str @return {UI|string} */
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

  /** Re-writes the input of an Inquirer prompt. If no string is passed,
   *  it gets the current input. @param {string} [str] @return {UI|string} */
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

  /** Logs the current delimiter and typed data. @return {UI} */
  imprint () {
    if (!this.parent) {
      return this
    }
    const val = this._activePrompt ? this._activePrompt.rl.line : ''
    const delimiter = this._lastDelimiter || this.delimiter() || ''
    this.log(delimiter + val)
    return this
  }

  /** Redraws the prompt with a new string. @param {string} str @return {UI} */
  refresh () {
    if (!this.parent || !this._activePrompt) {
      return this
    }
    this._activePrompt.rl.output.write(this._activePrompt.rl.line)
    return this
  }

  /** Writes over existing logging. @param {string} str @return {UI} */
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
// If you start two independent instances of vorpal, you need to know that
// prompt listeners have already been initiated, and that you can only
// attach the tty to one vorpal instance at a time. When you fire two
// prompts, you get a double-prompt, where every keypress fires twice
// and it's just a total mess. Hence the global singleton.
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