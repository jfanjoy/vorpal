import path from 'node:path'
import os from 'node:os'
import Store from './store.js'

// Number of command histories kept in persistent storage
const HISTORY_SIZE = 500
const temp = path.normalize(path.join(os.tmpdir(), '/.local_storage'))

export default class History {
  // History counter moves based on number of times 'up' (+= ctr) or 'down' (-= ctr) was pressed.
  #storageKey
  #localStorage
  #hist = []
  #histCtr = 0
  // When in a 'mode', we reset the history and store it in a cache until
  // exiting the 'mode', at which point we resume the original history.
  #histCache = []
  #histCtrCache = 0
  #inMode = false

  /** Set id for this history instance. Calls _init internally. @param {string} id */
  setId (id) {
    if (!this.#storageKey) {
      // Initialize a localStorage instance with default path if not initialized
      this.#localStorage = new Store(temp + id)
    }
    this.#storageKey = 'cmd_history_' + id
    this._init()
  }

  /** Initialize the history with local storage data. Called from setId when history id is set. */
  _init () {
    if (!this.#storageKey) {
      return
    }

    // Load history from local storage
    const persistedHistory = JSON.parse(this.#localStorage.getItem(this.#storageKey))
    if (Array.isArray(persistedHistory)) {
      this.#hist.push(...persistedHistory)
    }
  }

  /** Initialize a local storage instance with the path if not already initialized. @param {string} storagePath */
  setStoragePath (storagePath) {
    if (!this.#localStorage) {
      this.#localStorage = new Store(storagePath)
    }
  }

  /** Get previous history. Called when up is pressed. @return {string|undefined} */
  getPreviousHistory () {
    this.#histCtr++
    this.#histCtr = (this.#histCtr > this.#hist.length) ?
      this.#hist.length :
      this.#histCtr
    return this.#hist[this.#hist.length - (this.#histCtr)]
  }

  /** Get next history. Called when down is pressed. @return {string} */
  getNextHistory () {
    this.#histCtr--

    // Return empty prompt if we don't have any history to show
    if (this.#histCtr < 1) {
      this.#histCtr = 0
      return ''
    }

    return this.#hist[this.#hist.length - this.#histCtr]
  }

  /** Peek into history, without changing state. @param {number} [depth] @return {string|undefined} */
  peek (depth) {
    depth = depth || 0
    return this.#hist[this.#hist.length - 1 - depth]
  }

  /** A new command was submitted. Called when enter is pressed and the prompt is not empty.
   *  @param {string} cmd */
  newCommand (cmd) {
    // Always reset history when new command is executed.
    this.#histCtr = 0

    // Don't store command in history if it's a duplicate.
    if (this.#hist[this.#hist.length - 1] === cmd) {
      return
    }

    // Push into history.
    this.#hist.push(cmd)

    // Only persist history when not in mode
    if (this.#storageKey && !this.#inMode) {
      let persistedHistory = this.#hist
      const historyLen = this.#hist.length
      if (historyLen > HISTORY_SIZE) {
        persistedHistory = this.#hist.slice(historyLen - HISTORY_SIZE - 1, historyLen - 1)
      }

      // Add to local storage
      this.#localStorage.setItem(this.#storageKey, JSON.stringify(persistedHistory))
    }
  }

  /** Called when entering a mode. Saves current history state to a cache
   *  and replaces it with a blank history for the mode. */
  enterMode () {
    // Reassign the command history to a cache, replacing it with a blank history for the mode.
    this.#histCache = [...this.#hist]
    this.#histCtrCache = parseFloat(this.#histCtr)
    this.#hist = []
    this.#histCtr = 0
    this.#inMode = true
  }

  /** Called when exiting a mode. Restores the original history. */
  exitMode () {
    this.#hist = this.#histCache
    this.#histCtr = this.#histCtrCache
    this.#histCache = []
    this.#histCtrCache = 0
    this.#inMode = false
  }

  /** Clears the command history. */
  clear () {
    if (this.#storageKey) {
      this.#localStorage.removeItem(this.#storageKey)
    }
  }
}