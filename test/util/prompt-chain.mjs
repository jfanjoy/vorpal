#!/usr/bin/env node
import Vorpal from '../../lib/vorpal.js'

const vorpal = new Vorpal()

vorpal
  .command('test-chain')
  .action(async function () {
    try {
      const answers = await this.prompt([
        { name: 'name', message: 'Name: ' },
        { name: 'host', message: 'Host: ' },
        { name: 'https', message: 'Use TLS: ', type: 'confirm', default: true },
        { name: 'id', message: 'Client ID: ' },
        { name: 'secret', message: 'Secret: ', type: 'password' }
      ])
      process.stdout.write('PROMPT_RESULT=' + JSON.stringify({ keys: Object.keys(answers), answers }) + '\n')
      process.exit(0)
    } catch (err) {
      process.stdout.write('PROMPT_ERROR=' + JSON.stringify({ error: err.message }) + '\n')
      process.exit(1)
    }
  })

vorpal.delimiter('').show()
vorpal.parse(process.argv)
