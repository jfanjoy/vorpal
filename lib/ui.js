import EventEmitter from 'node:events'
import readline from 'node:readline'
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

// Enable keypress events on stdin so our keypress listener fires.
// Only do this when stdin is a real TTY — in piped/test environments
// emitKeypressEvents adds a data listener that refs stdin, preventing
// the event loop from draining.
if (process.stdin.isTTY) {
  readline.emitKeypressEvents(process.stdin)
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

    // Single keypress listener handles both sigint and UI keypress dispatch.
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
        // Forward non-sigint keypresses to _activePrompt lifecycle and vorpal event system.
        if (this._activePrompt && this._midPrompt && this.parent) {
          this._onKeypress(key, letter)
        }
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

  /** Handles keypress events for the active REPL prompt.
   *  Strips tab characters, syncs _activePrompt.line/cursor with rl,
   *  and emits 'vorpal_ui_keypress' so vorpal can drive autocomplete etc.
   *  @param {object} key @param {string} letter */
  _onKeypress (key, letter) {
    const ap = this._activePrompt
    if (!ap) { return }
    const rl = ap.rl

    // Sync our shadow line/cursor with the actual readline state.
    // node:readline updates rl.line and rl.cursor before the keypress
    // event fires, so at this point they reflect the state *after* the
    // key was processed.
    if (rl) {
      ap.line = rl.line || ''
      ap.cursor = rl.cursor || 0
    }

    // Strip tab characters from input — tabs are handled by autocomplete,
    // not inserted as literal characters.
    if (ap.line && ap.line.indexOf('\t') > -1) {
      ap.line = ap.line.replace(/\t+/g, '')
      if (rl) {
        rl.line = ap.line
        rl.cursor = ap.line.length
      }
      // Redraw the line without the tab.
      this.refresh()
    }

    // Emit the keypress event upstream so vorpal._onKeypress can handle
    // tab completion and up/down history.
    const value = (ap._type !== 'password')
      ? String(ap.line)
      : '*'.repeat(String(ap.line).length)
    this.emit('vorpal_ui_keypress', { key: (key || {}).name, value, e: { key, letter } })
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

  /** Sets the active prompt to a readline interface.
   *  @param {readline.Interface} rl @param {object} [opts] @return {UI} */
  _setActivePrompt (rl, opts) {
    opts = opts || {}
    this._activePrompt = {
      rl,
      // Shadow copies so consumers can read _activePrompt.line/cursor
      // even when rl isn't available (e.g. inquirer-managed prompts).
      line: (rl && rl.line) || '',
      cursor: (rl && rl.cursor) || 0,
      _type: opts.type || 'repl'
    }
    return this
  }

  /** Clears the active prompt reference. @return {UI} */
  _clearActivePrompt () {
    if (this._activePrompt && this._activePrompt.rl && !this._activePrompt.rl.closed) {
      this._activePrompt.rl.close()
    }
    this._activePrompt = undefined
    this._midPrompt = false
    return this
  }

  /** Creates a prompt on the TTY.
   *  For REPL-type prompts (type 'input' with no choices), uses node:readline directly
   *  so we own the readline interface and can set _activePrompt.
   *  For other prompt types, delegates to @inquirer/prompts.
   *  @param {object} options @param {function} cb */
  prompt (options, cb) {
    options = options || {}
    if (!this.parent) {
      return undefined
    }
    if (options.delimiter) {
      this.setDelimiter(options.delimiter)
    }
    if (options.message) {
      this.setDelimiter(options.message)
    }

    const promptType = options.type || 'input'
    const isReplPrompt = (promptType === 'input' || promptType === 'repl') &&
      !options.choices && !options.validate

    if (isReplPrompt) {
      return this._replPrompt(options, cb)
    }

    const promptFn = promptMap[promptType] || inquirerInput

    const promptOptions = {
      message: options.message || options.name || 'Prompt',
      default: options.default
    }

    // validate() => false compatibility shim: vorpal-less and similar plugins
    // use a prompt with validate() that returns false to intercept the Enter
    // key and keep the prompt open. @inquirer/prompts treats false as an
    // error and shows an error message, so we map false to ' ' (a single
    // space) which is invisible but keeps the prompt open.
    if (options.validate) {
      const originalValidate = options.validate
      promptOptions.validate = async (value) => {
        const result = originalValidate(value)
        return result === false ? ' ' : result
      }
    }

    if (promptType === 'select' || promptType === 'checkbox' || promptType === 'expand' || promptType === 'rawlist') {
      promptOptions.choices = options.choices || []
    }

    this._midPrompt = true

    // For non-REPL prompts we don't own the readline interface, but we still
    // set _activePrompt with a stub rl so that imprint/submit/delimiter etc.
    // can work during the prompt's lifetime (important for the validate-trick
    // used by vorpal-less). The rl is null — callers that need actual cursor
    // position or line content should check for rl first.
    this._setActivePrompt(null, { type: promptType })

    const p = promptFn(promptOptions)
    p.then((result) => {
      const response = {}
      response[options.name || 'command'] = result
      this._clearActivePrompt()
      if (this._cancelled) {
        this._cancelled = false
      } else {
        cb(response)
      }
    }).catch((err) => {
      this._clearActivePrompt()
      if (err && err.message !== 'User force closed the prompt') {
        console.log('Vorpal Prompt error:', err)
      }
    })

    return p
  }

  /** Creates a readline-based prompt for the REPL loop.
   *  Owns the readline interface so we can set _activePrompt and drive
   *  sigint/autocomplete/submission through it.
   *  @param {object} options @param {function} cb @return {Promise} */
  _replPrompt (options, cb) {
    const self = this
    const message = options.message || options.name || 'Prompt'

    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
      prompt: message + ' ',
      historySize: 0
    })

    this._setActivePrompt(rl, { type: 'repl' })
    this._midPrompt = true

    rl.on('line', (line) => {
      if (!self._activePrompt || self._activePrompt.rl !== rl) {
        return
      }
      self._activePrompt.line = line
      self._activePrompt.cursor = line.length
      const response = {}
      response[options.name || 'command'] = line
      self._clearActivePrompt()
      cb(response)
    })

    rl.on('close', () => {
      if (self._activePrompt && self._activePrompt.rl === rl) {
        self._clearActivePrompt()
      }
    })

    rl.prompt()

    return Promise.resolve()
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
    const ap = this._activePrompt
    const rl = ap.rl
    const line = (rl && rl.line) || ap.line || ''
    const val = this._lastDelimiter + line
    this._midPrompt = false
    if (rl && !rl.closed) {
      rl.output.unmute && rl.output.unmute()
      rl.pause()
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
    const ap = this._activePrompt
    const rl = ap.rl
    if (rl && !rl.closed) {
      rl.resume()
      const inputVal = val.replace(this._lastDelimiter, '')
      if (inputVal) {
        rl.write(null, { name: 'backspace' })
        rl.write(inputVal)
      }
      ap.line = rl.line || ''
      ap.cursor = rl.cursor || 0
    }
    return this
  }

  /** Cancels the active prompt, essentially cutting out of the prompt loop. @return {UI} */
  cancel () {
    if (this.midPrompt()) {
      this._cancelled = true
      this._midPrompt = false
      if (this._activePrompt && this._activePrompt.rl && !this._activePrompt.rl.closed) {
        this._activePrompt.rl.close()
      }
      this._clearActivePrompt()
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

  /** Submits a given prompt.
   *  Emits 'line' on the readline interface with the current input,
   *  which triggers the rl 'line' handler in _replPrompt.
   *  @param {string} [str] @return {UI} */
  submit (str) {
    if (!this._activePrompt) {
      return this
    }
    const rl = this._activePrompt.rl
    if (rl && !rl.closed) {
      if (str !== undefined) {
        rl.line = str
        rl.cursor = str.length
        this._activePrompt.line = str
        this._activePrompt.cursor = str.length
      }
      rl.emit('line', rl.line || '')
    }
    return this
  }

  /** Does a literal, one-time write to the current prompt delimiter.
   *  @param {string} str @return {UI|string} */
  delimiter (str) {
    if (str === undefined) {
      return this._lastDelimiter || ''
    }
    this._lastDelimiter = str
    if (this._activePrompt) {
      this.refresh()
    }
    return this
  }

  /** Re-writes the input of an Inquirer prompt. If no string is passed,
   *  it gets the current input. @param {string} [str] @return {UI|string} */
  input (str) {
    if (!this._activePrompt) {
      return undefined
    }
    const ap = this._activePrompt
    const rl = ap.rl
    if (str === undefined) {
      return (rl && rl.line) || ap.line || ''
    }
    if (rl && !rl.closed) {
      rl.line = str
      rl.cursor = str.length
    }
    ap.line = str
    ap.cursor = str.length
    this.refresh()
    return this
  }

  /** Logs the current delimiter and typed data. @return {UI} */
  imprint () {
    if (!this.parent) {
      return this
    }
    // Use shadow copies so this works even for inquirer-managed prompts
    // that don't expose a readline interface to us.
    const val = this._activePrompt ? (this._activePrompt.line || '') : ''
    const delimiter = this._lastDelimiter || this.delimiter() || ''
    this.log(delimiter + val)
    return this
  }

  /** Redraws the prompt with current delimiter and input.
   *  Clears the current line and rewrites it so the display stays in sync
   *  after programmatic changes to the prompt state.
   *  @return {UI} */
  refresh () {
    if (!this.parent || !this._activePrompt) {
      return this
    }
    const ap = this._activePrompt
    const rl = ap.rl
    if (rl && !rl.closed && rl.output && rl.output.isTTY) {
      // Erase current line: move to beginning, clear to end.
      rl.output.write('\x1b[2K\r')
      // Re-prompt: this writes the delimiter + current line content.
      rl.prompt(true)
    }
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
