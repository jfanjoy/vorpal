import Vorpal from '../../lib/vorpal.js'

const vorpal = new Vorpal()

vorpal.command('add [numbers...]', 'Adds numbers together')
  .alias('addition')
  .alias('plus')
  .action(function (args, cb) {
    const numbers = args.numbers
    let sum = 0
    for (let i = 0; i < numbers.length; ++i) {
      sum += parseFloat(numbers[i])
    }
    this.log(sum)
    cb(undefined, sum)
  })

vorpal.command('double [values...]', 'Doubles a value on each tab press')
  .autocompletion(function (text, iteration, cb) {
    if (iteration > 1000000) {
      cb(undefined, ['cows', 'hogs', 'horses'])
    } else {
      let number = String(text).trim()
      if (!isNaN(number)) {
        number = (number < 1) ? 1 : number
        cb(undefined, 'double ' + number * 2)
      } else {
        cb(undefined, 'double 2')
      }
    }
  })
  .action(function (args, cb) {
    cb()
  })

vorpal.command('args [items...]', 'Shows args.')
  .option('-d')
  .option('-a')
  .option('--save')
  .action(function (args, cb) {
    this.log(args)
    cb()
  })

vorpal
  .delimiter('calc:')
  .show()
  .parse(process.argv)
