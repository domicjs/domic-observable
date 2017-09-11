
import * as clone from 'clone'

export type UnregisterFunction = () => void

export type ObserverFunction<T, U = void> = (newval: T, oldval: T) => U

export type MaybeWritableObservable<T> = T | WritableObservable<T>
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

  leading?: boolean

}


export class Observer<A, B = void> {

  old_value: A
  // saved value exists solely to
  protected last_value: A | undefined
  protected last_result: B
  protected is_paused = false

  constructor(public fn: ObserverFunction<A, B>, public observable: Observable<A>) {

  }

  call(new_value: A): B {
    if (this.is_paused) {
      this.last_value = new_value
      return this.last_result
    }
    const old = this.old_value
    this.old_value = new_value
    const res = this.fn(new_value, old)
    this.last_result = res
    return res
  }

  pause() {
    this.is_paused = true
  }

  resume() {
    const val = this.last_value
    this.last_value = undefined
    this.is_paused = false
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

  last_call: number
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

export function make_observer<A, B>(obs: Observable<A>, fn: ObserverFunction<A, B>, options: ObserverOptions = {}) {
  if (options.debounce)
    return new DebounceObserver(fn, obs, options.debounce, !!options.leading)
  if (options.throttle)
    return new ThrottleObserver(fn, obs, options.throttle, !!options.leading)
  return new Observer(fn, obs)
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


export class Observable<T> {
  protected observers: Observer<T, any>[] = []
  protected observed: Observer<any, any>[] = []
  protected paused_notify = -1

  // protected readonly value: T
  constructor(protected readonly value: T) {
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
   * Get a shallow copy of the current value. Used for transforms.
   */
  getShallowClone(circular = false): T {
    return clone(this.get(), circular, 1)
  }

  getClone(circular = false): T {
    return clone(this.get(), circular)
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
  readonly(): Observable<T> {
    return new VirtualObservable(() => this.get())
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
  isFalse(this: WritableObservable<boolean>): Observable<boolean> {
    return this.tf(val => val as any === false)
  }

  /**
   * true when this.get() === true
   * @tag transform-readonly
   */
  isTrue(this: WritableObservable<boolean>): Observable<boolean> {
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
  or(...args : MaybeWritableObservable<any>[]) : Observable<boolean> {
    return args.reduce((acc, arg) => arg.or(acc), this)
  }

  /**
   * True when this and all the values provided in args are true.
   * @tag transform-readonly
   */
  and(...args: MaybeWritableObservable<any>[]) : Observable<boolean> {
    return args.reduce((acc, arg) => arg.and(acc), this)
  }

  /**
   * @tag transform-readonly
   */
  plus(this: WritableObservable<number>, pl: WritableObservable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs + rhs)
  }

  /**
   * @tag transform-readonly
   */
  minus(this: WritableObservable<number>, pl: WritableObservable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs - rhs)
  }

  /**
   * @tag transform-readonly
   */
  times(this: WritableObservable<number>, pl: WritableObservable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs * rhs)
  }

  /**
   * @tag transform-readonly
   */
  dividedBy(this: WritableObservable<number>, pl: WritableObservable<number>): Observable<number> {
    return o.merge({lhs: this, rhs: pl}).tf(({lhs, rhs}) => lhs / rhs)
  }

  /**
   *
   * @param fnget
   * @param fnset
   */
  tf<U>(fnget: ObserverFunction<T, U>): Observable<U> {

    const fn = new Observer(memoize(fnget), this)

    var obs = new VirtualObservable<U>(() => {
      return fn.call(this.get())
    })

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
    })

    obs.observe(this, () => obs.refresh())
    if (key instanceof WritableObservable)
      obs.observe(key, () => obs.refresh())

    return obs
  }

  /**
   *
   * @param this
   * @param fn
   */
  filtered<U>(this: Observable<U[]>, fn: (item: U, index: number, array: U[]) => boolean): Observable<U[]> {
    return this.tf(
      memoize((arr) => {
        return arr.filter((item, index) => {
          var res = fn(item, index, arr)
          return res
        })
      })
    )
  }

  mapped<U, V>(this: Observable<U[]>, fn: (item: U) => V): Observable<V[]> {
    return this.tf(
      memoize((arr) => arr.map(fn))
    )
  }

  sliced<A>(this: Observable<A[]>, start?: MaybeObservable<number>, end?: MaybeObservable<number>): Observable<A[]> {

    const res: VirtualObservable<A[]> =
      this.tf(memoize((arr) => arr.slice(o.get(start), o.get(end)))) as VirtualObservable<A[]>

    if (start instanceof Observable)
      res.observe(start, () => res.refresh())

    if (end instanceof Observable)
      res.observe(end, () => res.refresh())

    return res
  }
}


/**
 *
 */
export class WritableObservable<T> extends Observable<T> {

  /**
   *
   * @param value
   */
  set(value: T): void {
    (this.value as any) = value
    this.notify()
  }

  assign(partial: RecursivePartial<T>): void {
    this.set(assign(this.get(), partial))
  }

  /**
   *
   * @param fnget
   * @param fnset
   */
  tf<U>(fnget: ObserverFunction<T, U>): Observable<U>
  tf<U>(fnget: ObserverFunction<T, U>, fnset: ObserverFunction<U>): WritableObservable<U>
  tf<U>(fnget: ObserverFunction<T, U>, fnset?: ObserverFunction<U>): WritableObservable<U> {

    const fn = new Observer(memoize(fnget), this)

    var obs = new VirtualWritableObservable<U>(() => {
      return fn.call(this.get())
    }, fnset)

    obs.observe(this, () => obs.refresh())

    return obs
  }

  p<U extends object, K extends keyof U>(this: WritableObservable<U>, key: K): WritableObservable<U[K]>
  p<U>(this: WritableObservable<{[key: string]: U}>, key: MaybeWritableObservable<string>): WritableObservable<U | undefined>
  p<U>(this: WritableObservable<U[]>, key: MaybeWritableObservable<number>): WritableObservable<U | undefined>
  p(this: WritableObservable<any>, key: MaybeWritableObservable<number|string>): WritableObservable<any> {

    const fn = new Observer<any, any>((arr) => arr[o.get(key)], this)

    var obs = new VirtualWritableObservable(() => {
      return fn.call(this.get())
    }, item => {
      const arr = this.getShallowClone()
      arr[o.get(key)] = item
      this.set(arr)
    })

    obs.observe(this, () => obs.refresh())
    if (key instanceof WritableObservable)
      obs.observe(key, () => obs.refresh())

    return obs
  }

  /**
   *
   * @param this
   * @param fn
   */
  filtered<U>(this: WritableObservable<U[]>, fn: (item: U, index: number, array: U[]) => boolean): WritableObservable<U[]> {
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

        var local_array: U[] = this.getShallowClone()
        for (var i = 0; i < len; i++) {
          local_array[indexes[i]] = transformed_array[i]
        }
        this.set(local_array)
        return transformed_array
      }
    )
  }

