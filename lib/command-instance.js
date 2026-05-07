import util from './util.js'

class CommandInstance {
  constructor({command, commandObject, args, commandWrapper, callback, downstream} = {}) {
    this.command = command
    this.commandObject = commandObject
    this.args = args
    this.commandWrapper = commandWrapper
    this.session = commandWrapper.session
    this.parent = this.session.parent
    this.callback = callback
    this.downstream = downstream
  }

  cancel() {
    this.session.emit('vorpal_command_cancel')
  }

  log (...logArgs) {
    const args = util.fixArgsForApply(logArgs)
    if (this.downstream) {
      const fn = this.downstream.commandObject._fn || function () {}
      this.session.registerCommand()
      this.downstream.args.stdin = args
      const onComplete = (err) => {
        if (this.session.isLocal() && err) {
          this.session.log(err.stack || err)
          this.session.parent.emit('client_command_error', {command: this.downstream.command, error: err})
        }
        this.session.completeCommand()
      }

      const validate = this.downstream.commandObject._validate
      if (typeof validate === 'function') {
        try {
          validate.call(this.downstream, this.downstream.args)
        } catch (e) {
          this.session.log(e.toString())
          onComplete()
          return
        }
      }

      const res = fn.call(this.downstream, this.downstream.args, onComplete)
      if (res && typeof res.then === 'function') {
        res.then(onComplete, onComplete)
      }
    } else {
      this.session.log.apply(this.session, args)
    }
  }

  prompt(a, b, c) {
    return this.session.prompt(a, b, c)
  }

  delimiter(a, b, c) {
    return this.session.delimiter(a, b, c)
  }

  help(a, b, c) {
    return this.session.help(a, b, c)
  }

  match(a, b, c) {
    return this.session.match(a, b, c)
  }
}

export default CommandInstance