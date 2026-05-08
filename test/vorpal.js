import { describe, it, beforeEach } from 'node:test'
import Vorpal from '../lib/vorpal.js'
import assert from 'node:assert/strict'
import intercept from '../lib/intercept.js'

let unmute
const mute = function () {
  unmute = intercept(function (str) {
    return ''
  })
}

function obj (inp) {
  return JSON.stringify(inp)
}

const vorpal = new Vorpal()
vorpal
  .command('foo [args...]')
  .option('-b, --bool')
  .option('-r, --required <str>')
  .option('-o, --optional [str]')
  .action(function (args, cb) {
    return args
  })

vorpal
  .command('bar')
  .allowUnknownOptions(true)
  .action(function (args, cb) {
    return args
  })

vorpal
  .command('baz')
  .allowUnknownOptions(true)
  .allowUnknownOptions(false)
  .action(function (args, cb) {
    return args
  })

vorpal
  .command('optional [str]')
  .action(function (args, cb) {
    return args
  })

vorpal
  .command('required <str>')
  .action(function (args, cb) {
    return args
  })

vorpal
  .command('multiple <req> [opt] [variadic...]')
  .action(function (args, cb) {
    return args
  })

vorpal
  .command('wrong-sequence [opt] <req> [variadic...]')
  .action(function (args, cb) {
    return args
  })

vorpal
  .command('multi word command [variadic...]')
  .action(function (args, cb) {
    return args
  })

describe('argument parsing', function () {
  it('should execute a command with no args', function () {
    const fixture = obj({ options: {} })
    assert.equal(obj(vorpal.execSync('foo')), fixture)
  })

  it('should execute a command without an optional arg', function () {
    const fixture = obj({ options: {} })
    assert.equal(obj(vorpal.execSync('optional')), fixture)
  })

  it('should execute a command with an optional arg', function () {
    const fixture = obj({ options: {}, str: 'bar' })
    assert.equal(obj(vorpal.execSync('optional bar')), fixture)
  })

  it('should execute a command with a required arg', function () {
    const fixture = obj({ options: {}, str: 'bar' })
    assert.equal(obj(vorpal.execSync('required bar')), fixture)
  })

  it('should throw help when not passed a required arg', function () {
    mute()
    const fixture = '\n  Missing required argument. Showing Help:'
    assert.equal(vorpal.execSync('required'), fixture)
    unmute()
  })

  it('should execute a command with multiple arg types', function () {
    const fixture = obj({ options: {}, req: 'foo', opt: 'bar', variadic: ['joe', 'smith'] })
    assert.equal(obj(vorpal.execSync('multiple foo bar joe smith')), fixture)
  })

  it('should correct a command with wrong arg sequences declared', function () {
    const fixture = obj({ options: {}, req: 'foo', opt: 'bar', variadic: ['joe', 'smith'] })
    assert.equal(obj(vorpal.execSync('multiple foo bar joe smith')), fixture)
  })

  it('should normalize key=value pairs', function () {
    const fixture = obj({
      options: {},
      req: "a='b'",
      opt: "c='d and e'",
      variadic: ["wombat='true'", 'a', "fizz='buzz'", "hello='goodbye'"]
    })
    assert.equal(obj(vorpal.execSync("multiple a='b' c=\"d and e\" wombat=true a fizz='buzz' \"hello='goodbye'\"")), fixture)
  })

  it('should NOT normalize key=value pairs when isCommandArgKeyPairNormalized is false', function () {
    const fixture = obj({
      options: {},
      req: 'hello=world',
      opt: 'hello="world"',
      variadic: ['hello=`world`']
    })
    vorpal.isCommandArgKeyPairNormalized = false
    assert.equal(obj(vorpal.execSync('multiple "hello=world" \'hello="world"\' "hello=`world`"')), fixture)
    vorpal.isCommandArgKeyPairNormalized = true
  })

  it('should execute multi-word command with arguments', function () {
    const fixture = obj({ options: {}, variadic: ['and', 'so', 'on'] })
    assert.equal(obj(vorpal.execSync('multi word command and so on')), fixture)
  })

  it('should parse command with undefine in it as invalid', function () {
    const fixture = obj('Invalid command.')
    assert.equal(obj(vorpal.execSync('has undefine in it')), fixture)
  })
})

