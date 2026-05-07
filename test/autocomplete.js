import { describe, it } from 'node:test'
import Vorpal from '../lib/vorpal.js'
import assert from 'node:assert/strict'

const vorpal = new Vorpal()

describe('session._autocomplete', function () {
  it('should return longest possible match', function () {
    const result = vorpal.session._autocomplete('c', ['cmd', 'cme', 'def'])
    assert.equal(result, 'cm')
  })

  it('should return list of matches when there are no more common characters', function () {
    const result = vorpal.session._autocomplete('c', ['cmd', 'ced'])
    assert.equal(result.length, 2)
    assert.equal(result[0], 'ced')
    assert.equal(result[1], 'cmd')
  })

  it('should return list of matches even if we have a complete match', function () {
    const result = vorpal.session._autocomplete('cmd', ['cmd', 'cmd2'])
    assert.equal(result.length, 2)
    assert.equal(result[0], 'cmd')
    assert.equal(result[1], 'cmd2')
  })

  it('should return undefined if no match', function () {
    const result = vorpal.session._autocomplete('cmd', ['def', 'xyz'])
    assert.equal(result, undefined)
  })

  it('should return the match if only a single possible match exists', function () {
    const result = vorpal.session._autocomplete('d', ['def', 'xyz'])
    assert.equal(result, 'def ')
  })

  it('should return the prefix along with the partial match when supplied with a prefix input', function () {
    const result = vorpal.session._autocomplete('foo/de', ['dally', 'definitive', 'definitop', 'bob'])
    assert.equal(result, 'foo/definit')
  })

  it('should return a list of matches when supplied with a prefix but no value post prefix', function () {
    const result = vorpal.session._autocomplete('foo/', ['dally', 'definitive', 'definitop', 'bob'])
    assert.equal(result.length, 4)
    assert.equal(result[0], 'bob')
    assert.equal(result[1], 'dally')
    assert.equal(result[2], 'definitive')
    assert.equal(result[3], 'definitop')
  })
})