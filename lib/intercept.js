/** Intercepts stdout, passes through callback. Also passes console.error through
 *  stdout so it goes to callback too (stdout.write and stderr.write are both refs
 *  to the same stream.write function). Returns an unhook() function.
 *  @param {function} callback @return {function} */
export default function (callback) {
  const oldStdoutWrite = process.stdout.write
  const oldConsoleError = console.error
  process.stdout.write = function (string, ...rest) {
    const args = [interceptor(string), ...rest]
    oldStdoutWrite.apply(process.stdout, args)
  }

  console.error = function (...args) {
    args.unshift('\x1b[31m[ERROR]\x1b[0m')
    console.log(...args)
  }

  function interceptor (string) {
    const result = callback(string)
    // Only intercept the string — preserve trailing newline if original had one.
    if (typeof result === 'string') {
      string = result.replace(/\n$/, '') + (result && (/\n$/).test(string) ? '\n' : '')
    }
    return string
  }

  // Puts things back to original.
  return function unhook () {
    process.stdout.write = oldStdoutWrite
    console.error = oldConsoleError
  }
}
