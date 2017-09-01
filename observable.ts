
export type UnregisterFunction = () => void

export type Observer<T, U = void> = (newval: T, oldval: T | undefined) => U


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

/**
 *
 */
export class Observable<T> {

  protected value: T
  protected observers: Observer<T>[] = []
  protected observed: Observer<any>[] = []
  protected unregs: UnregisterFunction[] = []

  static cloneObject<T extends object>(object: T): T {
    return null
  }

  constructor(value: T) {
    this.set(value)
  }

  get<U>(this: Observable<U[]>): ReadonlyArray<U>
  get<T extends object>(this: Observable<T>): Readonly<T>
  get(): T
  get(): any {
    return this.value
  }

  /**
   * Get a shallow copy of the current value. Used for transforms.
   */
  getCopy(): T {
    if (this.value instanceof Object) {

    }
    return this.value
  }

  set(value: T): T {
    const old_value = this.value
    this.value = value
    if (old_value !== value) this.notify(old_value)
    return this.value
  }

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
      fn(this.get(), undefined)
    }

    // Subscribe to the observables we are meant to subscribe to.

    return this.removeObserver.bind(this, fn) as UnregisterFunction
  }

  /**
   *
   * @param fn
   */
  removeObserver(fn: Observer<T>): void {
    this.observers = this.observers.filter(f => f !== fn)

    if (this.observers.length === 0) {
      // unregister from the observables we were obsering
    }
  }

  /**
   * Observe another observable only when this observer itself
   * is being observed.
   */
  observe<U>(observable: Observable<U>, observer: Observer<U>) {
    this.observed.push(observer)

    if (this.observers.length > 0) {
      // start observing immediately.
    }
  }

  tf<U>(fnget: Observer<T, U>, fnset?: (orig_obs: this, new_value: U, old_value: U | undefined) => void): Observable<U> {

    // Create the new observable
    const obs = new Observable<U>(undefined!)

    // ooooh this is hacky...
    const get = memoize(fnget)
    obs.get = (() => get(this.get(), this.get())) as any

    // WARNING il faudrait plutôt remplacer son get() par cette fonction
    // avec une forme de memoization, etant donné que si il n'est pas observé
    // sa valeur ne se mettra pas à jour et son get() renverra uniquement
    // la première valeur reçue.
    obs.observe(this, function (value, old) { obs.set(get(value, old)) })

    if (fnset) {
      obs.observe(obs, (value, old) => { fnset(this, value, old) })
    }

    return obs
  }

  p<U extends object, K extends keyof U>(this: Observable<U>, key: K): Observable<U[K]>
  p<U>(this: Observable<U[]>, key: number): Observable<U>
  p(this: Observable<any>, key: number|string): Observable<any> {
    return this.tf(
      (arr) => arr[key],
      (obs, item) => {
        const arr = obs.getCopy()
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
      (obs, transformed_array) => {
        const len = transformed_array.length
        var local_array: U[] = this.getCopy()
        for (var i = 0; i < len; i++) {
          local_array[indexes[i]] = transformed_array[i]
        }
        obs.set(local_array)
      }
    )
  }

}
