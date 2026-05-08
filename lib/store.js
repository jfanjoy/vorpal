import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DEFAULT_BASE_PATH = path.normalize(path.join(os.tmpdir(), '/.vorpal_storage'))

/** File-backed key-value store with atomic writes via temp file + rename.
 *  Data is persisted as JSON. Operations are best-effort - errors are silently caught. */
export default class Store {
  #basePath
  #data = {}

  /** @param {string} [customPath] - Path to the store file or directory */
  constructor (customPath) {
    this.#basePath = customPath || DEFAULT_BASE_PATH
    this.#load()
  }

  /** Loads data from disk. Handles both file paths and directory+data.json paths. Silent on error. */
  #load () {
    try {
      if (fs.existsSync(this.#basePath)) {
        const stat = fs.statSync(this.#basePath)
        if (stat.isDirectory()) {
          const dataFile = path.join(this.#basePath, 'data.json')
          if (fs.existsSync(dataFile)) {
            this.#data = JSON.parse(fs.readFileSync(dataFile, 'utf8'))
          }
        } else {
          this.#data = JSON.parse(fs.readFileSync(this.#basePath, 'utf8'))
        }
      }
    } catch {
      this.#data = {}
    }
  }

  /** Persists data to disk via atomic write (tmp file + rename). Auto-creates parent directory. */
  #persist () {
    try {
      const dir = path.dirname(this.#basePath)
      const isDir = fs.existsSync(this.#basePath) && fs.statSync(this.#basePath).isDirectory()
      const dataFile = isDir ? path.join(this.#basePath, 'data.json') : this.#basePath
      const tmpFile = dataFile + '.tmp'

      if (!isDir && !fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true })
      }

      fs.writeFileSync(tmpFile, JSON.stringify(this.#data), 'utf8')
      fs.renameSync(tmpFile, dataFile)
    } catch {
      // silently fail - storage is best-effort
    }
  }

  /** Gets an item from the store. @param {string} key @return {*|null} */
  getItem (key) {
    return this.#data[key] !== undefined ? this.#data[key] : null
  }

  /** Sets an item in the store and persists. @param {string} key @param {*} value */
  setItem (key, value) {
    this.#data[key] = value
    this.#persist()
  }

  /** Removes an item from the store and persists. @param {string} key */
  removeItem (key) {
    delete this.#data[key]
    this.#persist()
  }
}
