
import * as clone from 'clone'

export type UnregisterFunction = () => void

export type ObserverFunction<T, U = void> = (newval: T, oldval: (T | undefined)) => U

export type MaybeObservable<T> = T | Observable<T>

export type RecursivePartial<T> = {
  [P in keyof T]?: RecursivePartial<T[P]>;
};

export type ObservableProxy<T> = Observable<T> & {[P in keyof T]: ObservableProxy<T[P]>}

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

  leading?: boolean

}


export interface FnOptions {
  ms: number
  leading?: boolean
}


/**
 *
 */
export function debounce<A, B, C, D, E, Z, Fn = (a: A, b: B, c: C, d: D, e: E) => Z>(fn: Fn, opts: FnOptions): Fn
export function debounce<A, B, C, D, Z, Fn = (a: A, b: B, c: C, d: D) => Z>(fn: Fn, opts: FnOptions): Fn
export function debounce<A, B, C, Z, Fn = (a: A, b: B, c: C) => Z>(fn: Fn, opts: FnOptions): Fn
export function debounce<A, B, Z, Fn = (a: A, b: B) => Z>(fn: Fn, opts: FnOptions): Fn
export function debounce<A, Z, Fn = (a: A) => Z>(fn: Fn, opts: FnOptions): Fn
export function debounce(opts: FnOptions): (target: any, key: string, desc: PropertyDescriptor) => void
export function debounce(fn: any, opts: FnOptions = {ms: 1, leading: false}): any {
  var timer: number
  var prev_res: any
  var lead = false

  // Called as a method decorator.
  if (arguments.length === 1) {
    opts = fn
    return function (target: any, key: string, desc: PropertyDescriptor) {
      var original = desc.value
      desc.value = debounce(original, opts!)
    }
  }

  return function (this: any, ...args: any[]) {
    if (opts.leading && !lead && !timer) {
      prev_res = fn.apply(this, args)
      lead = true
    }

    if (timer) {
      lead = false
      clearTimeout(timer)
    }

    timer = setTimeout(() => {
      if (!lead) { prev_res = fn.apply(this, args) }
      lead = false
    }, opts!.ms)
    return prev_res
  }
}


export class Observer<A, B = void> {

  protected old_value: A
  // saved value exists solely to
  protected last_result: B
  readonly observing = false

  constructor(public fn: ObserverFunction<A, B>, public observable: Observable<A>) { }

  call(new_value: A): B {
    const old = this.old_value

    if (typeof new_value !== 'undefined' && old !== new_value) {
      this.old_value = new_value
      const res = this.fn(new_value, old)
      this.last_result = res
      return res
    }

    return this.last_result
  }

  startObserving() {
    (this.observing as any) = true
    this.observable.addObserver(this)
    this.call(o.get(this.observable))
  }

  stopObserving() {
    (this.observing as any) = false
    this.observable.removeObserver(this)
  }
}


export class ThrottleObserver<A, B> extends Observer<A, B> {

  last_call: number
  protected last_value: A | undefined
  timeout: number | null

  constructor(fn: ObserverFunction<A, B>, observable: Observable<A>, public throttle: number, public leading: boolean) {
    super(fn, observable)
  }

  call(new_value: A): B {
    const now = Date.now()

    var result = this.last_result
    this.last_value = new_value

    if (!this.last_call || now - this.last_call >= this.throttle) {
      result = super.call(new_value)
      this.last_result = result
    } else {
      if (!this.timeout) {
        this.timeout = setTimeout(() => {
          super.call(this.last_value!)
          this.last_call = Date.now()
          this.timeout = null
        }, this.throttle - (now - this.last_call))
      }
    }
    this.last_call = now

    return result
  }

}


export class DebounceObserver<A, B> extends Observer<A, B> {

  saved_result: B
  protected last_value: A | undefined
  timeout: number | null = null

  constructor(fn: ObserverFunction<A, B>, observable: Observable<A>, public debounce: number, public leading: boolean) {
    super(fn, observable)
  }

  call(new_value: A): B {
    this.last_value = new_value
    if (this.timeout != null) {
      clearTimeout(this.timeout)
    }

    this.timeout = setTimeout(() => {
      this.saved_result = super.call(this.last_value!)
    })

    return this.saved_result
  }

}


export function assign<A>(value: A, assignement: RecursivePartial<A>): A {
  if (typeof assignement !== 'object' || assignement.constructor !== Object)
    return assignement as any

  if (typeof assignement === 'object') {
    var cloned = clone(value, true, 1) // shallow clone

    for (var name in assignement) {
      cloned[name] = assign(cloned[name], assignement[name]!)
    }

    return cloned
  } else {
    return value
  }
}


