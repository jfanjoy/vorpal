import { describe, it, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import Vorpal from '../lib/vorpal.js'
import { spawn } from 'node:child_process'
import path from 'node:path'
import url from 'node:url'

const __dirname = path.dirname(url.fileURLToPath(import.meta.url))

describe('_promptArray chain logic', function () {
  let vorpal

  beforeEach(function () {
    vorpal = new Vorpal()
  })

  it('should merge responses from multiple prompts', async function () {
    const mockAnswers = [
      { name: 'alice' },
      { host: 'example.com' },
      { id: 'abc123' }
    ]
    let callIndex = 0

    vorpal.prompt = function (options) {
      if (Array.isArray(options)) {
        return vorpal._promptArray(options)
      }
      return Promise.resolve(mockAnswers[callIndex++])
    }

    const result = await vorpal.prompt([
      { name: 'name', message: 'Name: ' },
      { name: 'host', message: 'Host: ' },
      { name: 'id', message: 'ID: ' }
    ])

    assert.deepEqual(Object.keys(result), ['name', 'host', 'id'])
    assert.equal(result.name, 'alice')
    assert.equal(result.host, 'example.com')
    assert.equal(result.id, 'abc123')
  })

  it('should call prompts sequentially in order', async function () {
    const callOrder = []
    const mockAnswers = [
      { first: 'a' },
      { second: 'b' },
      { third: 'c' }
    ]
    let callIndex = 0

    vorpal.prompt = function (options) {
      if (Array.isArray(options)) {
        return vorpal._promptArray(options)
      }
      callOrder.push(options.name)
      return new Promise(function (resolve) {
        setTimeout(function () {
          resolve(mockAnswers[callIndex++])
        }, 10)
      })
    }

    const result = await vorpal.prompt([
      { name: 'first', message: '1: ' },
      { name: 'second', message: '2: ' },
      { name: 'third', message: '3: ' }
    ])

    assert.deepEqual(callOrder, ['first', 'second', 'third'])
    assert.equal(result.first, 'a')
    assert.equal(result.second, 'b')
    assert.equal(result.third, 'c')
  })

  it('should handle mixed prompt types including boolean from confirm', async function () {
    const mockAnswers = [
      { name: 'myname' },
      { host: 'myhost' },
      { https: true },
      { id: 'myid' },
      { secret: 'mysecret' }
    ]
    let callIndex = 0

    vorpal.prompt = function (options) {
      if (Array.isArray(options)) {
        return vorpal._promptArray(options)
      }
      return Promise.resolve(mockAnswers[callIndex++])
    }

    const result = await vorpal.prompt([
      { name: 'name', message: 'Name: ' },
      { name: 'host', message: 'Host: ' },
      { name: 'https', message: 'Use TLS: ', type: 'confirm', default: true },
      { name: 'id', message: 'Client ID: ' },
      { name: 'secret', message: 'Secret: ', type: 'password' }
    ])

    assert.equal(Object.keys(result).length, 5, 'should have 5 keys from all prompts')
    assert.equal(result.name, 'myname')
    assert.equal(result.host, 'myhost')
    assert.equal(result.https, true)
    assert.equal(result.id, 'myid')
    assert.equal(result.secret, 'mysecret')
  })

  it('should return empty object for empty prompt array', async function () {
    vorpal.prompt = function (options) {
      if (Array.isArray(options)) {
        return vorpal._promptArray(options)
      }
      return Promise.resolve({})
    }

    const result = await vorpal.prompt([])
    assert.deepEqual(result, {})
  })

  it('should handle single prompt', async function () {
    vorpal.prompt = function (options) {
      if (Array.isArray(options)) {
        return vorpal._promptArray(options)
      }
      return Promise.resolve({ answer: 'yes' })
    }

    const result = await vorpal.prompt([
      { name: 'answer', message: 'Continue?' }
    ])

    assert.equal(result.answer, 'yes')
  })

  it('should overwrite earlier keys with later ones if names collide', async function () {
    const mockAnswers = [
      { name: 'first' },
      { name: 'second' }
    ]
    let callIndex = 0

    vorpal.prompt = function (options) {
      if (Array.isArray(options)) {
        return vorpal._promptArray(options)
      }
      return Promise.resolve(mockAnswers[callIndex++])
    }

    const result = await vorpal.prompt([
      { name: 'name', message: 'Name 1:' },
      { name: 'name', message: 'Name 2:' }
    ])

    assert.equal(result.name, 'second')
  })
})

describe('sequential prompt chain integration', function () {
  it('should complete all 5 prompts in a mixed chain (input, input, confirm, input, password)', function (t, done) {
    const scriptPath = path.join(__dirname, 'util', 'prompt-chain.mjs')

    const child = spawn('script', ['-qc', 'node ' + scriptPath + ' test-chain', '/dev/null'], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'dumb' }
    })

    const answers = [
      'testname\n',
      'testhost\n',
      '\n',
      'testid\n',
      'testsecret\n'
    ]

    let output = ''

    child.stdout.on('data', function (data) {
      output += data.toString()
    })

    child.stderr.on('data', function (data) {
      output += data.toString()
    })

    let answerIndex = 0
    function feedNext () {
      if (answerIndex < answers.length) {
        child.stdin.write(answers[answerIndex])
        answerIndex++
        setTimeout(feedNext, 500)
      } else {
        child.stdin.end()
      }
    }

    setTimeout(feedNext, 1000)

    let finished = false

    child.on('close', function () {
      if (finished) return
      finished = true

      // Strip ANSI escape codes from output for reliable parsing
      // eslint-disable-next-line no-control-regex
      const cleanOutput = output.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '').replace(/\x1b\?.*?\n/g, '')

      const resultLine = cleanOutput.split('\n').find(function (line) {
        return line.includes('PROMPT_RESULT=')
      })
      const errorLine = cleanOutput.split('\n').find(function (line) {
        return line.includes('PROMPT_ERROR=')
      })

      if (errorLine) {
        const errorData = JSON.parse(errorLine.substring(errorLine.indexOf('PROMPT_ERROR=')).replace('PROMPT_ERROR=', ''))
        done(new Error('Prompt chain failed: ' + errorData.error + '\nOutput: ' + output.slice(-500)))
        return
      }

      assert.notEqual(resultLine, undefined, 'should produce PROMPT_RESULT output. Full output:\n' + output.slice(-2000))

      const resultJson = resultLine.substring(resultLine.indexOf('PROMPT_RESULT=')).replace('PROMPT_RESULT=', '')
      const result = JSON.parse(resultJson)
      assert.equal(result.keys.length, 5, 'should collect answers from all 5 prompts, got keys: ' + JSON.stringify(result.keys) + '\nFull output:\n' + output.slice(-2000))
      assert.equal(result.answers.name, 'testname')
      assert.equal(result.answers.host, 'testhost')
      assert.equal(result.answers.https, true)
      assert.equal(result.answers.id, 'testid')
      assert.equal(result.answers.secret, 'testsecret')
      done()
    })

    setTimeout(function () {
      if (finished) return
      finished = true
      child.kill()
      done(new Error('Test timed out after 15 seconds. Output:\n' + output.slice(-2000)))
    }, 15000)
  })
})
