import Vorpal from '../../lib/vorpal.js'

const vorpal = new Vorpal()

vorpal.command('login', 'Login (u: root p: vorpal)')
  .action(function (args, cb) {
    const self = this

    this.prompt([
      {
        type: 'input',
        name: 'username',
        message: 'Username: '
      },
      {
        type: 'password',
        name: 'password',
        message: 'Password: '
      }
    ]).then(function (answers) {
      if (answers.username === 'root' && answers.password === 'vorpal') {
        self.log('Successful login.')
      } else {
        self.log('Login failed! Try username "root" and password "vorpal"!')
      }
      cb()
    })
  })

vorpal
  .show()
  .parse(process.argv)
