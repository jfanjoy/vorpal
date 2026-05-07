/**
 * Example of a Vorpal server that uses a "mode"
 * command to create a simple REPL prompt.
 *
 * A "mode" is a special type of command that
 * brings the vorpal prompt into a specific
 * "mode", wherein the prompt changes, and all
 * commands typed fire the `action` function,
 * passing in the typed string as the first
 * argument instead of parsed action parameters.
 */

import Vorpal from '../../lib/vorpal.js'

const vorpal = new Vorpal()

vorpal
  .mode('repl', 'Enters REPL mode.')
  .delimiter('repl:')
  .init(function (args, cb) {
    this.log('Entering REPL Mode. To exit, type \'exit\'.')
    cb()
  })
  .action(function (command, cb) {
    try {
      // eslint-disable-next-line no-eval
      const res = eval(command)
      const log = (typeof res === 'string') ? res : res
      this.log(log)
      cb(undefined, res)
    } catch (e) {
      this.log(e)
      cb(e)
    }
  })

vorpal
  .delimiter('svr~$')
  .show()
