
export type UnregisterFunction = () => void

export type Observer<T, U = void> = (newval: T, oldval: T) => U

export type MaybeObservable<T> = T | Observable<T>

export type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};


/**
 * Options that determine how we are to listen to different types of updates.
 */
export interface ObserverOptions {

  /**
   * Call the observer after this many milliseconds after the last update.
   */
  debounce?: number

  /**
   * Call the observer at most every this milliseconds.
   */
  throttle?: number

  /**
   * Do not call the observer immediately after being added.
   */
  changesOnly?: boolean

}


export function debounce<T extends Function>(fn: T, ms: number): T {
  var timeout: number|null = null
  return function (this: any, ...a: any[]) {
    var self: any = this
    if (timeout !== null) clearTimeout(timeout)
    timeout = setTimeout(function () {
      timeout = null
      fn.apply(self, a)
    }, ms)
  } as any as T
}


export function throttle<T extends Function>(fn: T, ms: number): T {
  var timeout: number|null = null
  var last_this: any = null
  var last_args: any = null
  var last_call: number | null = null

  return function (this: any, ...a: any[]) {
    var now = Date.now()

    if (last_call == null || now - last_call >= ms && timeout == null) {
      last_call = now
      fn.apply(this, a)
    } else {
      last_this = this
      last_args = a
      if (timeout != null) return
      timeout = setTimeout(function () {
        last_call = Date.now()
        fn.apply(last_this, last_args)
        timeout = null
      }, ms - (now - last_call))
    }
  } as any as T

}

export function make_observer<T, U>(fn: Observer<T, U>, init: T, options?: ObserverOptions) {
  var last_val: T = init

  function observer(new_value: T) {
    const res = fn(new_value, last_val)
    last_val = new_value
    return res
  }

  if (typeof options !== 'undefined' && options.debounce)
    return debounce(observer, options.debounce)

  if (typeof options !== 'undefined' && options.throttle)
    return throttle(observer, options.throttle)

  return observer
}



export function memoize<A, B>(fn: (arg: A, old: A) => B): (arg: A, old: A) => B {
  var last_value: A
  var last_value_bis: A
  var last_result: B
  return function (arg: A, old: A): B {
    if (arg === last_value && old === last_value_bis)
      return last_result
    last_value = arg
    last_value_bis = old
    last_result = fn(arg, old)
    return last_result
  }
}

export type ObsObject = {observable: Observable<any>, observer: Observer<any>, unreg?: UnregisterFunction}


/**
 *
 */
export class Observable<T> {

  protected readonly value: T
  protected observers: ((val: T) => void)[] = []
  protected observed: ObsObject[] = []
  protected paused_notify = -1

  constructor(value: T) {
    this.value = value
  }

  /**
   * Return the underlying value of this Observable
   *
   * NOTE: treat this value as being entirely readonly !
   */
  get(): T {
    return this.value
  }

  /**
   *
   * @param value
   */
  set(value: T): void {
    const old_value = this.value;
    (this.value as any) = value
    if (old_value !== value) this.notify()
  }

  assign(partial: RecursivePartial<T>): void {

  }

  /**
   * Get a shallow copy of the current value. Used for transforms.
   */
  getShallowCopy(): T {

    const value = this.get()

    if (value instanceof Array) {
      return value.slice() as any
    }

    if (value instanceof Object) {
      var descrs: {[name: string]: PropertyDescriptor} = {}

      for (var prop of Object.getOwnPropertyNames(value)) {
        var desc = Object.getOwnPropertyDescriptor(value, prop)
        // Skip unconfigurable objects.
        if (!desc.configurable)
          continue
        descrs[prop] = desc
      }

      for (var sym of Object.getOwnPropertySymbols(value)) {
        desc = Object.getOwnPropertyDescriptor(value, sym)
        if (!desc.configurable)
          continue
        descrs[sym] = desc
      }

      var clone = Object.create(
        value.constructor.prototype,
        descrs
      )
      return clone
    }

    return value
  }

  pause() {
    if (this.paused_notify === -1)
      this.paused_notify = 0
  }

  resume() {
    const frozen = this.paused_notify
    this.paused_notify = -1
    if (frozen > 0)
      this.notify()
  }

  /**
   * Notify all the registered observers that is Observable changed
   * value.
   *
   * @param old_value The old value of this observer
   */
  notify() {
    if (this.paused_notify > -1) {
      this.paused_notify++
    } else {
      for (var ob of this.observers)
        ob(this.value)
    }
  }

