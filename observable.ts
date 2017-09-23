
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

export class Observer<A, B = void> {

  protected old_value: A
  // saved value exists solely to
  protected last_result: B
  readonly observing = false

  constructor(public fn: ObserverFunction<A, B>, public observable: Observable<A>) { }

  call(new_value: A): B {
    const old = this.old_value
    if (new_value instanceof Observable) throw new Error('WTF')

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


export function memoize<A, B>(fn: (arg: A, old: A | undefined) => B): (arg: A, old: A | undefined) => B {
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
    for (observer of this.__observed) {
      observer.startObserving()
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
    if (this.__paused_notify === -1)
      this.__paused_notify = 0
  }

  resume() {
    const frozen = this.__paused_notify
    this.__paused_notify = -1
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
    if (this.__paused_notify > -1) {
      this.__paused_notify = 1
    } else {
      for (var ob of this.__observers)
        ob.call(this.__value)
    }
  }

  makeObserver<U = void>(fn: ObserverFunction<T, U>, options: ObserverOptions = {}): Observer<T, U> {
    if (options.debounce)
      return new DebounceObserver(fn, this, options.debounce, !!options.leading)
    if (options.throttle)
      return new ThrottleObserver(fn, this, options.throttle, !!options.leading)
    return new Observer(fn, this)
  }

  /**
   * Add an observer.
   */
  addObserver<U = void>(obs: Observer<T, U>): Observer<T, U>
  addObserver<U = void>(fn: ObserverFunction<T, U>, options?: ObserverOptions): Observer<T, U>
  addObserver<U = void>(_ob: ObserverFunction<T, U> | Observer<T, U>, options?: ObserverOptions): Observer<T, U> {

    const ob = typeof _ob === 'function' ? this.makeObserver(_ob, options) : _ob

    const value = this.get()
    this.__observers.push(ob)
    ob.call(value)

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
   *
   * @param ob
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
    const obs = typeof _observer === 'function' ? observable.makeObserver(_observer, options) : _observer
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
  gt(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs > v.rhs)
  }

  greaterThan(value: MaybeObservable<T>): Observable<boolean> {
    return this.gt(value)
  }

  /**
   * true when this.get() < value
   * @tag transform-readonly
   */
  lt(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs < v.rhs)
  }

  lesserThan(value: MaybeObservable<T>): Observable<boolean> {
    return this.lt(value)
  }

  /**
   * true when this.get() === value
   * @tag transform-readonly
   */
  eq(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs === v.rhs)
  }

  equal(value: MaybeObservable<T>): Observable<boolean> {
    return this.eq(value)
  }


  /**
   * true when this.get() !== value
   * @tag transform-readonly
   */
  ne(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value},).tf(v => v.lhs !== v.rhs)
  }

  notEqual(value: MaybeObservable<T>): Observable<boolean> {
    return this.ne(value)
  }

  /**
   * true when this.get() >= value
   * @tag transform-readonly
   */
  gte(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs >= v.rhs)
  }

  greaterOrEqual(value: MaybeObservable<T>): Observable<boolean> {
    return this.gte(value)
  }

  /**
   * true when this.get() <= value
   * @tag transform-readonly
   */
  lte(value: MaybeObservable<T>): Observable<boolean> {
    return o.merge({lhs: this, rhs: value}).tf(v => v.lhs <= v.rhs)
  }

  lesserOrEqual(value: MaybeObservable<T>): Observable<boolean> {
    return this.lte(value)
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
  tf<U>(fnget: ObserverFunction<T, U>): Observable<U>
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
  p<U>(this: Observable<{[key: string]: U}>, key: MaybeObservable<string>): Observable<U>
  p<U>(this: Observable<U[]>, key: MaybeObservable<number>): Observable<U>
  p(this: Observable<any>, key: MaybeObservable<number|string>): Observable<any> {

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
  arrayTransform<A>(this: Observable<A[]>, fn: (lst: A[]) => number[]): Observable<A[]> {
    var prev_indexes: number[]
    var prev_result: A[]

    return this.tf((arr, old) => {
      const indexes = fn(arr)
      if (prev_indexes && prev_indexes.length === indexes.length && old) {
        // Check if the individual items did indeed change to not
        // trigger a lot of calls when the change came from an item not watched
        // by this specific array transform.
        var l = prev_indexes.length

        for (var i = 0; i < l; i++) {
          if (prev_indexes[i] !== indexes[i] || arr[indexes[i]] !== old[indexes[i]])
            break
        }

        // If we went to the end, then it means that this is most likely
        // the same array.
        if (i === l)
          return prev_result
      }
      prev_indexes = indexes
      prev_result = map(indexes, id => arr[id])
      return prev_result
    },
    (transformed_array, old_transform) => {
      var arr = this.getShallowClone()
      var len = prev_indexes.length

      // FIXME should handle the case when an array of different length
      // is tried to be set here.
      if (transformed_array.length !== prev_indexes.length)
        throw new Error('transformed arrays must not change length')

      for (var i = 0; i < len; i++) {
        arr[prev_indexes[i]] = transformed_array[i]
      }
      this.set(arr)
    })
  }

  /**
   *
   * @param this
   * @param fn
   */
  filtered<U>(this: Observable<U[]>, fn: (item: U, index: number, array: U[]) => boolean): Observable<U[]> {
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

  sliced<A>(this: Observable<A[]>, start?: MaybeObservable<number>, end?: MaybeObservable<number>): Observable<A[]> {
    var obs = this.arrayTransform(arr => {
      var indices = []
      var l = o.get(end) || arr.length
      for (var i = o.get(start) || 0; i < l; i++)
        indices.push(i)
      return indices
    }) as VirtualObservable<A[]>

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
    if (this.__observers.length === 0)
      this.refresh()
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

}




/**
 *
 * @param arg
 */
export function o<T>(arg: MaybeObservable<T>): Observable<T>
export function o<T>(arg: MaybeObservable<T> | undefined): Observable<T | undefined>
export function o<T>(arg: MaybeObservable<T>): Observable<T> {
  return arg instanceof Observable ? arg : new Observable(arg)
}


export type MaybeObservableObject<T> = { [P in keyof T]:  MaybeObservable<T[P]>}


export namespace o {

  export function get<A>(arg: MaybeObservable<A>): A
  export function get<A>(arg?: undefined | MaybeObservable<A>): A | undefined
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
