
export type UnregisterFunction = () => void

export type Observer<T, U = void> = (newval: T, oldval: T) => U

export type MaybeObservable<T> = T | Observable<T>


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
  updatesOnly?: boolean

}


function memoize<A, B>(fn: (arg: A, old: A) => B): (arg: A, old: A) => B {
  var last_value: A
  var last_result: B
  return function (arg: A, old: A): B {
    if (arg === last_value)
      return last_result
    last_value = arg
    last_result = fn(arg, old)
    return last_result
  }
}

export type ObsObject = {observable: Observable<any>, observer: Observer<any>, unreg?: UnregisterFunction}

/**
 *
 */
export class Observable<T> {

  protected value: T
  protected observers: Observer<T>[] = []
  protected observed: ObsObject[] = []

  constructor(value: T) {
    this.set(value)
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
  getShallowCopy(): T {

    if (this.value instanceof Array) {
      return this.value.slice() as any
    }

    if (this.value instanceof Object) {
      var descrs: {[name: string]: PropertyDescriptor} = {}

      for (var prop of Object.getOwnPropertyNames(this.value)) {
        descrs[prop] = Object.getOwnPropertyDescriptor(this.value, prop)
      }

      for (var sym of Object.getOwnPropertySymbols(this.value)) {
        descrs[sym] = Object.getOwnPropertyDescriptor(this.value, sym)
      }

      var clone = Object.create(
        this.value.constructor.prototype,
        descrs
      )
      return clone
    }

    return this.value
  }

  /**
   *
   * @param value
   */
  set(value: T): T {
    const old_value = this.value
    this.value = value
    if (old_value !== value) this.notify(old_value)
    return this.value
  }

  /**
   * Notify all the registered observers that is Observable changed
   * value.
   *
   * @param old_value The old value of this observer
   */
  notify(old_value: T) {
    for (var ob of this.observers)
      ob(this.value, old_value)
  }

  /**
   * Add an observer.
   */
  addObserver(fn: Observer<T>, options?: ObserverOptions): UnregisterFunction {
    this.observers.push(fn)

    if (typeof options === 'function' || options && !options.updatesOnly) {
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

    return this.removeObserver.bind(this, fn) as UnregisterFunction
  }

  /**
   *
   * @param fn
   */
  removeObserver(fn: Observer<T>): void {
    this.observers = this.observers.filter(f => f !== fn)

    if (this.observers.length === 0) {
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

    // const current_val = observable.get()
    // obj.observer(current_val, current_val)

    if (this.observers.length > 0) {
      // start observing immediately if we're already observed
      obj.unreg = obj.observable.addObserver(obj.observer)
    }
  }

  tf<U>(fnget: Observer<T, U>, fnset?: (orig_obs: this, new_value: U, old_value: U) => void): Observable<U> {

    // Create the new observable
    const obs = new Observable<U>(undefined!)

    // memoize the fnget as it may be called multiple times even though
    // the parent observable didn't change.
    const get = memoize(fnget)

    // We use a form of monkey patching to replace the get() method,
    // as this observable won't observe its parent until it gets
    // observed itself and thus not update its value.
    obs.get = (() => get(this.get(), this.get())) as any

    var change_by_parent = false
    obs.observe(this, function (value, old) {
      // we mark the fact that this change came from the original
      // observable.
      change_by_parent = true
      obs.set(get(value, old))
    })

    if (fnset) {
      const original = this
      obs.set = function (this: Observable<U>, value: any) {
        if (!change_by_parent) {
          fnset(original, value, this.value)
          change_by_parent = false
        }
        return value
      } as any
    }

    return obs
  }

  p<U extends object, K extends keyof U>(this: Observable<U>, key: K): Observable<U[K]>
  p<U>(this: Observable<U[]>, key: number): Observable<U>
  p(this: Observable<any>, key: number|string): Observable<any> {
    return this.tf(
      (arr) => arr[key],
      (obs, item) => {
        const arr = obs.getShallowCopy()
        arr[key] = item
        obs.set(arr)
      }
    )
  }

  /**
   *
   * @param this
   * @param fn
   */
  filter<U>(this: Observable<U[]>, fn: (item: U, index: number, array: U[]) => boolean): Observable<U[]> {
    var indexes: number[] = []
    return this.tf(
      (arr) => {
        indexes = []
        return arr.filter((item, index) => {
          var res = fn(item, index, arr)
          if (res) indexes.push(index)
          return res
        })
      },
      (obs, transformed_array, old_transformed) => {
        const len = transformed_array.length

        if (old_transformed && len !== old_transformed.length)
            throw new Error(`filtered arrays may not change size by themselves`)

        var local_array: U[] = this.getShallowCopy()
        for (var i = 0; i < len; i++) {
          local_array[indexes[i]] = transformed_array[i]
        }
        obs.set(local_array)
      }
    )
  }

}


export function o<T>(arg: MaybeObservable<T>): Observable<T> {
  if (arg instanceof Observable)
    return arg
  return new Observable(arg)
}


export type MaybeObservableObject<T> = { [P in keyof T]:  MaybeObservable<T[P]>}


export namespace o {

  export function merge<A extends object>(obj: MaybeObservableObject<A>): Observable<A> {

    const obs = new Observable<A>({} as any)
    const props: {[name: string]: Observable<A[keyof A]>} = {}

    for (let prop in obj) {
      props[prop] = obs.p(prop)

      if (obj[prop] instanceof Observable) {
        obs.observe(obj[prop] as Observable<A[keyof A]>, new_value => {
          props[prop].set(new_value)
        })

      } else {
        props[prop].set(obj[prop] as A[keyof A])
      }
    }

    // This observer does not depend on any kind of lifecycle, so
    // it is always active
    obs.addObserver((newvalue) => {
      for (var prop in obj)
        if (obj[prop] instanceof Observable)
          (obj[prop] as Observable<A[keyof A]>).set(newvalue[prop])
    })

    return obs

  }

  export function observe<A>(obs: MaybeObservable<A>, fn: Observer<A>): UnregisterFunction {
    if (obs instanceof Observable) {
      return obs.addObserver(fn)
    }

    fn(obs, obs)
    return function () { }
  }

}
