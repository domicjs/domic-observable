
export type UnregisterFunction = () => void

export type ObserverFunction<T, U = void> = (newval: T, oldval: T | undefined) => U


/**
 * Options that determine how we are to listen to different types of updates.
 */
export interface ObserverObject<T, U = void> {

  fn: ObserverFunction<T, U>

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

export type Observer<T, U = void> = ObserverFunction<T, U> | ObserverObject<T, U>


/**
 *
 */
export class Observable<T> {

  protected value: T
  protected observers: ObserverFunction<T>[] = []
  protected observed: ObserverFunction<any>[] = []
  protected unregs: UnregisterFunction[] = []

  static getObserverFunction<T, U>(ob: Observer<T, U>): ObserverFunction<T, U> {
    // FIXME apply debounce, throttle, etc.
    return typeof ob === 'function' ? ob : ob.fn
  }

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
  addObserver(ob: Observer<T>): UnregisterFunction {
    const fn = Observable.getObserverFunction(ob)
    this.observers.push(fn)

    if (typeof ob === 'function' || !ob.updatesOnly) {
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
    this.observed.push(Observable.getObserverFunction(observer))

    if (this.observers.length > 0) {
      // start observing immediately.
    }
  }

  tf<U>(fnget: Observer<T, U>, fnset?: Observer<U, T>): Observable<U> {
    const g = Observable.getObserverFunction(fnget)

    // ! Attention ici risque de boucle infinie !!!

    // Create the new observable
    const obs = new Observable(g(this.get(), undefined))

    // WARNING il faudrait plutôt remplacer son get() par cette fonction
    // avec une forme de memoization, etant donné que si il n'est pas observé
    // sa valeur ne se mettra pas à jour et son get() renverra uniquement
    // la première valeur reçue.
    obs.observe(this, function (value, old) { obs.set(g(value, old)) })

    if (fnset) {
      const s = Observable.getObserverFunction(fnset)
      obs.observe(obs, (value, old) => { this.set(s(value, old)) })
    }

    return obs
  }

  p<U>(this: Observable<U[]>, key: number): Observable<U> {
    return this.tf(
      (arr) => arr[key],
      (item) => {
        const arr = this.get().slice()
        arr[key] = item
        return arr
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
      (transformed_array) => {
        const len = transformed_array.length
        var local_array: U[] = this.get().slice()
        for (var i = 0; i < len; i++) {
          local_array[indexes[i]] = transformed_array[i]
        }
        return local_array
      }
    )
  }

  map<U, V>(this: Observable<U[]>, transformer: (item: U, index:number, array: U[]) => V): ReadonlyObservable<V[]> {

  }

}


// On veut pouvoir contrôler si un tf s'update souvent depuis son parent
// ou si il update celui-ci fréquemment aussi

export class TransformObservable<Q, T> extends Observable<T> {

  constructor(getter: any) {
    super(undefined)
  }


}


/**
 * An Observable variant that doesn't allow the use of set()
 * Generally used by observables that did .tf() without providing
 * a set function, like for instance what the .map() method does.
 */
export class ReadonlyObservable<T> extends Observable<T> {

}