export function map<T, U>(arr: T[], fn: (item: T, index: number, arr: T[]) => U) {
  var res: U[] = []
  var len = arr.length
  for (var i = 0; i < len; i++)
    res.push(fn(arr[i], i, arr))
  return res
}

export function filter<T>(arr: T[], fn: (item: T, index: number, arr: T[]) => boolean): T[] {
  var res: T[] = []
  var len = arr.length
  for (var i = 0; i < len; i++) {
    var item = arr[i]
    if (fn(item, i, arr))
      res.push(item)
  }
  return res
}

export function foreach<T>(arr: T[], fn: (item: T, index: number, arr: T[]) => void): void {
  var l = arr.length
  for (var i = 0; i < l; i++)
    fn(arr[i], i, arr)
}

export class Observable<T> {
  protected __observers: Observer<T, any>[] = []
  protected __observed: Observer<any, any>[] = []
  protected __paused_notify = -1

  // protected readonly value: T
  constructor(protected readonly __value: T) {
    this.__value = __value
  }

  stopObservers() {
    for (var observer of this.__observers) {
      observer.stopObserving()
    }
    for (observer of this.__observed) {
      observer.stopObserving()
    }
  }

  startObservers() {
    for (var observer of this.__observers) {
      observer.startObserving()
    }
    if (this.__observers.length > 0) {
      for (observer of this.__observed) {
        observer.startObserving()
      }
    }
  }

  /**
   * Return the underlying value of this Observable
   *
   * NOTE: treat this value as being entirely readonly !
   */
  get(): T {
    return this.__value
  }

  /**
   * Get a shallow copy of the current value. Used for transforms.
   */
  getShallowClone(circular = false): T {
    return clone(this.get(), circular, 1)
  }

  getClone(circular = false): T {
    return clone(this.get(), circular)
  }

  /**
   *
   * @param value
   */
  set(value: T): void {
    (this.__value as any) = value
    this.notify()
  }

  assign(partial: RecursivePartial<T>): void {
    this.set(assign(this.get(), partial))
  }

  pause() {
    this.stopObservers()
    if (this.__paused_notify === -1)
      this.__paused_notify = 0
  }

  resume() {
    this.__paused_notify = -1
    this.startObservers()
  }

  /**
   * Notify all the registered observers that is Observable changed
   * value.
   *
   * @param old_value The old value of this observer
   */
  notify() {
    if (this.__paused_notify > -1) {
      this.__paused_notify = 1
    } else {
      for (var ob of this.__observers)
        ob.call(this.__value)
    }
  }

  /**
   * Create an observer bound to this observable, but do not start it.
   * For it to start observing, one needs to call its `startObserving()` method.
   *
   * @param fn The function to be called by the observer when the value changes
   * @param options
   */
  createObserver<U = void>(fn: ObserverFunction<T, U>, options: ObserverOptions = {}): Observer<T, U> {
    if (options.debounce)
      return new DebounceObserver(fn, this, options.debounce, !!options.leading)
    if (options.throttle)
      return new ThrottleObserver(fn, this, options.throttle, !!options.leading)
    return new Observer(fn, this)
  }

  /**
   * Add an observer to this observable. If there were no observers and this Observable
   * observes another Observable, then its own observers to this observable are started.
   *
   * This method is called by `Observer#startObserving()` and is not meant to be called
   * directly.
   *
   * @returns The newly created observer if a function was given to this method or
   *   the observable that was passed.
   */
  addObserver<U = void>(fn: ObserverFunction<T, U>, options?: ObserverOptions): Observer<T, U>
  addObserver<U = void>(obs: Observer<T, U>): Observer<T, U>
  addObserver<U = void>(_ob: ObserverFunction<T, U> | Observer<T, U>, options?: ObserverOptions): Observer<T, U> {

    const ob = typeof _ob === 'function' ? this.createObserver(_ob, options) : _ob

    this.__observers.push(ob)

    // Subscribe to the observables we are meant to subscribe to.
    if (this.__observers.length === 1) {
      const _obs = this.__observed
      for (var i = 0; i < _obs.length; i++) {
        _obs[i].startObserving()
      }
    }

    return ob
  }