  sliced<A>(this: WritableObservable<A[]>, start?: MaybeWritableObservable<number>, end?: MaybeWritableObservable<number>): WritableObservable<A[]> {
    const res: VirtualWritableObservable<A[]> =
      this.tf(
        memoize((arr) => arr.slice(o.get(start), o.get(end))),
        (new_arr, old_arr) => {
          const val = this.getShallowClone()
          const _end = o.get(end)
          val.splice(o.get(start) || 0, _end ? _end - (o.get(start) || 0) : old_arr.length, ...new_arr)
          this.set(val)
        }
      ) as VirtualWritableObservable<A[]>

    if (start instanceof Observable)
      res.observe(start, () => res.refresh())

    if (end instanceof Observable)
      res.observe(end, () => res.refresh())

    return res
  }

  push<A>(this: WritableObservable<A[]>, value: A) {
    const copy = this.getShallowClone()
    const res = copy.push(value)
    this.set(copy)
    return res
  }

  pop<A>(this: WritableObservable<A[]>) {
    const copy = this.getShallowClone()
    const res = copy.pop()
    this.set(copy)
    return res
  }

  shift<A>(this: WritableObservable<A[]>) {
    const copy = this.getShallowClone()
    const res = copy.shift()
    this.set(copy)
    return res
  }

