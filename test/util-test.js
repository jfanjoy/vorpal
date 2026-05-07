import assert from 'node:assert/strict'
import util from '../lib/util.js'

describe('util', function () {
  describe('isEmpty', function () {
    it('should return true for empty objects', function () {
      assert.equal(util.isEmpty({}), true)
    })

    it('should return true for empty arrays', function () {
      assert.equal(util.isEmpty([]), true)
    })

    it('should return false for non-empty objects', function () {
      assert.equal(util.isEmpty({ a: 1 }), false)
    })

    it('should return false for non-empty arrays', function () {
      assert.equal(util.isEmpty([1]), false)
    })
  })

  describe('isObject', function () {
    it('should return true for plain objects', function () {
      assert.equal(util.isObject({}), true)
    })

    it('should return true for arrays', function () {
      assert.equal(util.isObject([]), true)
    })

    it('should return true for null-prototype objects', function () {
      assert.equal(util.isObject(Object.create(null)), true)
    })

    it('should return false for null', function () {
      assert.equal(util.isObject(null), false)
    })

    it('should return false for undefined', function () {
      assert.equal(util.isObject(undefined), false)
    })

    it('should return false for strings', function () {
      assert.equal(util.isObject('hello'), false)
    })

    it('should return false for numbers', function () {
      assert.equal(util.isObject(42), false)
    })

    it('should return true for functions', function () {
      assert.equal(util.isObject(function () {}), true)
    })
  })

  describe('pad', function () {
    it('should pad a string to the given width', function () {
      assert.equal(util.pad('hi', 10), 'hi        ')
    })

    it('should pad with a custom delimiter', function () {
      assert.equal(util.pad('hi', 10, '.'), 'hi........')
    })

    it('should not pad if string is already at width', function () {
      assert.equal(util.pad('hello', 5), 'hello')
    })

    it('should not pad if string exceeds width', function () {
      assert.equal(util.pad('hello world', 5), 'hello world')
    })
  })

  describe('padRow', function () {
    it('should pad rows with spaces', function () {
      assert.equal(util.padRow('hello'), '  hello  ')
    })

    it('should pad multiline strings', function () {
      assert.equal(util.padRow('a\nb'), '  a  \n  b  ')
    })
  })

  describe('parseArgs', function () {
    it('should parse a simple argument string', function () {
      const result = util.parseArgs('foo bar baz')
      assert.deepStrictEqual(result._, ['foo', 'bar', 'baz'])
    })

    it('should parse quoted arguments', function () {
      const result = util.parseArgs('foo "bar baz" qux')
      assert.deepStrictEqual(result._, ['foo', 'bar baz', 'qux'])
    })

    it('should parse single quoted arguments', function () {
      const result = util.parseArgs("foo 'bar baz' qux")
      assert.deepStrictEqual(result._, ['foo', 'bar baz', 'qux'])
    })

    it('should parse backtick quoted arguments', function () {
      const result = util.parseArgs('foo `bar baz` qux')
      assert.deepStrictEqual(result._, ['foo', 'bar baz', 'qux'])
    })

    it('should parse boolean options', function () {
      const result = util.parseArgs('--verbose', { boolean: ['verbose'] })
      assert.equal(result.verbose, true)
    })
  })

  describe('humanReadableArgName', function () {
    it('should format required args with angle brackets', function () {
      assert.equal(util.humanReadableArgName({ name: 'file', required: true, variadic: false }), '<file>')
    })

    it('should format optional args with square brackets', function () {
      assert.equal(util.humanReadableArgName({ name: 'file', required: false, variadic: false }), '[file]')
    })

    it('should format variadic args with ellipsis', function () {
      assert.equal(util.humanReadableArgName({ name: 'files', required: false, variadic: true }), '[files...]')
    })

    it('should format required variadic args', function () {
      assert.equal(util.humanReadableArgName({ name: 'files', required: true, variadic: true }), '<files...>')
    })
  })

  describe('prettifyArray', function () {
    it('should join short arrays on one line', function () {
      const result = util.prettifyArray(['a', 'b', 'c'])
      assert.ok(result.includes('a'))
      assert.ok(result.includes('b'))
      assert.ok(result.includes('c'))
    })

    it('should handle empty arrays', function () {
      assert.equal(util.prettifyArray([]), '')
    })
  })

  describe('fixArgsForApply', function () {
    it('should wrap non-array non-object values in an array', function () {
      assert.deepStrictEqual(util.fixArgsForApply('hello'), ['hello'])
    })

    it('should return arrays as-is', function () {
      assert.deepStrictEqual(util.fixArgsForApply([1, 2, 3]), [1, 2, 3])
    })

    it('should convert object values to an array', function () {
      const result = util.fixArgsForApply({ 0: 'a', 1: 'b' })
      assert.deepStrictEqual(result, ['a', 'b'])
    })

    it('should wrap functions in an array', function () {
      const fn = function () {}
      const result = util.fixArgsForApply(fn)
      assert.equal(result[0], fn)
    })
  })
})