  /**
   * Remove an observer from this observable. This means the Observer will not
   * be called anymore when this Observable changes.
   * @param ob The observer
   */
  removeObserver(ob: Observer<T, any>): void {
    var _new_obs: Observer<T, any>[] = []
    for (var _o of this.__observers)
      if (_o !== ob)
        _new_obs.push(_o)
    this.__observers = _new_obs

    if (this.__observers.length === 0) {
      // Since we're not being watched anymore we unregister
      // ourselves from the observables we were watching to
      // have them lose their reference to us and thus allow
      // us to be garbage collected if needed.
      const _obs = this.__observed
      const len = _obs.length
      for (var i = 0; i < len; i++)
        _obs[i].stopObserving()
    }
  }

  /**
   * Observe another observable only when this observer itself
   * is being observed.
   */
  observe<U, V = void>(observable: Observable<U>, observer: Observer<U, V>): Observer<U, V>
  observe<U, V = void>(observable: Observable<U>, observer: ObserverFunction<U, V>, options?: ObserverOptions): Observer<U, V>
  observe<U, V = void>(observable: Observable<U>, _observer: ObserverFunction<U, V> | Observer<U, V>, options?: ObserverOptions) {
    const obs = typeof _observer === 'function' ? observable.createObserver(_observer, options) : _observer
    this.__observed.push(obs)

    if (this.__observers.length > 0) {
      // start observing immediately if we're already being observed
      obs.startObserving()
    }

    return obs
  }

  //////////////////////////////////////////////////////////////
  /////////// The following are methods that provide

