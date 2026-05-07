import assert from 'node:assert/strict'
import Store from '../lib/store.js'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

describe('Store', function () {
  let storePath
  let store

  beforeEach(function () {
    storePath = path.join(os.tmpdir(), '.vorpal_store_test_' + Date.now())
    store = new Store(storePath)
  })

  afterEach(function () {
    try {
      fs.rmSync(storePath, { recursive: true })
    } catch {}
    try {
      fs.rmSync(storePath + '.tmp', { recursive: true })
    } catch {}
  })

  it('should create a Store instance', function () {
    assert.ok(store instanceof Store)
  })

  it('should return null for missing keys', function () {
    assert.equal(store.getItem('missing'), null)
  })

  it('should set and get string values', function () {
    store.setItem('name', 'vorpal')
    assert.equal(store.getItem('name'), 'vorpal')
  })

  it('should set and get numeric values', function () {
    store.setItem('count', 42)
    assert.equal(store.getItem('count'), 42)
  })

  it('should set and get object values', function () {
    store.setItem('data', { key: 'value' })
    assert.deepStrictEqual(store.getItem('data'), { key: 'value' })
  })

  it('should overwrite existing values', function () {
    store.setItem('key', 'first')
    store.setItem('key', 'second')
    assert.equal(store.getItem('key'), 'second')
  })

  it('should remove items', function () {
    store.setItem('temp', 'data')
    store.removeItem('temp')
    assert.equal(store.getItem('temp'), null)
  })

  it('should persist data to disk', function () {
    store.setItem('persist', 'yes')
    const store2 = new Store(storePath)
    assert.equal(store2.getItem('persist'), 'yes')
  })

  it('should handle boolean values', function () {
    store.setItem('flag', true)
    assert.equal(store.getItem('flag'), true)
    store.setItem('noflag', false)
    assert.equal(store.getItem('noflag'), false)
  })

  it('should handle null values', function () {
    store.setItem('nullval', null)
    assert.equal(store.getItem('nullval'), null)
  })
})