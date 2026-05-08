/** Function library for Vorpal's out-of-the-box API commands.
 *  Imported into a Vorpal server through vorpal.use(module). */
export default function (vorpal) {
  /** Help command - shows help for a given command or lists all commands. */
  vorpal
    .command('help [command...]')
    .description('Provides help for a given command.')
    .action(function (args, cb) {
      const self = this
      if (args.command) {
        args.command = args.command.join(' ')
        const name = this.parent.commands.find(c => c._name === String(args.command).trim())
        if (name && !name._hidden) {
          if (typeof name._help === 'function') {
            name._help(args.command, function (str) {
              self.log(str)
              cb()
            })
            return
          }
          this.log(name.helpInformation())
        } else {
          this.log(this.parent._commandHelp(args.command))
        }
      } else {
        this.log(this.parent._commandHelp(args.command))
      }
      cb()
    })

  /** Exit command - exits Vorpal. */
  vorpal
    .command('exit')
    .alias('quit')
    .description('Exits application.')
    .action(function (args) {
      args.options = args.options || {}
      args.options.sessionId = this.session.id
      this.parent.exit(args.options)
    })
}