  /**
   * true when this.get() > value
   * @tag transform-readonly
   */
  isGreaterThan(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs > v.rhs)
  }

  /**
   * true when this.get() < value
   * @tag transform-readonly
   */
  isLesserThan(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs < v.rhs)
  }

  /**
   * true when this.get() === value
   * @tag transform-readonly
   */
  equals(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs === v.rhs)
  }


  /**
   * true when this.get() !== value
   * @tag transform-readonly
   */
  differs(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value},).tf(v => v.lhs !== v.rhs)
  }

  /**
   * true when this.get() >= value
   * @tag transform-readonly
   */
  isGreaterOrEqual(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs >= v.rhs)
  }

  /**
   * true when this.get() <= value
   * @tag transform-readonly
   */
  isLesserOrEqual(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs <= v.rhs)
  }

  /**
   * true when this.get() is null or undefined
   * @tag transform-readonly
   */
  isNull(): Observable<boolean> {
    return this.tf(val => val == null)
  }

  /**
   * true when this.get() is neither null nor undefined
   * @tag transform-readonly
   */
  isNotNull(): Observable<boolean> {
    return this.tf(val => val != null)
  }

  /**
   * true when this.get() is strictly undefined
   * @tag transform-readonly
   */
  isUndefined(): Observable<boolean> {
    return this.tf(val => val === undefined)
  }

  /**
   * true when this.get() is strictly not undefined
   * @tag transform-readonly
   */
  isDefined(): Observable<boolean> {
    return this.tf(val => val !== undefined)
  }

  /**
   * true when this.get() is === false
   * @tag transform-readonly
   */
  isFalse(this: Observable<boolean>): Observable<boolean> {
    return this.tf(val => val as any === false)
  }

  /**
   * true when this.get() === true
   * @tag transform-readonly
   */
  isTrue(this: Observable<boolean>): Observable<boolean> {
    return this.tf(val => val as any === true)
  }

  /**
   * true when this.get() would be false in an if condition
   * @tag transform-readonly
   */
  isFalsy(): Observable<boolean> {
    return this.tf(val => !val)
  }

  /**
   * true when this.get() would be true in an if condition
   * @tag transform-readonly
   */
  isTruthy(): Observable<boolean> {
    return this.tf(val => !!val)
  }

  /**
   * Set up an observable that is true when this observable or
   * any of the provided observables is true.
   * @tag transform-readonly
   */
  or(...args : MaybeObservable<any>[]) : Observable<boolean> {
    return args.reduce((acc, arg) => arg.or(acc), this)
  }

  /**
   * True when this and all the values provided in args are true.
   * @tag transform-readonly
   */
  and(...args: MaybeObservable<any>[]) : Observable<boolean> {
    return args.reduce((acc, arg) => arg.and(acc), this)
  }

  /**
   * @tag transform-readonly
   */
  plus(this: Observable<number>, pl: Observable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs + rhs)
  }

  /**
   * @tag transform-readonly
   */
  minus(this: Observable<number>, pl: Observable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs - rhs)
  }

  /**
   * @tag transform-readonly
   */
  times(this: Observable<number>, pl: Observable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs * rhs)
  }

  /**
   * @tag transform-readonly
   */
  dividedBy(this: Observable<number>, pl: Observable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs / rhs)
  }

  /**
   *
   * @param fnget
   * @param fnset
   */
  tf<U>(fnget: ObserverFunction<T, U>): VirtualObservable<U>
  tf<U>(fnget: ObserverFunction<T, U>, fnset: ObserverFunction<U>): VirtualObservable<U>
  tf<U>(fnget: ObserverFunction<T, U>, fnset?: ObserverFunction<U>): VirtualObservable<U> {

    const fn = new Observer(fnget, this)

    var obs = new VirtualObservable<U>(() => {
      return fn.call(this.get())
    }, fnset)

    obs.observe(this, () => obs.refresh())

    return obs
  }

  p<U extends object, K extends keyof U>(this: Observable<U>, key: K): VirtualObservable<U[K]>
  p<U>(this: Observable<{[key: string]: U}>, key: MaybeObservable<string>): VirtualObservable<U>
  p<U>(this: Observable<U[]>, key: MaybeObservable<number>): VirtualObservable<U>
  p(this: Observable<any>, key: MaybeObservable<number|string>): VirtualObservable<any> {

    var obs = new VirtualObservable(() => {
      return this.get()[o.get(key)]
    }, item => {
      const arr = this.getShallowClone()
      arr[o.get(key)] = item
      this.set(arr)
    })

    obs.observe(this, () => obs.refresh())
    if (key instanceof Observable)
      obs.observe(key, () => {
        obs.refresh()
      })

    return obs
  }

  /**
   * Return an observable of array which contains the elements whose indexes
   * were returned by the callback.
   *
   * This is generally used to filter or resort an array freely while maintaining
   * the possibility to set its individual properties.
   *
   * It also checks if the individual items changed
   *
   * @param fn The transform function
   */
  arrayTransform<A>(this: Observable<A[]>, fn: (lst: A[]) => number[]): VirtualObservable<A[]> {
    var indexes: number[]

    return this.tf(arr => {
      indexes = fn(arr)
      return map(indexes, id => arr[id])
    },
    transformed_array => {
      var arr = this.getShallowClone()
      var len = indexes.length

      if (transformed_array.length !== indexes.length)
        throw new Error('transformed arrays must not change length')

      for (var i = 0; i < len; i++) {
        arr[indexes[i]] = transformed_array[i]
      }
      this.set(arr)
    })
  }

  /**
   *
   * @param this
   * @param fn
   */
  filtered<U>(this: Observable<U[]>, fn: (item: U, index: number, array: U[]) => boolean): VirtualObservable<U[]> {
    return this.arrayTransform(arr => {
      var res: number[] = []
      var len = arr.length
      for (var i = 0; i < len; i++)
        if (fn(arr[i], i, arr))
          res.push(i)
      return res
    })
  }

  sorted<U> (this: Observable<U[]>, fn: (a: U, b: U) => (1 | 0 | -1)) {
    return this.arrayTransform(arr => {
      var indices = []
      var l = arr.length
      for (var i = 0; l < l; i++)
        indices.push(i)
      indices.sort((a, b) => fn(arr[a], arr[b]))
      return indices
    })
  }

  sliced<A>(this: Observable<A[]>, start?: MaybeObservable<number>, end?: MaybeObservable<number>): VirtualObservable<A[]> {
    var obs = this.arrayTransform(arr => {
      var indices = []
      var l = o.get(end) || arr.length
      for (var i = o.get(start) || 0; i < l; i++)
        indices.push(i)
      return indices
    })

    if (start instanceof Observable)
      obs.observe(start, s => obs.refresh())
    if (end instanceof Observable)
      obs.observe(end, e => obs.refresh())

    return obs
  }

  push<A>(this: Observable<A[]>, value: A) {
    const copy = this.getShallowClone()
    const res = copy.push(value)
    this.set(copy)
    return res
  }

  pop<A>(this: Observable<A[]>) {
    const copy = this.getShallowClone()
    const res = copy.pop()
    this.set(copy)
    return res
  }

  shift<A>(this: Observable<A[]>) {
    const copy = this.getShallowClone()
    const res = copy.shift()
    this.set(copy)
    return res
  }

  unshift<A>(this: Observable<A[]>, value: A) {
    const copy = this.getShallowClone()
    const res = copy.unshift(value)
    this.set(copy)
    return res
  }

  /**
   * Set the value of this observable to "not" its value.
   *
   * Will trigger a compilation error if used with something else than
   * a boolean Observable.
   */
  toggle(this: Observable<boolean>) {
    this.set(!this.get())
  }

  add(this: Observable<number>, inc: number) {
    this.set(this.get() + inc)
    return this
  }

  sub(this: Observable<number>, dec: number) {
    this.set(this.get() - dec)
    return this
  }

  mul(this: Observable<number>, coef: number) {
    this.set(this.get() * coef)
    return this
  }

  div(this: Observable<number>, coef: number) {
    this.set(this.get() / coef)
    return this
  }

  mod(this: Observable<number>, m: number) {
    this.set(this.get() % m)
    return this
  }

  /**
   * Return a proxy instance that allows using this observable
   * (almost) like if it were the original object.
   */
  proxy(): ObservableProxy<T> {
    return new Proxy(this, {
      get(target: any, name) {
        if (typeof target[name] === 'function')
          return function () {
            var res = target[name].apply(target, arguments)
            return res instanceof Observable ? res.proxy() : res
          }
        return target[name] || target.p(name).proxy()
      }
    }) as any
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
    (this.__value as any) = this.fnget()
    this.notify()
  }

  get(): T {
    if (this.__observers.length === 0) {
      this.refresh()
    }
    return this.__value
  }

  set(value: T): void {
    // Missing a way of not recursing infinitely.
    const old_value = this.__value;
    if (!this.fnset) {
      console.warn('attempted to set a value to a readonly observable')
    }
    this.fnset!(value, old_value)
  }

  addObserver(ob: any, opts?: any) {
    if (this.__observers.length === 0)
      // If we were not observed before, there is a good chance this Observable
      // does not hold the correct value, so we force a refresh here.
      this.refresh()
    return super.addObserver(ob, opts)
  }
}




