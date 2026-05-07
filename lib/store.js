import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const DEFAULT_BASE_PATH = path.normalize(path.join(os.tmpdir(), '/.vorpal_storage'))

export default class Store {
  #basePath
  #data = {}

  constructor (customPath) {
    this.#basePath = customPath || DEFAULT_BASE_PATH
    this.#load()
  }

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

  getItem (key) {
    return this.#data[key] !== undefined ? this.#data[key] : null
  }

  setItem (key, value) {
    this.#data[key] = value
    this.#persist()
  }

  removeItem (key) {
    delete this.#data[key]
    this.#persist()
  }
}