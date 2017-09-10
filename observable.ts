
export type UnregisterFunction = () => void

export type ObserverFunction<T, U = void> = (newval: T, oldval: T) => U

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

}


export class Observer<A, B = void> {

  old_value: A
  // saved value exists solely to
  protected last_value: A | undefined
  protected last_result: B
  protected timeout: number | undefined

  constructor(public fn: ObserverFunction<A, B>, public observable: Observable<A>) {

  }

  call(new_value: A): B {
    if (this.isPaused()) {
      this.last_value = new_value
      return this.last_result
    }
    const old = this.old_value
    this.old_value = new_value
    const res = this.fn(new_value, old)
    this.last_result = res
    return res
  }

  isPaused() {
    return this.timeout === -1
  }

  pause() {
    this.timeout = -1
  }

  resume() {
    const val = this.last_value
    this.last_value = undefined
    this.timeout = undefined
    return this.call(val!)
  }

  startObserving() {
    this.observable.addObserver(this)
  }

  stopObserving() {
    this.observable.removeObserver(this)
  }
}


export class ThrottleObserver<A, B> extends Observer<A, B> {

  saved_result: B

  constructor(fn: ObserverFunction<A, B>, observable: Observable<A>, public throttle: number) {
    super(fn, observable)
  }

  call(new_value: A): B {
    // FIXME not implemented !
    return this.saved_result
  }

}


export class DebounceObserver<A, B> extends Observer<A, B> {

  saved_result: B

  constructor(fn: ObserverFunction<A, B>, observable: Observable<A>, public debounce: number) {
    // FIXME not implemented !
    super(fn, observable)
  }

  call(): B {
    return this.saved_result
  }

}

export function make_observer<A, B>(obs: Observable<A>, fn: ObserverFunction<A, B>, options?: ObserverOptions) {
  if (options && options.debounce)
    return new DebounceObserver(fn, obs, options.debounce)
  if (options && options.throttle)
    return new ThrottleObserver(fn, obs, options.throttle)
  return new Observer(fn, obs)
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


export interface Clonable {
  clone(): this
}

export function isClonable(v: any): v is Clonable {
  return v instanceof Object && typeof v.constructor.prototype.clone === 'function'
}

/**
 * Create a shallow copy of a value.
 *
 * This copy will take all its attributes and put them in a new object.
 * For objects that aren't array, it will try to take to create an object
 * with the same constructor.
 *
 * If the object had a clone() method, it will use it instead.
 *
 * @param value The value to clone
 * @param deep
 */
export function clone<A>(value: A, deep = false): A {

  if (isClonable(value))
    return value.clone()

  if (value instanceof Array) {
    // ???
    if (deep) return value.map(v => clone(v, true)) as any
    return value.slice() as any
  }

  if (typeof value === 'object') {
    var descrs: {[name: string]: PropertyDescriptor} = {}

    for (var prop of Object.getOwnPropertyNames(value)) {
      var desc = Object.getOwnPropertyDescriptor(value, prop)
      // Skip unconfigurable objects.
      if (!desc.configurable)
        continue
      if (deep) desc.value = clone(desc.value)
      descrs[prop] = desc
    }

    for (var sym of Object.getOwnPropertySymbols(value)) {
      desc = Object.getOwnPropertyDescriptor(value, sym)
      if (!desc.configurable)
        continue
      if (deep) desc.value = clone(desc.value)
      descrs[sym] = desc
    }

    var cloned = Object.create(
      value.constructor.prototype,
      descrs
    )
    return cloned
  }

  return value
}


/**
 *
 */
export class Observable<T> {

  protected readonly value: T
  protected observers: Observer<T, any>[] = []
  protected observed: Observer<any, any>[] = []
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
    return clone(this.get())
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
      this.paused_notify = 1
    } else {
      for (var ob of this.observers)
        ob.call(this.value)
    }
  }

  /**
   * Add an observer.
   */
  addObserver<U = void>(obs: Observer<T, U>): Observer<T, U>
  addObserver<U = void>(fn: ObserverFunction<T, U>, options?: ObserverOptions): Observer<T, U>
  addObserver<U = void>(_ob: ObserverFunction<T, U> | Observer<T, U>, options?: ObserverOptions): Observer<T, U> {

    const ob = typeof _ob === 'function' ? make_observer(this, _ob, options) : _ob
    ob.old_value = this.get()
    this.observers.push(ob)

    // Subscribe to the observables we are meant to subscribe to.
    if (this.observers.length === 1) {
      this.observed.forEach(observer => { observer.startObserving() })
    }

    return ob
  }

  /**
   *
   * @param ob
   */
  removeObserver(ob: Observer<T, any>): void {
    this.observers = this.observers.filter(ob => ob !== ob)

    if (this.observers.length === 0) {
      // Since we're not being watched anymore we unregister
      // ourselves from the observables we were watching to
      // have them lose their reference to us and thus allow
      // us to be garbage collected if needed.
      this.observed.forEach(o => o.stopObserving())
    }
  }

  /**
   * Observe another observable only when this observer itself
   * is being observed.
   */
  observe<U, V = void>(observable: Observable<U>, observer: Observer<U, V>): Observer<U, V>
  observe<U, V = void>(observable: Observable<U>, observer: ObserverFunction<U, V>, options?: ObserverOptions): Observer<U, V>
  observe<U, V = void>(observable: Observable<U>, _observer: ObserverFunction<U, V> | Observer<U, V>, options?: ObserverOptions) {
    const observer = typeof _observer === 'function' ? make_observer(observable, _observer, options) : _observer
    this.observed.push(observer)

    if (this.observers.length > 0) {
      // start observing immediately if we're already being observed
      observer.startObserving()
    }

    return observer
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
  tf<U>(fnget: ObserverFunction<T, U>): ReadonlyObservable<U>
  tf<U>(fnget: ObserverFunction<T, U>, fnset: ObserverFunction<U>): Observable<U>
  tf<U>(fnget: ObserverFunction<T, U>, fnset?: ObserverFunction<U>): Observable<U> {

    const fn = new Observer(memoize(fnget), this)

    var obs = new VirtualObservable<U>(() => {
      return fn.call(this.get())
    }, fnset)

    obs.observe(this, () => obs.refresh())

    return obs
  }

  p<U extends object, K extends keyof U>(this: Observable<U>, key: K): Observable<U[K]>
  p<U>(this: Observable<{[key: string]: U}>, key: MaybeObservable<string>): Observable<U | undefined>
  p<U>(this: Observable<U[]>, key: MaybeObservable<number>): Observable<U | undefined>
  p(this: Observable<any>, key: MaybeObservable<number|string>): Observable<any> {

    const fn = new Observer<any, any>((arr) => arr[o.get(key)], this)

    var obs = new VirtualObservable(() => {
      return fn.call(this.get())
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
    protected fnset?: ObserverFunction<T>
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


  export function observe<A, B = void>(obs: MaybeObservable<A>, fn: ObserverFunction<A, B>, call_immediately = true): Observer<A, B> | null {
    if (obs instanceof Observable) {
      return obs.addObserver(fn)
    }

    if (call_immediately)
      fn(obs, obs)
    return null
  }

}