  /**
   * Add an observer.
   */
  addObserver(fn: Observer<T>, options?: ObserverOptions): UnregisterFunction {

    const real_fn = make_observer(fn, this.get(), options)
    this.observers.push(real_fn)

    if (typeof options === 'function' || options && !options.changesOnly) {
      // First call
      const obj = this.get()
      fn(obj, obj)
    }

    // Subscribe to the observables we are meant to subscribe to.
    if (this.observers.length === 1) {
      this.observed.forEach(obj => {
        obj.unreg = obj.observable.addObserver(obj.observer)
      })
    }

    return this.removeObserver.bind(this, real_fn) as UnregisterFunction
  }

  /**
   *
   * @param fn
   */
  removeObserver(fn: Observer<T>): void {
    this.observers = this.observers.filter(f => f !== fn)

    if (this.observers.length === 0) {
      // Since we're not being watched anymore we unregister
      // ourselves from the observables we were watching to
      // have them lose their reference to us and thus allow
      // us to be garbage collected if needed.
      this.observed.forEach(o => o.unreg!())
    }
  }

  /**
   * Observe another observable only when this observer itself
   * is being observed.
   */
  observe<U>(observable: Observable<U>, observer: Observer<U>) {
    const obj = {observable, observer} as ObsObject
    this.observed.push(obj)

    if (this.observers.length > 0) {
      // start observing immediately if we're already observed
      obj.unreg = obj.observable.addObserver(obj.observer)
    }
  }

  /**
   * Use this only to tell typescript's typing system that the new
   * variable should not be used to perform transforms on this observable
   */
  readonly(): ReadonlyObservable<T> {
    return this as any
  }

  /**
   *
   * @param fnget
   * @param fnset
   */
  tf<U>(fnget: Observer<T, U>): ReadonlyObservable<U>
  tf<U>(fnget: Observer<T, U>, fnset: Observer<U>): Observable<U>
  tf<U>(fnget: Observer<T, U>, fnset?: Observer<U>): Observable<U> {

    const fn = make_observer(memoize(fnget), this.get())

    var obs = new VirtualObservable<U>(() => {
      return fn(this.get())
    }, fnset)

    obs.observe(this, () => obs.refresh())

    return obs
  }

  p<U extends object, K extends keyof U>(this: Observable<U>, key: K): Observable<U[K]>
  p<U>(this: Observable<{[key: string]: U}>, key: MaybeObservable<string>): Observable<U | undefined>
  p<U>(this: Observable<U[]>, key: MaybeObservable<number>): Observable<U | undefined>
  p(this: Observable<any>, key: MaybeObservable<number|string>): Observable<any> {

    const fn = make_observer((arr) => arr[o.get(key)], this.get())

    var obs = new VirtualObservable(() => {
      return fn(this.get())
    }, item => {
      const arr = this.getShallowCopy()
      arr[o.get(key)] = item
      this.set(arr)
    })

    obs.observe(this, () => obs.refresh())
    if (key instanceof Observable)
      obs.observe(key, () => obs.refresh())

    return obs
  }

  /**
   *
   * @param this
   * @param fn
   */
  filter<U>(this: Observable<U[]>, fn: (item: U, index: number, array: U[]) => boolean): Observable<U[]> {
    var indexes: number[] = []
    return this.tf(
      memoize((arr) => {
        indexes = []
        return arr.filter((item, index) => {
          var res = fn(item, index, arr)
          if (res) indexes.push(index)
          return res
        })
      }),
      (transformed_array, old_transformed) => {
        const len = transformed_array.length

        if (old_transformed && len !== old_transformed.length)
            throw new Error(`filtered arrays may not change size by themselves`)

        var local_array: U[] = this.getShallowCopy()
        for (var i = 0; i < len; i++) {
          local_array[indexes[i]] = transformed_array[i]
        }
        this.set(local_array)
        return transformed_array
      }
    )
  }

  //////////////////////////////////////////////////////////////
  /////////// The following are methods that provide