  unshift<A>(this: WritableObservable<A[]>, value: A) {
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
  toggle(this: WritableObservable<boolean>) {
    this.set(!this.get())
  }

  add(this: WritableObservable<number>, inc: number) {
    this.set(this.get() + inc)
    return this
  }

  sub(this: WritableObservable<number>, dec: number) {
    this.set(this.get() - dec)
    return this
  }

  mul(this: WritableObservable<number>, coef: number) {
    this.set(this.get() * coef)
    return this
  }

  div(this: WritableObservable<number>, coef: number) {
    this.set(this.get() / coef)
    return this
  }

  mod(this: WritableObservable<number>, m: number) {
    this.set(this.get() % m)
    return this
  }

}


export class VirtualObservable<T> extends Observable<T> {
  constructor(
    protected fnget: () => T
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

}

/**
 * An observable that does not its own value, but that depends
 * from outside getters and setters.
 */
export class VirtualWritableObservable<T> extends WritableObservable<T> {

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
 *
 * @param arg
 */
export function o<T>(arg: MaybeWritableObservable<T>): WritableObservable<T> {
  return arg instanceof WritableObservable ? arg : new WritableObservable(arg)
}


export type MaybeWritableObservableObject<T> = { [P in keyof T]:  MaybeWritableObservable<T[P]>}
export type MaybeObservableObject<T> = { [P in keyof T]:  MaybeObservable<T[P]>}

function isReadonlyObservableObject<T>(obj: any): obj is MaybeObservable<T> {
  for (var x in obj)
    if (obj[x] instanceof WritableObservable)
      return false
  return true
}


export namespace o {

  export function get<A>(arg: MaybeObservable<A>): A
  export function get<A>(arg?: undefined | MaybeObservable<A>): A | undefined
  export function get<A>(arg: MaybeObservable<A>): A {
    return arg instanceof WritableObservable ? arg.get() : arg
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


  export function merge<A extends object>(obj: MaybeWritableObservableObject<A>): WritableObservable<A>
  export function merge<A extends object>(obj: MaybeObservableObject<A>): Observable<A>
  export function merge<A extends object>(obj: MaybeWritableObservableObject<A> | MaybeObservableObject<A>): WritableObservable<A> | Observable<A> {
    const ro_obj = obj as MaybeObservableObject<A>

    function _get(): A {
      const res = {} as A

      for (var name in ro_obj) {
        res[name] = o.get(ro_obj[name])
      }

      return res
    }

    function _set(_obj: A): A {
      const _ob = obj as MaybeWritableObservableObject<A>
      for (var name in _obj) {
        var ob = _ob[name]
        if (ob instanceof WritableObservable) {
          ob.set(_obj[name])
        }
      }
      return _obj
    }

    var res: VirtualObservable<A> | VirtualWritableObservable<A>
    if (isReadonlyObservableObject(obj)) {
      res = new VirtualObservable(_get)
    } else {
      res = new VirtualWritableObservable(_get, _set)
    }

    for (var name in ro_obj) {
      var ob = ro_obj[name]
      if (ob instanceof Observable) {
        res.observe(ob, () => res.refresh())
      }
    }

    return res

  }


  export function observe<A, B = void>(obs: MaybeObservable<A>, fn: ObserverFunction<A, B>, call_immediately = true): Observer<A, B> | null {
    if (obs instanceof WritableObservable) {
      return obs.addObserver(fn)
    }

    if (call_immediately)
      fn(o.get(obs), o.get(obs))
    return null
  }

}
