import path from 'node:path'
import os from 'node:os'
import Store from './store.js'

const HISTORY_SIZE = 500
const temp = path.normalize(path.join(os.tmpdir(), '/.local_storage'))

export default class History {
  #storageKey
  #localStorage
  #hist = []
  #histCtr = 0
  #histCache = []
  #histCtrCache = 0
  #inMode = false

  setId (id) {
    if (!this.#storageKey) {
      this.#localStorage = new Store(temp + id)
    }
    this.#storageKey = 'cmd_history_' + id
    this._init()
  }

  _init () {
    if (!this.#storageKey) {
      return
    }

    const persistedHistory = JSON.parse(this.#localStorage.getItem(this.#storageKey))
    if (Array.isArray(persistedHistory)) {
      this.#hist.push(...persistedHistory)
    }
  }

  setStoragePath (storagePath) {
    if (!this.#localStorage) {
      this.#localStorage = new Store(storagePath)
    }
  }

  getPreviousHistory () {
    this.#histCtr++
    this.#histCtr = (this.#histCtr > this.#hist.length) ?
      this.#hist.length :
      this.#histCtr
    return this.#hist[this.#hist.length - (this.#histCtr)]
  }

  getNextHistory () {
    this.#histCtr--

    if (this.#histCtr < 1) {
      this.#histCtr = 0
      return ''
    }

    return this.#hist[this.#hist.length - this.#histCtr]
  }

  peek (depth) {
    depth = depth || 0
    return this.#hist[this.#hist.length - 1 - depth]
  }

  newCommand (cmd) {
    this.#histCtr = 0

    if (this.#hist[this.#hist.length - 1] === cmd) {
      return
    }

    this.#hist.push(cmd)

    if (this.#storageKey && !this.#inMode) {
      let persistedHistory = this.#hist
      const historyLen = this.#hist.length
      if (historyLen > HISTORY_SIZE) {
        persistedHistory = this.#hist.slice(historyLen - HISTORY_SIZE - 1, historyLen - 1)
      }

      this.#localStorage.setItem(this.#storageKey, JSON.stringify(persistedHistory))
    }
  }

  enterMode () {
    this.#histCache = [...this.#hist]
    this.#histCtrCache = parseFloat(this.#histCtr)
    this.#hist = []
    this.#histCtr = 0
    this.#inMode = true
  }

  exitMode () {
    this.#hist = this.#histCache
    this.#histCtr = this.#histCtrCache
    this.#histCache = []
    this.#histCtrCache = 0
    this.#inMode = false
  }

  clear () {
    if (this.#storageKey) {
      this.#localStorage.removeItem(this.#storageKey)
    }
  }
}