/**
 * Make sure we have an observable.
 * @param arg A MaybeObservable
 * @returns The original observable if `arg` already was one, or a new
 *   Observable holding the value of `arg` if it wasn't.
 */
export function o<T>(arg: MaybeObservable<T>): Observable<T>
export function o<T>(arg: MaybeObservable<T> | undefined): Observable<T | undefined>
export function o<T>(arg: MaybeObservable<T>): Observable<T> {
  return arg instanceof Observable ? arg : new Observable(arg)
}


export type MaybeObservableObject<T> = { [P in keyof T]:  MaybeObservable<T[P]>}


export namespace o {

  /**
   * Get a MaybeObservable's value
   * @param arg The MaybeObservable
   * @returns `arg.get()` if it was an Observable or `arg` itself if it was not.
   */
  export function get<A>(arg: MaybeObservable<A>): A
  export function get<A>(arg?: undefined | MaybeObservable<A>): A | undefined
  export function get<A>(arg: MaybeObservable<A>): A {
    return arg instanceof Observable ? arg.get() : arg
  }


  /**
   * Combine several MaybeObservables into an Observable<boolean>
   * @param args Several MaybeObservables that will be and'ed
   * @returns A boolean Observable that is true when all of them are true, false
   *   otherwise.
   */
  export function and(...args: MaybeObservable<any>[]): Observable<boolean> {
    if (args.length === 1)
      return o(args[0]).isTruthy()
    return args.slice(1).reduce((lhs, rhs) =>
      lhs.and(rhs)
    , o(args[0]))
  }


  /**
   * Combine several MaybeObservables into an Observable<boolean>
   * @param args Several MaybeObservables that will be and'ed
   * @returns A boolean Observable that is true when any of them is true, false
   *   otherwise.
   */
  export function or(...args: MaybeObservable<any>[]): Observable<boolean> {
    if (args.length === 1)
      return o(args[0]).isTruthy()
    return args.slice(1).reduce((lhs, rhs) =>
      lhs.or(rhs)
    , o(args[0]))
  }


  /**
   * Merges several MaybeObservables into a single Observable.
   *
   * @param obj An object which values are MaybeObservable
   * @returns An observable which properties are the ones given in `obj` and values
   *   are the resolved values of their respective observables.
   */
  export function merge<A extends object>(obj: MaybeObservableObject<A>): Observable<A>
  export function merge<A extends object>(obj: MaybeObservableObject<A> | MaybeObservableObject<A>): Observable<A> | Observable<A> {
    const ro_obj = obj as MaybeObservableObject<A>

    function _get(): A {
      const res = {} as A

      for (var name in ro_obj) {
        res[name] = o.get(ro_obj[name])
      }

      return res
    }

    function _set(_obj: A): A {
      const _ob = obj as MaybeObservableObject<A>
      for (var name in _obj) {
        var ob = _ob[name]
        if (ob instanceof Observable) {
          ob.set(_obj[name])
        }
      }
      return _obj
    }

    var res = new VirtualObservable(_get, _set)

    for (var name in ro_obj) {
      var ob = ro_obj[name]
      if (ob instanceof Observable) {
        res.observe(ob, () => res.refresh())
      }
    }

    return res

  }

}
