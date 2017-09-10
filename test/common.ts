import {Observable, UnregisterFunction} from '../observable'

export function cmp(a: any, b: any) {
  if (a === b) return true
  if (a !== b && (typeof a !== 'object' || typeof b !== 'object')) return false
  if (a == null || b == null) return false

  for (var x in a) {
    if (!cmp(a[x], b[x]))
      return false
  }

  return true
}

export class Calls {
  count = 0
  calls = [] as any[]


  ntimes(times: number): this {
    if (this.count !== times)
      throw new Error(`Expected to be called ${times} times but was called ${this.count} times`)
    this.count = 0
    return this
  }

  with(...args: any[]) {
    for (var call of this.calls) {
      for (var i = 0; i < args.length; i++) {
        if (!cmp(args[i], call[i]))
          throw new Error(`At position ${i}, expected ${JSON.stringify(args[i])} got ${JSON.stringify(call[i])}`)
      }
    }
    this.calls = []
    return this
  }

  callback() {
    var self = this
    return function () {
      self.call.apply(self, arguments)
    }
  }

  call(...args: any[]) {
    this.count++
    this.calls.push(args)
  }

  get was() { return this }
  get called() { return this }

  get once() { return this.ntimes(1) }
  get twice() { return this.ntimes(2) }
  get never() { return this.ntimes(0) }
  get not() { return this.ntimes(0) }
}


////////////////////////////////////////////////////////////////////

var unregs: UnregisterFunction[] = []

export function spyon<T>(obs: Observable<T>) {
  var spy = new Calls()
  unregs.push(obs.addObserver(function (value, old) {
    spy.call(value, old)
  }))
  return spy
}

export namespace spyon {
  export function clean() {
    unregs.forEach(u => u())
    unregs = []
  }
}
