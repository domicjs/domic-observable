
export type UnregisterFunction = () => void

export type ObserverFunction<T, U = void> = (newval: T, oldval: T | undefined) => U


/**
 * Options that determine how we are to listen to different types of updates.
 */
export interface ObserverObject<T, U = void> {

  fn: ObserverFunction<T, U>
  
  unreg?: UnregisterFunction

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

function _get_observer_object<T, U>(ob: Observer<T, U>): ObserverObject<T, U> {
  return typeof ob === 'function' ? {fn: ob} : ob
}

/**
 * 
 */
export class Observable<T> {

  protected value: T
  protected observers: ObserverObject<T>[] = []
  protected observed: ObserverObject<any>[] = []

  constructor(value: T) { 
    this.set(value)
  }

  get<T extends object>(this: Observable<T>): Readonly<T>
  get<U>(this: Observable<U[]>, key: number): ReadonlyArray<T>
  get<U>(this: Observable<U[]>): ReadonlyArray<U>
  get(): T
  get(): any {
    return this.value
  }

  set(value: T) {
    const old_value = this.value
    this.value = value
    if (old_value !== value) this.notify(old_value)
  }

  notify(old_value: T) {
    for (var ob of this.observers)
      ob.fn(this.value, old_value)
  }

  /**
   * Add an observer.
   */
  addObserver(fn: Observer<T>): UnregisterFunction {
    const ob = typeof fn === 'function' ? {fn} : fn
    this.observers.push(ob)

    ob.unreg = () => {
      this.observers = this.observers.filter(f => f !== fn)
    }

    return ob.unreg
  }

  /**
   * Observe another observable only when this observer itself
   * is being observed.
   */
  observe<U>(observable: Observable<U>, observer: Observer<U>) {
    this.observed.push(_get_observer_object(observer))
  }

  tf<U>(fnget: Observer<T, U>, fnset?: Observer<U, T>): Observable<U> {
    const g = _get_observer_object(fnget)

    // ! Attention ici risque de boucle infinie !!!

    // Create the new observable
    const obs = new Observable(g.fn(this.get(), undefined))
    obs.observe(this, function (value, old) { obs.set(g.fn(value, old)) })
    
    if (fnset) {
      const s = _get_observer_object(fnset)
      obs.observe(obs, (value, old) => { this.set(s.fn(value, old)) })
    }

    return obs
  }

}


