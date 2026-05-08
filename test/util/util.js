import Vorpal from '../../lib/vorpal.js'
import path from 'node:path'

const instances = []

export default {
  instances,

  spawn (options, cb) {
    options = options || {}
    options = Object.assign({
      ports: [],
      ssl: false
    }, options)

    for (let i = 0; i < options.ports.length; ++i) {
      const vorpal = new Vorpal()
      const port = options.ports[i]
      vorpal
        .delimiter(port + ':')
        .use(path.join(import.meta.dirname, '/server'))
        .listen(port)
      instances.push(vorpal)
    }

    cb(undefined, instances)
  },

  kill (what, cb) {
    cb = cb || function () {}
  }
}
