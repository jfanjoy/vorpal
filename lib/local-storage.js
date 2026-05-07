import path from 'node:path'
import os from 'node:os'
import Store from './store.js'

const DEFAULT_STORAGE_PATH = path.normalize(path.join(os.tmpdir(), '/.local_storage_'))

export default {
  _localStorage: undefined,

  /** Set the storage id. Initializes a Store instance with a compound path. @param {string} id */
  setId (id) {
    if (id === undefined) {
      throw new Error('vorpal.localStorage() requires a unique key to be passed in.')
    }
    if (!this._localStorage) {
      this._localStorage = new Store(DEFAULT_STORAGE_PATH + id)
    }
  },

  /** Validates that localStorage was initialized before use. */
  validate () {
    if (this._localStorage === undefined) {
      throw new Error('Vorpal.localStorage() was not initialized before writing data.')
    }
  },

  /** Gets an item from storage. @param {string} key @return {*} */
  getItem (key, value) {
    this.validate()
    return this._localStorage.getItem(key, value)
  },

  /** Sets an item in storage. @param {string} key @param {*} value */
  setItem (key, value) {
    this.validate()
    return this._localStorage.setItem(key, value)
  },

  /** Removes an item from storage. @param {string} key */
  removeItem (key) {
    this.validate()
    return this._localStorage.removeItem(key)
  }
}