describe('option parsing', function () {
  it('should execute a command with no options', function () {
    const fixture = obj({ options: {} })
    assert.equal(obj(vorpal.execSync('foo')), fixture)
  })

  it('should execute a command with args and no options', function () {
    const fixture = obj({ options: {}, args: ['bar', 'smith'] })
    assert.equal(obj(vorpal.execSync('foo bar smith')), fixture)
  })

  describe('options before an arg', function () {
    it('should accept a short boolean option', function () {
      const fixture = obj({ options: { bool: true }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo -b bar smith')), fixture)
    })

    it('should accept a long boolean option', function () {
      const fixture = obj({ options: { bool: true }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo --bool bar smith')), fixture)
    })

    it('should accept a short optional option', function () {
      const fixture = obj({ options: { optional: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo --o cheese bar smith')), fixture)
    })

    it('should accept a long optional option', function () {
      const fixture = obj({ options: { optional: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo --optional cheese bar smith')), fixture)
    })

    it('should accept a short required option', function () {
      const fixture = obj({ options: { required: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo -r cheese bar smith')), fixture)
    })

    it('should accept a long required option', function () {
      const fixture = obj({ options: { required: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo --required cheese bar smith')), fixture)
    })
  })

  describe('options after args', function () {
    it('should accept a short boolean option', function () {
      const fixture = obj({ options: { bool: true }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo bar smith -b ')), fixture)
    })

    it('should accept a long boolean option', function () {
      const fixture = obj({ options: { bool: true }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo bar smith --bool ')), fixture)
    })

    it('should accept a short optional option', function () {
      const fixture = obj({ options: { optional: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo bar smith --o cheese ')), fixture)
    })

    it('should accept a long optional option', function () {
      const fixture = obj({ options: { optional: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo bar smith --optional cheese ')), fixture)
    })

    it('should accept a short required option', function () {
      const fixture = obj({ options: { required: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo bar smith -r cheese ')), fixture)
    })

    it('should accept a long required option', function () {
      const fixture = obj({ options: { required: 'cheese' }, args: ['bar', 'smith'] })
      assert.equal(obj(vorpal.execSync('foo bar smith --required cheese ')), fixture)
    })
  })

  describe('options without an arg', function () {
    it('should accept a short boolean option', function () {
      const fixture = obj({ options: { bool: true } })
      assert.equal(obj(vorpal.execSync('foo -b ')), fixture)
    })

    it('should accept a long boolean option', function () {
      const fixture = obj({ options: { bool: true } })
      assert.equal(obj(vorpal.execSync('foo --bool ')), fixture)
    })

    it('should accept a short optional option', function () {
      const fixture = obj({ options: { optional: 'cheese' } })
      assert.equal(obj(vorpal.execSync('foo --o cheese ')), fixture)
    })

    it('should accept a long optional option', function () {
      const fixture = obj({ options: { optional: 'cheese' } })
      assert.equal(obj(vorpal.execSync('foo --optional cheese ')), fixture)
    })

    it('should accept a short required option', function () {
      const fixture = obj({ options: { required: 'cheese' } })
      assert.equal(obj(vorpal.execSync('foo -r cheese ')), fixture)
    })

    it('should accept a long required option', function () {
      const fixture = obj({ options: { required: 'cheese' } })
      assert.equal(obj(vorpal.execSync('foo --required cheese ')), fixture)
    })
  })

  describe('option validation', function () {
    it('should execute a boolean option without an arg', function () {
      const fixture = obj({ options: { bool: true } })
      assert.equal(obj(vorpal.execSync('foo -b')), fixture)
    })

    it('should execute an optional option without an arg', function () {
      const fixture = obj({ options: { optional: true } })
      assert.equal(obj(vorpal.execSync('foo -o')), fixture)
    })

    it('should execute an optional option with an arg', function () {
      const fixture = obj({ options: { optional: 'cows' } })
      assert.equal(obj(vorpal.execSync('foo -o cows')), fixture)
    })

    it('should execute a required option with an arg', function () {
      const fixture = obj({ options: { required: 'cows' } })
      assert.equal(obj(vorpal.execSync('foo -r cows')), fixture)
    })

    it('should throw help on a required option without an arg', function () {
      const fixture = '\n  Missing required value for option --required. Showing Help:'
      mute()
      assert.equal(vorpal.execSync('foo -r'), fixture)
      unmute()
    })
  })

  describe('negated options', function () {
    it('should make a boolean option false', function () {
      const fixture = obj({ options: { bool: false }, args: ['cows'] })
      assert.equal(obj(vorpal.execSync('foo --no-bool cows')), fixture)
    })

    it('should make an unfilled optional option false', function () {
      const fixture = obj({ options: { optional: false }, args: ['cows'] })
      assert.equal(obj(vorpal.execSync('foo --no-optional cows')), fixture)
    })

    it('should ignore a filled optional option', function () {
      const fixture = obj({ options: { optional: false }, args: ['cows'] })
      assert.equal(obj(vorpal.execSync('foo --no-optional cows')), fixture)
    })

    it('should return help on a required option', function () {
      const fixture = '\n  Missing required value for option --required. Showing Help:'
      mute()
      assert.equal(vorpal.execSync('foo --no-required cows'), fixture)
      unmute()
    })

    it('should throw help on an unknown option', function () {
      const fixture = "\n  Invalid option: 'unknown'. Showing Help:"
      assert.equal(vorpal.execSync('foo --unknown'), fixture)
    })

    it('should allow unknown options when allowUnknownOptions is set to true', function () {
      const fixture = obj({ options: { unknown: true } })
      assert.equal(obj(vorpal.execSync('bar --unknown')), fixture)
    })

    it('should allow the allowUnknownOptions state to be set with a boolean', function () {
      const fixture = "\n  Invalid option: 'unknown'. Showing Help:"
      assert.equal(vorpal.execSync('baz --unknown'), fixture)
    })
  })
})

describe('help menu', function () {
  it.skip('show help on an invalid command', function () {
    // skipped in original
  })
})

describe('descriptors', function () {
  let instance

  beforeEach(function () {
    instance = new Vorpal()
  })

  it('sets the version', function () {
    instance.version('1.2.3')
    assert.equal(instance._version, '1.2.3')
  })

  it('sets the title', function () {
    instance.title('Vorpal')
    assert.equal(instance._title, 'Vorpal')
  })

  it('sets the description', function () {
    instance.description('A CLI tool.')
    assert.equal(instance._description, 'A CLI tool.')
  })

  it('sets the banner', function () {
    instance.banner('VORPAL')
    assert.equal(instance._banner, 'VORPAL')
  })
})
