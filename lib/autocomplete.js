import strip from 'strip-ansi'

let autocomplete = {

  exec (str, cb) {
let self = this
let input = parseInput(str, this.parent.ui._activePrompt.rl.cursor)
let commands = getCommandNames(this.parent.commands)
let vorpalMatch = getMatch(input.context, commands, {ignoreSlashes: true})
let freezeTabs = false

    function end(str) {
let res = handleTabCounts.call(self, str, freezeTabs)
      cb(undefined, res)
    }

    function evaluateTabs(input) {
      if (input.context && input.context[input.context.length - 1] === '/') {
        freezeTabs = true
      }
    }

    if (vorpalMatch) {
      input.context = vorpalMatch
      evaluateTabs(input)
      end(assembleInput(input))
      return
    }

    input = getMatchObject.call(this, input, commands)
    if (input.match) {
      input = parseMatchSection.call(this, input)
      getMatchData.call(self, input, function (data) {
let dataMatch = getMatch(input.context, data)
        if (dataMatch) {
          input.context = dataMatch
          evaluateTabs(input)
          end(assembleInput(input))
          return
        }
        end(filterData(input.context, data))
      })
      return
    }
    end(filterData(input.context, commands))
  },

  match (str, arr, options) {
    arr = arr || []
    options = options || {}
    arr.sort()
let arrX = [...arr]
let strX = String(str)

let prefix = ''

    if (options.ignoreSlashes !== true) {
let parts = strX.split('/')
      strX = parts.pop()
      prefix = parts.join('/')
      prefix = parts.length > 0 ? prefix + '/' : prefix
    }

let matches = []
    for (let i = 0; i < arrX.length; i++) {
      if (strip(arrX[i]).slice(0, strX.length) === strX) {
        matches.push(arrX[i])
      }
    }
    if (matches.length === 1) {
let space = (String(strip(matches[0])).slice(strip(matches[0]).length - 1) === '/') ? '' : ' '
      return prefix + matches[0] + space
    } else if (matches.length === 0) {
      return undefined
    } else if (strX.length === 0) {
      return matches
    }

let longestMatchLength = matches
      .reduce(function (previous, current) {
        for (let i = 0; i < current.length; i++) {
          if (previous[i] && current[i] !== previous[i]) {
            return current.slice(0, i)
          }
        }
        return previous
      }).length

    if (longestMatchLength === strX.length) {
      return matches
    }

    return prefix + matches[0].slice(0, longestMatchLength)
  }
}

function handleTabCounts(str, freezeTabs) {
let result
  if (Array.isArray(str)) {
    this._tabCtr += 1
    if (this._tabCtr > 1) {
      result = ((str.length === 0) ? undefined : str)
    }
  } else {
    this._tabCtr = (freezeTabs === true) ? this._tabCtr + 1 : 0
    result = str
  }
  return result
}

function getMatch(ctx, data, options) {
let len = ctx.length
let trimmed = ctx.replace(/^\s+/g, '')
let match = autocomplete.match(trimmed, data.slice(), options)
  if (Array.isArray(match)) {
    return match
  }
let prefix = ' '.repeat(len - trimmed.length)
  if (match) {
    match = prefix + match
    return match
  }
  return undefined
}

function assembleInput(input) {
  if (Array.isArray(input.context)) {
    return input.context
  }
let result =
    (input.prefix || '') +
    (input.context || '') +
    (input.suffix || '')
  return strip(result)
}

function filterData(str, data) {
  data = data || []
let ctx = String(str || '').trim()
let slashParts = ctx.split('/')
  ctx = slashParts.pop()
let wordParts = String(ctx).trim().split(' ')
let res = data.filter(function (item) {
    return (strip(item).slice(0, ctx.length) === ctx)
  })
  res = res.map(function (item) {
let parts = String(item).trim().split(' ')
    if (parts.length > 1) {
      parts = parts.slice(wordParts.length)
      return parts.join(' ')
    }
    return item
  })
  return res
}

