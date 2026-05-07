import Vorpal from '../lib/vorpal.js'
import assert from 'node:assert/strict'
import intercept from '../lib/intercept.js'
import fs from 'node:fs'
import commands from './util/server.js'

let _all = ''
let _stdout = ''

const onStdout = function (str) {
  _stdout += str
  _all += str
  return ''
}

function getStdout () {
  const out = _stdout
  _stdout = ''
  return String(out || '')
}

const vorpal = new Vorpal()

describe('integration tests:', function () {
  describe('vorpal', function () {
    it('should overwrite duplicate commands', function (done) {
      const arr = ['a', 'b', 'c']
      arr.forEach(function (item) {
        vorpal
          .command('overwritten', 'This command gets overwritten.')
          .action(function (args, cb) {
            cb(undefined, item)
          })
        vorpal
          .command('overwrite me')
          .action(function (args, cb) {
            cb(undefined, item)
          })
      })

      vorpal.exec('overwritten', function (err, data) {
        assert.equal(err, undefined)
        assert.equal(data, 'c')
        vorpal.exec('overwrite me', function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data, 'c')
          done()
        })
      })
    })

    it('should register and execute aliases', function (done) {
      vorpal
        .command('i go by other names', 'This command has many aliases.')
        .alias('donald trump')
        .alias('sinterclaus', ['linus torvalds', 'nan nan nan nan nan nan nan watman!'])
        .action(function (args, cb) {
          cb(undefined, 'You have found me.')
        })

      let ctr = 0
      const arr = ['donald trump', 'sinterclaus', 'linus torvalds', 'nan nan nan nan nan nan nan watman!']
      function go () {
        if (arr[ctr]) {
          vorpal.exec(arr[ctr], function (err, data) {
            assert.equal(err, undefined)
            assert.equal(data, 'You have found me.')
            ctr++
            if (!arr[ctr]) {
              done()
            } else {
              go()
            }
          })
        }
      }
      go()
    })

    it('should fail on duplicate alias', function (done) {
      assert.throws(function () {
        vorpal
          .command('This command should crash!', 'Any moment now...')
          .alias('Oh no!')
          .alias('Here it comes!')
          .alias('Oh no!')
      }, Error)
      done()
    })

    it('should validate arguments', function (done) {
      const errorThrown = new Error('Invalid Argument')
      vorpal
        .command('validate-me [arg]', 'This command only allows argument "valid"')
        .validate(function (args) {
          this.checkInstance = 'this is the instance'
          if (!args || args.arg !== 'valid') {
            throw errorThrown
          }
        })
        .action(function (args, cb) {
          assert.equal(this.checkInstance, 'this is the instance')
          cb()
        })

      vorpal.exec('validate-me valid', function (err) {
        assert.equal(err, undefined)
        vorpal.exec('validate-me invalid', function (err) {
          assert.equal(err, errorThrown)
          done()
        })
      })
    })
  })

  describe('vorpal execution', function () {
    before('preparation', function () {
      vorpal.pipe(onStdout).use(commands)
    })

    afterEach(function () {
      _all += getStdout()
    })

    const exec = function (cmd, done, cb) {
      vorpal.exec(cmd).then(function (data) {
        cb(undefined, data)
      }).catch(function (err) {
        console.log(err)
        done(err)
      })
    }

    describe('promise execution', function () {
      it('should not fail', function (done) {
        vorpal.exec('fail me not').then(function () {
          assert.ok(true)
          done()
        }).catch(function (err) {
          console.log(getStdout())
          console.log(err.stack)
          assert.ok(false)
          done(err)
        })
      })

      it('should fail', function (done) {
        vorpal.exec('fail me yes').then(function () {
          assert.ok(false)
          done()
        }).catch(function () {
          assert.ok(true)
          done()
        })
      })
    })

    describe('command execution', function () {
      it('should execute a simple command', function (done) {
        exec('fuzzy', done, function (err) {
          assert.equal(getStdout(), 'wuzzy')
          done(err)
        })
      })

      it('should execute help', function (done) {
        exec('help', done, function (err) {
          assert.ok(String(getStdout()).toLowerCase().includes('help'))
          done(err)
        })
      })

      it('should chain two async commands', function (done) {
        vorpal.exec('foo').then(function () {
          assert.equal(getStdout(), 'bar')
          return vorpal.exec('fuzzy')
        }).then(function () {
          assert.equal(getStdout(), 'wuzzy')
          done()
        }).catch(function (err) {
          assert.equal(err, undefined)
          done(err)
        })
      })

      it('should execute a two-word-deep command', function (done) {
        exec('deep command arg', done, function (err) {
          assert.equal(getStdout(), 'arg')
          done(err)
        })
      })

      it('should execute a three-word-deep command', function (done) {
        exec('very deep command arg', done, function (err) {
          assert.equal(getStdout(), 'arg')
          done(err)
        })
      })
    })

    describe('synchronous execution', function () {
      it('should execute a sync command', function () {
        const result = vorpal.execSync('sync')
        assert.equal(result, 'no args were passed')
      })

      it('should execute a sync command with args', function () {
        const result = vorpal.execSync('sync foobar')
        assert.equal(result, 'you said foobar')
      })

      it('should fail silently', function () {
        const result = vorpal.execSync('sync throwme')
        assert.equal(result.message, 'You said so...')
      })

      it('should fail loudly if you tell it to', function () {
        assert.throws(function () {
          vorpal.execSync('sync throwme', { fatal: true })
        })
      })
    })

    describe('.command.help', function () {
      it('should execute a custom help command.', function (done) {
        exec('custom-help --help', done, function (err) {
          assert.ok(String(getStdout()).includes('This is a custom help output.'))
          done(err)
        })
      })
    })

    describe('.command.parse', function () {
      it('should add on details to an existing command.', function (done) {
        exec('parse me in-reverse', done, function (err) {
          assert.ok(String(getStdout()).includes('esrever-ni'))
          done(err)
        })
      })
    })

    describe('piped commands', function () {
      it('should execute a piped command', function (done) {
        exec('say cheese | reverse', done, function () {
          assert.equal(getStdout(), 'eseehc')
          done()
        })
      })

      it('should execute a piped command with double quoted pipe character', function (done) {
        exec('say "cheese|meat" | reverse', done, function () {
          assert.equal(getStdout(), 'taem|eseehc')
          done()
        })
      })

      it('should execute a piped command with single quoted pipe character', function (done) {
        exec("say 'cheese|meat' | reverse", done, function () {
          assert.equal(getStdout(), 'taem|eseehc')
          done()
        })
      })

      it('should execute a piped command with angle quoted pipe character', function (done) {
        exec('say `cheese|meat` | reverse', done, function () {
          assert.equal(getStdout(), 'taem|eseehc')
          done()
        })
      })

      it('should execute multiple piped commands', function (done) {
        exec('say donut | reverse | reverse | array', done, function () {
          assert.equal(getStdout(), 'd,o,n,u,t')
          done()
        })
      })
    })

    describe('command parsing and validation', function () {
      it('should parse double quoted command option', function (done) {
        exec("say \"Vorpal's command parsing is great\"", done, function () {
          assert.equal(getStdout(), "Vorpal's command parsing is great")
          done()
        })
      })

      it('should parse single quoted command option', function (done) {
        exec("say 'My name is \"Vorpal\"', done", done, function () {
          assert.equal(getStdout(), 'My name is "Vorpal"')
          done()
        })
      })

      it('should parse angle quoted command option', function (done) {
        exec("say `He's \"Vorpal\"`, done", done, function () {
          assert.equal(getStdout(), "He's \"Vorpal\"")
          done()
        })
      })

      it('should parse double quotes pipe character in command argument', function (done) {
        exec('say "(vorpal|Vorpal)", done', done, function () {
          assert.equal(getStdout(), '(vorpal|Vorpal)')
          done()
        })
      })

      it('should parse single quoted pipe character in command argument', function (done) {
        exec("say '(vorpal|Vorpal)', done", done, function () {
          assert.equal(getStdout(), '(vorpal|Vorpal)')
          done()
        })
      })

      it('should parse angle quoted pipe character in command argument', function (done) {
        exec('say `(vorpal|Vorpal)`, done', done, function () {
          assert.equal(getStdout(), '(vorpal|Vorpal)')
          done()
        })
      })

      it('should execute a command when not passed an optional variable', function (done) {
        exec('optional', done, function () {
          assert.equal(getStdout(), '')
          done()
        })
      })

      it('should understand --no-xxx options', function (done) {
        exec('i want --no-cheese', done, function () {
          assert.equal(getStdout(), 'false')
          done()
        })
      })

      it('should parse hyphenated options', function (done) {
        exec('hyphenated-option --dry-run', done, function () {
          assert.equal(getStdout(), 'true')
          done()
        })
      })

      it('should use util.parseArgs through the .types() method', function (done) {
        exec('typehappy --numberify 4 -s 5', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.options.numberify, 4)
          assert.equal(data.options.stringify, '5')
          done()
        })
      })

      it('should ignore variadic arguments when not warranted', function (done) {
        exec('required something with extra something', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.arg, 'something')
          done()
        })
      })

      it('should receive variadic arguments as array', function (done) {
        exec('variadic pepperoni olives pineapple anchovies', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.pizza, 'pepperoni')
          assert.equal(data.ingredients[0], 'olives')
          assert.equal(data.ingredients[1], 'pineapple')
          assert.equal(data.ingredients[2], 'anchovies')
          done()
        })
      })

      it('should receive variadic arguments as array when quoted', function (done) {
        exec('variadic "pepperoni" \'olives\' `pineapple` anchovies', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.pizza, 'pepperoni')
          assert.equal(data.ingredients[0], 'olives')
          assert.equal(data.ingredients[1], 'pineapple')
          assert.equal(data.ingredients[2], 'anchovies')
          done()
        })
      })

      it('should accept variadic args as the first arg', function (done) {
        exec('variadic-pizza olives pineapple anchovies', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.ingredients[0], 'olives')
          assert.equal(data.ingredients[1], 'pineapple')
          assert.equal(data.ingredients[2], 'anchovies')
          done()
        })
      })

      it('should parse variadic arguments properly with falsy values (variadic last)', function (done) {
        exec('variadic pepperoni 0 1 olives ', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.pizza, 'pepperoni')
          assert.equal(data.ingredients[0], 0)
          assert.equal(data.ingredients[1], 1)
          assert.equal(data.ingredients[2], 'olives')
          done()
        })
      })

      it('should parse variadic arguments properly with falsy values (variadic only)', function (done) {
        exec('variadic-pizza 0 1 olives ', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.ingredients[0], 0)
          assert.equal(data.ingredients[1], 1)
          assert.equal(data.ingredients[2], 'olives')
          done()
        })
      })

      it('should accept a lot of arguments', function (done) {
        exec('cmd that has a ton of arguments', done, function (err, data) {
          assert.equal(err, undefined)
          assert.equal(data.with, 'that')
          assert.equal(data.one, 'has')
          assert.equal(data.million, 'a')
          assert.equal(data.arguments, 'ton')
          assert.equal(data.in, 'of')
          assert.equal(data.it, 'arguments')
          done()
        })
      })

      it('should show help when not passed a required variable', function (done) {
        exec('required', done, function () {
          assert.ok(getStdout().indexOf('Missing required argument') > -1)
          done()
        })
      })

      it('should show help when passed an unknown option', function (done) {
        exec('unknown-option --unknown-opt', done, function () {
          assert.ok(getStdout().indexOf('Invalid option') > -1)
          done()
        })
      })

      it('should execute a command when passed a required variable', function (done) {
        exec('required foobar', done, function () {
          assert.equal(getStdout(), 'foobar')
          done()
        })
      })

      it('should show help when passed an invalid command', function (done) {
        exec('gooblediguck', done, function () {
          assert.ok(getStdout().indexOf('Invalid Command. Showing Help:') > -1)
          done()
        })
      })
    })

    describe('mode', function () {
      it('should enter REPL mode', function (done) {
        vorpal.exec('repl').then(function () {
          assert.ok(getStdout().includes('Entering REPL Mode'))
          done()
        }).catch(function (err) {
          done(err)
        })
      })

      it('should execute arbitrary JS', function (done) {
        vorpal.exec('3*9').then(function (data) {
          assert.equal(parseFloat(data) || '', 27)
          assert.equal(parseFloat(getStdout()), 27)
          done()
        }).catch(function (err) {
          done(err)
        })
      })

      it('should exit REPL mode properly', function (done) {
        vorpal.exec('exit').then(function () {
          getStdout()
          return vorpal.exec('help')
        }).then(function () {
          assert.ok(getStdout().includes('exit'))
          done()
        }).catch(function (err) {
          done(err)
        })
      })
    })

    describe('history', function () {
      let vorpalHistory
      const UNIT_TEST_STORAGE_PATH = './.unit_test_cmd_history'
      before(function () {
        vorpalHistory = new Vorpal()
        vorpalHistory.historyStoragePath(UNIT_TEST_STORAGE_PATH)
        vorpalHistory.history('unit_test')
        vorpalHistory.exec('command1')
        vorpalHistory.exec('command2')
      })

      after(function () {
        vorpalHistory.cmdHistory.clear()
        try {
          fs.rmSync(UNIT_TEST_STORAGE_PATH, { recursive: true })
        } catch {}
      })

      it('should be able to get history', function () {
        assert.equal(vorpalHistory.session.getHistory('up'), 'command2')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command1')
        assert.equal(vorpalHistory.session.getHistory('down'), 'command2')
        assert.equal(vorpalHistory.session.getHistory('down'), '')
      })

      it('should keep separate history for mode', function () {
        vorpalHistory.cmdHistory.enterMode()
        vorpalHistory.exec('command3')

        assert.equal(vorpalHistory.session.getHistory('up'), 'command3')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command3')
        assert.equal(vorpalHistory.session.getHistory('down'), '')

        vorpalHistory.cmdHistory.exitMode()

        assert.equal(vorpalHistory.session.getHistory('up'), 'command2')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command1')
        assert.equal(vorpalHistory.session.getHistory('down'), 'command2')
        assert.equal(vorpalHistory.session.getHistory('down'), '')
      })

      it('should persist history', function () {
        const vorpalHistory2 = new Vorpal()
        vorpalHistory2.historyStoragePath(UNIT_TEST_STORAGE_PATH)
        vorpalHistory2.history('unit_test')
        assert.equal(vorpalHistory2.session.getHistory('up'), 'command2')
        assert.equal(vorpalHistory2.session.getHistory('up'), 'command1')
        assert.equal(vorpalHistory2.session.getHistory('down'), 'command2')
        assert.equal(vorpalHistory2.session.getHistory('down'), '')
      })

      it('should ignore consecutive duplicates', function () {
        vorpalHistory.exec('command2')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command2')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command1')
        assert.equal(vorpalHistory.session.getHistory('down'), 'command2')
        assert.equal(vorpalHistory.session.getHistory('down'), '')
      })

      it('should always return last executed command immediately after', function () {
        vorpalHistory.exec('command1')
        vorpalHistory.exec('command2')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command2')
        vorpalHistory.exec('command2')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command2')
        assert.equal(vorpalHistory.session.getHistory('up'), 'command1')
      })
    })

    describe('cancel', function () {
      it('should be able to call cancel in action', function (done) {
        vorpal
          .command('SelfCancel', 'This command cancels itself.')
          .action(function () {
            this.cancel()
          })
          .cancel(function () {
            assert.ok(true)
            done()
          })

        vorpal.exec('SelfCancel')
      })

      it('should handle event client_command_cancelled', function (done) {
        vorpal.on('client_command_cancelled', function () {
          assert.ok(true)
          done()
        })
        vorpal
          .command('CancelEvent', 'This command cancels itself.')
          .action(function () {
            this.cancel()
          })
        vorpal.exec('CancelEvent')
      })
    })

    describe('events', function () {
      it('should handle event command_registered', function (done) {
        vorpal.on('command_registered', function () {
          assert.ok(true)
          done()
        }).command('newMethod')
      })

      it('should handle event client_command_executed', function (done) {
        vorpal.on('client_command_executed', function () {
          assert.ok(true)
          done()
        })
        vorpal.exec('help')
      })

      it('should handle event client_command_error', function (done) {
        vorpal.on('client_command_error', function () {
          assert.ok(true)
          done()
        })
        vorpal.exec('fail me plzz')
      })

      it('should handle piped event client_command_error', function (done) {
        const vorpal2 = new Vorpal()
        vorpal2.on('client_command_error', function () {
          assert.ok(true)
          done()
        })
          .command('fail')
          .action(function (args, cb) {
            cb('failed')
          })
        vorpal2.exec('help | fail | help')
      })
    })

    describe('local storage', function () {
      it('should error if not initialized', function () {
        assert.throws(function () {
          vorpal.localStorage.setItem()
        })
        assert.throws(function () {
          vorpal.localStorage.getItem()
        })
        assert.throws(function () {
          vorpal.localStorage.removeItem()
        })
      })

      it('should error if not passed a unique id', function () {
        assert.throws(function () {
          vorpal.localStorage()
        })
      })

      it('should set and get items', function () {
        const a = new Vorpal()
        a.localStorage('foo')
        a.localStorage.setItem('cow', 'lick')
        assert.equal(a.localStorage.getItem('cow'), 'lick')
      })

      it('should remove items', function () {
        const a = new Vorpal()
        a.localStorage('removetest')
        a.localStorage.setItem('temp', 'data')
        assert.equal(a.localStorage.getItem('temp'), 'data')
        a.localStorage.removeItem('temp')
        assert.equal(a.localStorage.getItem('temp'), null)
      })

      it('should return null for missing keys', function () {
        const a = new Vorpal()
        a.localStorage('missingtest')
        assert.equal(a.localStorage.getItem('nonexistent'), null)
      })
    })
  })
})