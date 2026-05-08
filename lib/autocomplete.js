import strip from 'strip-ansi'

/** Handles tabbed autocompletion.
 *  - Initial tabbing lists all registered commands.
 *  - Completes a command halfway typed.
 *  - Recognizes options and lists all possible options.
 *  - Recognizes option arguments and lists them.
 *  - Supports cursor positions anywhere in the string.
 *  - Supports piping. */
const autocomplete = {

  exec (str, cb) {
    const self = this
    let input = parseInput(str, (this.parent.ui._activePrompt && this.parent.ui._activePrompt.rl && this.parent.ui._activePrompt.rl.cursor) || (this.parent.ui._activePrompt && this.parent.ui._activePrompt.cursor) || 0)
    const commands = getCommandNames(this.parent.commands)
    const vorpalMatch = getMatch(input.context, commands, { ignoreSlashes: true })
    let freezeTabs = false

    function end (str) {
      const res = handleTabCounts.call(self, str, freezeTabs)
      cb(undefined, res)
    }

    function evaluateTabs (input) {
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
        const dataMatch = getMatch(input.context, data)
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
    const arrX = [...arr]
    let strX = String(str)

    let prefix = ''

    if (options.ignoreSlashes !== true) {
      const parts = strX.split('/')
      strX = parts.pop()
      prefix = parts.join('/')
      prefix = parts.length > 0 ? prefix + '/' : prefix
    }

    const matches = []
    for (let i = 0; i < arrX.length; i++) {
      if (strip(arrX[i]).slice(0, strX.length) === strX) {
        matches.push(arrX[i])
      }
    }
    if (matches.length === 1) {
      // If we have a slash, don't add a space after match.
      const space = (String(strip(matches[0])).slice(strip(matches[0]).length - 1) === '/') ? '' : ' '
      return prefix + matches[0] + space
    } else if (matches.length === 0) {
      return undefined
    } else if (strX.length === 0) {
      return matches
    }

    const longestMatchLength = matches
      .reduce(function (previous, current) {
        for (let i = 0; i < current.length; i++) {
          if (previous[i] && current[i] !== previous[i]) {
            return current.slice(0, i)
          }
        }
        return previous
      }).length

    if (longestMatchLength === strX.length) {
      // Couldn't resolve any further, return all matches.
      return matches
    }

    // Return the longest matching portion along with the prefix.
    return prefix + matches[0].slice(0, longestMatchLength)
  }
}

/** Tracks how many times tab was pressed based on whether the UI changed.
 *  @param {string} str @param {boolean} freezeTabs @return {string|string[]|undefined} */
function handleTabCounts (str, freezeTabs) {
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

/** Looks for a potential exact match based on given data.
 *  @param {string} ctx @param {string[]} data @param {object} [options] @return {string|string[]|undefined} */
function getMatch (ctx, data, options) {
  const len = ctx.length
  // Look for a command match, eliminating and then re-introducing leading spaces.
  const trimmed = ctx.replace(/^\s+/g, '')
  let match = autocomplete.match(trimmed, data.slice(), options)
  if (Array.isArray(match)) {
    return match
  }
  // Put the leading spaces back in.
  const prefix = ' '.repeat(len - trimmed.length)
  if (match) {
    match = prefix + match
    return match
  }
  return undefined
}

/** Takes the input object and assembles the final result to display on the screen.
 *  @param {object} input @return {string|string[]} */
function assembleInput (input) {
  if (Array.isArray(input.context)) {
    return input.context
  }
  const result =
    (input.prefix || '') +
    (input.context || '') +
    (input.suffix || '')
  return strip(result)
}

/** Reduces an array of possible matches to list based on a given string.
 *  @param {string} str @param {string[]} data @return {string[]} */
function filterData (str, data) {
  data = data || []
  let ctx = String(str || '').trim()
  const slashParts = ctx.split('/')
  ctx = slashParts.pop()
  const wordParts = String(ctx).trim().split(' ')
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

/** Takes the user's current prompt string and breaks it into its integral parts
 *  for analysis and modification.
 *  @param {string} str @param {number} idx @return {object} */
function parseInput (str, idx) {
  const raw = String(str || '')
  const sliced = raw.slice(0, idx)
  const sections = sliced.split('|')
  let prefix = (sections.slice(0, sections.length - 1) || [])
  prefix.push('')
  prefix = prefix.join('|')
  const suffix = getSuffix(raw.slice(idx))
  const context = sections[sections.length - 1]
  return ({
    raw,
    prefix,
    suffix,
    context
  })
}

/** Takes the context after a matched command and figures out the applicable
 *  context, including assigning its role such as being an option parameter.
 *  @param {object} input @return {object} */
function parseMatchSection (input) {
  const parts = (input.context || '').split(' ')
  const last = parts.pop()
  const beforeLast = strip(parts[parts.length - 1] || '').trim()
  if (beforeLast.slice(0, 1) === '-') {
    input.option = beforeLast
  }
  input.context = last
  input.prefix = (input.prefix || '') + parts.join(' ') + ' '
  return input
}

/** Returns a cleaned up version of the remaining text to the right of the cursor.
 *  @param {string} suffix @return {string} */
function getSuffix (suffix) {
  suffix = (suffix.slice(0, 1) === ' ')
    ? suffix
    : suffix.replace(/.+?(?=\s)/, '')
  suffix = suffix.slice(1, suffix.length)
  return suffix
}

/** Compile all available commands and aliases in alphabetical order.
 *  @param {Command[]} cmds @return {string[]} */
function getCommandNames (cmds) {
  let commands = cmds.map(c => c._name)
  commands = commands.concat(...cmds.map(c => c._aliases))
  commands.sort()
  return commands
}

/** When we know that we've exceeded a known command, grab on to that command
 *  and return it, fixing the overall input context at the same time.
 *  @param {object} input @param {string[]} commands @return {object} */
function getMatchObject (input, commands) {
  const len = input.context.length
  const trimmed = String(input.context).replace(/^\s+/g, '')
  let prefix = ' '.repeat(len - trimmed.length)
  let match
  let suffix
  commands.forEach(function (cmd) {
    const nextChar = trimmed.slice(cmd.length, cmd.length + 1)
    if (trimmed.slice(0, cmd.length) === cmd && String(cmd).trim() !== '' && nextChar === ' ') {
      match = cmd
      suffix = trimmed.slice(cmd.length)
      prefix += trimmed.slice(0, cmd.length)
    }
  })

  let matchObject = (match)
    ? this.parent.commands.find(c => c._name === String(match).trim())
    : undefined

  if (!matchObject) {
    this.parent.commands.forEach(function (cmd) {
      if ((cmd._aliases || []).indexOf(String(match).trim()) > -1) {
        matchObject = cmd
      }
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

/** Takes a known matched command, and reads the applicable data by calling
 *  its autocompletion instructions, whether it is the command's autocompletion
 *  or one of its options.
 *  @param {object} input @param {function} cb */
function getMatchData (input, cb) {
  const string = input.context
  const cmd = input.match
  const midOption = (String(string).trim().slice(0, 1) === '-')
  const afterOption = (input.option !== undefined)
  if (midOption === true && (!cmd._allowUnknownOptions)) {
    const results = []
    for (let i = 0; i < cmd.options.length; ++i) {
      const long = cmd.options[i].long
      const short = cmd.options[i].short
      if (!long && short) {
        results.push(short)
      } else if (long) {
        results.push(long)
      }
    }
    cb(results)
    return
  }

  function handleDataFormat (str, config, callback) {
    let data = []
    if (Array.isArray(config)) {
      data = config
    } else if (typeof config === 'function') {
      const cbk = (config.length < 2)
        ? function () {}
        : function (res) {
          callback(res || [])
        }
      const res = config(str, cbk)
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
  }

  if (afterOption === true) {
    const opt = strip(input.option).trim()
    const shortMatch = cmd.options.find(o => o.short === opt)
    const longMatch = cmd.options.find(o => o.long === opt)
    const match2 = longMatch || shortMatch
    if (match2) {
      const config = match2.autocomplete
      handleDataFormat(string, config, cb)
      return
    }
  }

  let conf = cmd._autocomplete
  conf = (conf && conf.data) ? conf.data : conf
  handleDataFormat(string, conf, cb)
}

export default autocomplete