  /**
   * true when this._value > value
   */
  gt(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs > v.rhs)
  }

  greaterThan(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return this.gt(value)
  }

  /**
   * true when this._value < value
   */
  lt(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs < v.rhs)
  }

  lesserThan(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return this.lt(value)
  }

  /**
   * true when this._value === value
   */
  eq(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs === v.rhs)
  }

  equal(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return this.eq(value)
  }


  /**
   * true when this._value !== value
   */
  ne(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return o.merge({lhs: this, rhs: value},).tf(v => v.lhs !== v.rhs)
  }

  notEqual(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return this.ne(value)
  }

  /**
   * true when this._value >= value
   */
  gte(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs >= v.rhs)
  }

  greaterOrEqual(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return this.gte(value)
  }

  /**
   * true when this._value <= value
   */
  lte(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs <= v.rhs)
  }

  lesserOrEqual(value: MaybeObservable<T>): ReadonlyObservable<boolean> {
    return this.lte(value)
  }

  /**
   * true when this._value is null or undefined
   */
  isNull(): ReadonlyObservable<boolean> {
    return this.tf(val => val == null)
  }

  /**
   * true when this._value is neither null nor undefined
   */
  isNotNull(): ReadonlyObservable<boolean> {
    return this.tf(val => val != null)
  }

  /**
   * true when this._value is strictly undefined
   */
  isUndefined(): ReadonlyObservable<boolean> {
    return this.tf(val => val === undefined)
  }

  /**
   * true when this._value is strictly not undefined
   */
  isDefined(): ReadonlyObservable<boolean> {
    return this.tf(val => val !== undefined)
  }

  /**
   * true when this._value is === false
   */
  isFalse(this: Observable<boolean>): ReadonlyObservable<boolean> {
    return this.tf(val => val as any === false)
  }

  /**
   * true when this._value === true
   */
  isTrue(this: Observable<boolean>): ReadonlyObservable<boolean> {
    return this.tf(val => val as any === true)
  }

  /**
   * true when this._value would be false in an if condition
   */
  isFalsy(): ReadonlyObservable<boolean> {
    return this.tf(val => !val)
  }

  /**
   * true when this._value would be true in an if condition
   */
  isTruthy(): ReadonlyObservable<boolean> {
    return this.tf(val => !!val)
  }

  /**
   * Set up an observable that is true when this observable or
   * any of the provided observables is true.
   */
  or(...args : MaybeObservable<any>[]) : ReadonlyObservable<boolean> {
    return args.reduce((acc, arg) => arg.or(acc), this)
  }

  /**
   * True when this and all the values provided in args are true.
   */
  and(...args: MaybeObservable<any>[]) : ReadonlyObservable<boolean> {
    return args.reduce((acc, arg) => arg.and(acc), this)
  }

}


/**
 * An observable that does not its own value, but that depends
 * from outside getters and setters.
 */
export class VirtualObservable<T> extends Observable<T> {

  constructor(
    protected fnget: () => T,
    protected fnset?: Observer<T>
  ) {
    super(undefined!)
  }

  refresh() {
    const val = this.fnget()
    const old = this.value;
    (this.value as any) = val
    if (old !== val) this.notify()
  }

  get(): T {
    if (this.observers.length === 0)
      this.refresh()
    return this.value
  }

  set(value: T): void {
    // Missing a way of not recursing infinitely.
    const old_value = this.value;
    this.fnset!(value, old_value)
  }

}


/**
 * An Observable that cannot be set in any way.
 */
export interface ReadonlyObservable<A> extends Observable<A> {

  set(a: never): never

  p<U extends object, K extends keyof U>(this: Observable<U>, key: K): ReadonlyObservable<U[K]>
  p<U>(this: Observable<{[key: string]: U}>, key: MaybeObservable<string>): ReadonlyObservable<U>
  p<U>(this: Observable<U[]>, key: number): ReadonlyObservable<U>

  filter<U>(this: Observable<U[]>, fn: (item: U, index: number, array: U[]) => boolean): ReadonlyObservable<U[]>

  add: void
  substract: void
  toggle: void
}


/**
 *
 * @param arg
 */
export function o<T>(arg: MaybeObservable<T>): Observable<T> {
  return arg instanceof Observable ? arg : new Observable(arg)
}


export type MaybeObservableObject<T> = { [P in keyof T]:  MaybeObservable<T[P]>}


export namespace o {

  export function get<A>(arg: MaybeObservable<A>): A {
    return arg instanceof Observable ? arg.get() : arg
  }

  export function and(...args: Observable<any>[]): Observable<boolean> {
    if (args.length === 1)
      return args[0].isTruthy()
    return args.slice(1).reduce((lhs, rhs) =>
      lhs.and(rhs)
    , args[0])
  }

  export function or(...args: Observable<any>[]): Observable<boolean> {
    if (args.length === 1)
      return args[0].isTruthy()
    return args.slice(1).reduce((lhs, rhs) =>
      lhs.or(rhs)
    , args[0])
  }

  export function merge<A extends object>(obj: MaybeObservableObject<A>): Observable<A> {

    function _get(): A {
      const res = {} as A

      for (var name in obj) {
        res[name] = o.get(obj[name])
      }

      return res
    }

    function _set(_obj: A): A {
      for (var name in _obj) {
        var ob = obj[name]
        if (ob instanceof Observable) {
          ob.set(_obj[name])
        }
      }
      return _obj
    }

    const res = new VirtualObservable(_get, _set)

    for (var name in obj) {
      var ob = obj[name]
      if (ob instanceof Observable) {
        res.observe(ob, () => res.refresh())
      }
    }

    return res

  }

  export function observe<A>(obs: MaybeObservable<A>, fn: Observer<A>): UnregisterFunction {
    if (obs instanceof Observable) {
      return obs.addObserver(fn)
    }

    fn(obs, obs)
    return function () { }
  }

}
