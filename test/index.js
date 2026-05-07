import { describe, it } from 'node:test'
import Vorpal from '../lib/vorpal.js'
import assert from 'node:assert/strict'

const vorpal = new Vorpal()

describe('vorpal', function () {
  describe('constructor', function () {
    it('should exist and be a function', function () {
      assert.equal(typeof Vorpal, 'function')
    })
  })

  describe('.parse', function () {
    it('should exist and be a function', function () {
      assert.equal(typeof vorpal.parse, 'function')
    })

    it('should expose parseArgs', function () {
      const result = vorpal.parse(['a', 'b', 'foo', 'bar', '-r'], { use: 'minimist' })
      assert.equal(result.values.r, true)
    })
  })

  describe('mode context', function () {
    it('parent should have the same context in init and action', function (t, done) {
      const vorpal = new Vorpal()
      let initCtx
      vorpal
        .mode('ooga')
        .init(function (args, cb) {
          initCtx = this.parent
          cb()
        })
        .action(function (args, cb) {
          assert.equal(this.parent, initCtx)
          cb()
          done()
        })
      vorpal.exec('ooga')
        .then(function () {
          vorpal.exec('booga')
        })
    })
  })
})
