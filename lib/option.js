/** Initialize a new Option instance. @param {string} flags @param {string} description @param {*} autocomplete */
class Option {
  constructor(flags, description, autocomplete) {
    this.flags = flags
    // required/optional/bool flags derived via bitwise NOT against special characters
    this.required = ~flags.indexOf('<')
    this.optional = ~flags.indexOf('[')
    this.bool = !~flags.indexOf('-no-')
    this.autocomplete = autocomplete
    // If two flags and second is not arg-like, assign first then second.
    flags = flags.split(/[ ,|]+/)
    if (flags.length > 1 && !/^[[<]/.test(flags[1])) {
      this.assignFlag(flags.shift())
    }
    this.assignFlag(flags.shift())
    this.description = description || ''
  }

  /** Return option name. @return {string} */
  name() {
    if (this.long !== undefined) {
      return this.long
        .replace('--', '')
        .replace('no-', '')
    }
    return this.short
      .replace('-', '')
  }

  /** Check if arg matches the short or long flag. @param {string} arg @return {boolean} */
  is(arg) {
    return (arg === this.short || arg === this.long)
  }

  /** Assigned flag to either long or short. @param {string} flag */
  assignFlag(flag) {
    if (flag.startsWith('--')) {
      this.long = flag
    } else {
      this.short = flag
    }
  }
}

export default Option