import util from './util.js'
import nodeUtil from 'node:util'

function viewed (str) {
  const re = /\u001b\[\d+m/gm
  return String(str).replace(re, '')
}

function trimTo (str, amt) {
  let raw = ''
  const visual = viewed(str).slice(0, amt)
  let result = ''
  for (let i = 0; i < str.length; ++i) {
    raw += str[i]
    if (viewed(raw) === visual) {
      result = raw
      break
    }
  }

  if (result.length < amt - 10) {
    return result
  }

  let newResult = result
  let found = false
  for (let j = result.length; j > 0; --j) {
    if (result[j] === ' ') {
      found = true
      break
    } else {
      newResult = newResult.slice(0, newResult.length - 1)
    }
  }

  if (found) {
    return newResult
  }

  return result
}

function Logger (cons) {
  const logger = cons || console
  const log = function (...args) {
    logger.log(...args)
  }

  log.cols = function (...input) {
    const width = process.stdout.columns
    let pads = 0
    let padsWidth = 0
    let cols = 0
    let colsWidth = 0

    for (let h = 0; h < input.length; ++h) {
      if (typeof input[h] === 'number') {
        padsWidth += input[h]
        pads++
      }
      if (Array.isArray(input[h]) && typeof input[h][0] === 'number') {
        padsWidth += input[h][0]
        pads++
      }
    }

    cols = input.length - pads
    colsWidth = Math.floor((width - padsWidth) / cols)

    const lines = []

    const go = function () {
      let str = ''
      let done = true
      for (let i = 0; i < input.length; ++i) {
        if (typeof input[i] === 'number') {
          str += util.pad('', input[i], ' ')
        } else if (Array.isArray(input[i]) && typeof input[i][0] === 'number') {
          str += util.pad('', input[i][0], input[i][1])
        } else {
          const chosenWidth = colsWidth + 0
          const trimmed = trimTo(input[i], colsWidth)
          const trimmedLength = trimmed.length
          const re = /\\u001b\[\d+m/gm
          const matches = nodeUtil.inspect(trimmed).match(re)
          let color = ''
          if (matches && matches[matches.length - 1] !== '\\u001b[39m') {
            const number = String(matches[matches.length - 1]).slice(7, 9)
            color = '\x1B[' + number + 'm'
          }
          input[i] = color + String(input[i].slice(trimmedLength, input[i].length)).trim()
          str += util.pad(String(trimmed).trim(), chosenWidth, ' ')
          if (viewed(input[i]).trim() !== '') {
            done = false
          }
        }
      }
      lines.push(str)
      if (!done) {
        go()
      }
    }
    go()
    for (let i = 0; i < lines.length; ++i) {
      logger.log(lines[i])
    }
    return this
  }

  log.br = function () {
    logger.log(' ')
    return this
  }

  return log
}

export default Logger