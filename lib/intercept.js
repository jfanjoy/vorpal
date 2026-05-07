export default function (callback) {
  const oldStdoutWrite = process.stdout.write
  const oldConsoleError = console.error
  const originalWrite = process.stdout.write
  process.stdout.write = function (string, ...rest) {
    const args = [interceptor(string), ...rest]
    originalWrite.apply(process.stdout, args)
  }

  const originalError = console.error
  console.error = function (...args) {
    args.unshift('\x1b[31m[ERROR]\x1b[0m')
    console.log(...args)
  }

  function interceptor(string) {
    const result = callback(string)
    if (typeof result === 'string') {
      string = result.replace(/\n$/, '') + (result && (/\n$/).test(string) ? '\n' : '')
    }
    return string
  }

  return function unhook() {
    process.stdout.write = oldStdoutWrite
    console.error = oldConsoleError
  }
}