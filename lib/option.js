class Option {
  constructor(flags, description, autocomplete) {
    this.flags = flags
    this.required = ~flags.indexOf('<')
    this.optional = ~flags.indexOf('[')
    this.bool = !~flags.indexOf('-no-')
    this.autocomplete = autocomplete
    flags = flags.split(/[ ,|]+/)
    if (flags.length > 1 && !/^[[<]/.test(flags[1])) {
      this.assignFlag(flags.shift())
    }
    this.assignFlag(flags.shift())
    this.description = description || ''
  }

  name() {
    if (this.long !== undefined) {
      return this.long
        .replace('--', '')
        .replace('no-', '')
    }
    return this.short
      .replace('-', '')
  }

  is(arg) {
    return (arg === this.short || arg === this.long)
  }

  assignFlag(flag) {
    if (flag.startsWith('--')) {
      this.long = flag
    } else {
      this.short = flag
    }
  }
}

export default Option