function parseInput(str, idx) {
let raw = String(str || '')
let sliced = raw.slice(0, idx)
let sections = sliced.split('|')
let prefix = (sections.slice(0, sections.length - 1) || [])
  prefix.push('')
  prefix = prefix.join('|')
let suffix = getSuffix(raw.slice(idx))
let context = sections[sections.length - 1]
  return ({
    raw: raw,
    prefix: prefix,
    suffix: suffix,
    context: context
  })
}

function parseMatchSection(input) {
let parts = (input.context || '').split(' ')
let last = parts.pop()
let beforeLast = strip(parts[parts.length - 1] || '').trim()
  if (beforeLast.slice(0, 1) === '-') {
    input.option = beforeLast
  }
  input.context = last
  input.prefix = (input.prefix || '') + parts.join(' ') + ' '
  return input
}

function getSuffix(suffix) {
  suffix = (suffix.slice(0, 1) === ' ') ?
    suffix :
    suffix.replace(/.+?(?=\s)/, '')
  suffix = suffix.slice(1, suffix.length)
  return suffix
}

function getCommandNames(cmds) {
let commands = cmds.map(c => c._name)
  commands = commands.concat(...cmds.map(c => c._aliases))
  commands.sort()
  return commands
}

function getMatchObject(input, commands) {
let len = input.context.length
let trimmed = String(input.context).replace(/^\s+/g, '')
let prefix = ' '.repeat(len - trimmed.length)
let match
let suffix
  commands.forEach(function (cmd) {
let nextChar = trimmed.slice(cmd.length, cmd.length + 1)
    if (trimmed.slice(0, cmd.length) === cmd && String(cmd).trim() !== '' && nextChar === ' ') {
      match = cmd
      suffix = trimmed.slice(cmd.length)
      prefix += trimmed.slice(0, cmd.length)
    }
  })

let matchObject = (match) ?
    this.parent.commands.find(c => c._name === String(match).trim()) :
    undefined

  if (!matchObject) {
    this.parent.commands.forEach(function (cmd) {
      if ((cmd._aliases || []).indexOf(String(match).trim()) > -1) {
        matchObject = cmd
      }
      return
    })
  }

  if (!matchObject) {
    matchObject = this.parent.commands.find(c => c._catch)
    if (matchObject) {
      suffix = input.context
    }
  }

  if (!matchObject) {
    prefix = input.context
    suffix = ''
  }

  if (matchObject) {
    input.match = matchObject
    input.prefix += prefix
    input.context = suffix
  }
  return input
}

function getMatchData(input, cb) {
let string = input.context
let cmd = input.match
let midOption = (String(string).trim().slice(0, 1) === '-')
let afterOption = (input.option !== undefined)
  if (midOption === true && (!cmd._allowUnknownOptions)) {
let results = []
    for (let i = 0; i < cmd.options.length; ++i) {
let long = cmd.options[i].long
let short = cmd.options[i].short
      if (!long && short) {
        results.push(short)
      } else if (long) {
        results.push(long)
      }
    }
    cb(results)
    return
  }

  function handleDataFormat(str, config, callback) {
let data = []
    if (Array.isArray(config)) {
      data = config
    } else if (typeof config === 'function') {
let cbk = (config.length < 2) ? (function () {}) : (function (res) {
        callback(res || [])
      })
let res = config(str, cbk)
      if (res && typeof res.then === 'function') {
        res.then(function (resp) {
          callback(resp)
        }).catch(function (err) {
          callback(err)
        })
      } else if (config.length < 2) {
        callback(res)
      }
      return
    }
    callback(data)
    return
  }

  if (afterOption === true) {
let opt = strip(input.option).trim()
let shortMatch = cmd.options.find(o => o.short === opt)
let longMatch = cmd.options.find(o => o.long === opt)
let match2 = longMatch || shortMatch
    if (match2) {
let config = match2.autocomplete
      handleDataFormat(string, config, cb)
      return
    }
  }

let conf = cmd._autocomplete
  conf = (conf && conf.data) ? conf.data : conf
  handleDataFormat(string, conf, cb)
  return
}

export default autocomplete