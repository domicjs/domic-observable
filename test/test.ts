
require('source-map-support').install()

///////////////////////////////////////////////////////////

import 'mocha'
import {expect} from 'chai'

import {o} from '../observable'

import {spyon, Calls, wait} from './common'

beforeEach(() => {
  o_deep = o({a: 1, b: {c: 1}})
  o_simple = o(0)
  o_deep_a = o_deep.p('a')
  o_deep_b = o_deep.p('b')
  o_deep_c = o_deep.p('b').p('c')
  deep_spy = spyon(o_deep)
  deep_c_spy = spyon(o_deep_c)
  deep_a_spy = spyon(o_deep_a)
  deep_b_spy = spyon(o_deep_b)
  simple_spy = spyon(o_simple)
})

afterEach(function () {
  spyon.clean()
})

var o_deep = o({a: 1, b: {c: 1}})
var o_simple = o(0)
var o_deep_a = o_deep.p('a')
var o_deep_b = o_deep.p('b')
var o_deep_c = o_deep.p('b').p('c')
var simple_spy = spyon(o_simple)
var deep_spy = spyon(o_deep)
var deep_c_spy = spyon(o_deep_c)
var deep_a_spy = spyon(o_deep_a)
var deep_b_spy = spyon(o_deep_b)


describe('basic operations', () => {

  it('set and get work as expected', () => {
    expect(o_simple.get()).to.equal(0)
    o_simple.set(1)
    expect(o_simple.get()).to.equal(1)
    simple_spy.was.called.once.with(1, 0)
  })

  it('get/set properties work and change original object', () => {
    const deep = o_deep.get()
    expect(o_deep_a.get()).to.equal(1)
    o_deep_a.set(2)
    expect(o_deep_a.get()).to.equal(2)
    expect(o_deep.get()).to.not.equal(deep)
  })

  it('observing a property gets called when changing', () => {
    o_deep_c.set(3)
    expect(o_deep_c.get()).to.equal(3)
    deep_c_spy.was.called.once.with(3, 1)
    deep_b_spy.was.called.once.with({c: 3}, {c: 1})
    deep_spy.was.called.once.with({a: 1, b: {c: 3}}, {a: 1, b: {c: 1}})
  })

  it('observing a property with an observable', () => {
    const o_arr = o([1, 2, 3])
    const spy_arr = spyon(o_arr)
    const o_prop = o(0)
    const o_watched = o_arr.p(o_prop)
    const spy = spyon(o_watched)

    expect(o_watched.get()).to.equal(1)
    o_prop.set(1)
    spy.was.called.once.with(2, 1)
    o_watched.set(7)
    spy.was.called.once.with(7, 2)
    spy_arr.was.called.once.with([1, 7, 3], [1, 2, 3])
  })

  it('get/set on an unobserved property still returns the correct value', () => {
    const o_deep_a2 = o_deep.p('a')
    expect(o_deep_a2.get()).to.equal(1)
    o_deep_a2.set(3)
    expect(o_deep_a.get()).to.equal(3)
    expect(o_deep_a2.get()).to.equal(3)
  })

  it('merge observable get/set', () => {
    const om = o.merge({one: o_simple, two: o_deep})
    expect(om.p('one').get()).to.equal(0)

    const o_one = om.p('one')
    expect(o_one.get()).to.equal(0)
    o_one.set(2)
    expect(o_one.get()).to.equal(2)
    expect(o_simple.get()).to.equal(2)
  })

  it('merge observable addObserver', () => {
    const om = o.merge({one: o_simple, two: o_deep})
    const o_one = om.p('one')
    const spy = spyon(o_one)
    o_one.set(4)

    simple_spy.was.called.once.with(4, 0)
    expect(o_one.get()).to.equal(4)
    spy.was.called.once.with(4, 0)

    o_simple.set(5)
    expect(o_one.get()).to.equal(5)
    spy.was.called.once.with(5, 4)
    simple_spy.was.called.once.with(5, 4)
  })

  it('pausing and unpausing observable', () => {
    const other_simple_spy = spyon(o_simple)
    o_simple.pause()
    o_simple.set(1)
    o_simple.set(2)
    o_simple.set(3)
    o_simple.resume()
    simple_spy.was.called.once.with(3, 0)
    other_simple_spy.was.called.once.with(3, 0)
  })

  it('pause and unpause observer', () => {
    const o_a = o(1)
    const spy = new Calls()
    const obs = o_a.addObserver(v => spy.call(v))

    o_a.set(2)
    spy.was.called.once.with(2)
    obs.pause()
    o_a.set(3)
    o_a.set(4)
    o_a.set(5)
    obs.resume()
    spy.was.called.once.with(5)
  })

  it('filter', () => {
    const o_arr = o([1, 2, 3, 4])
    const o_f = o_arr.filter(v => v % 2 === 0)
    const spy_f = spyon(o_f)

    expect(o_f.get()).to.eql([2, 4])
    o_arr.set([1, 2, 3, 4, 5, 6])
    expect(o_f.get()).to.eql([2, 4, 6])
    spy_f.was.called.once.with([2, 4, 6])

    o_f.set([3, 5, 6])
    spy_f.was.called.once.with([6])
    expect(o_arr.get()).to.eql([1, 3, 3, 5, 5, 6])

    // can't set a filtered array with a different length !
    expect(() => { o_f.set([1, 2]) }).to.throw
  })

  it('debounce', async function () {
    const s = spyon(o_simple, {debounce: 5})
    o_simple.set(1)
    o_simple.set(2)
    o_simple.set(3)
    await wait(6)
    s.was.called.once.with(3, 0)
    o_simple.set(2)
    o_simple.set(1)
    o_simple.set(-1)
    await wait(6)
    s.was.called.once.with(-1, 3)
  })

  it.only('throttle', async function () {
    const s = spyon(o_simple, {throttle: 10})
    o_simple.set(1)
    o_simple.set(2)
    o_simple.set(3)
    s.was.called.once.with(1, 0)
    await wait(15)
    s.was.called.once.with(3, 1)
    o_simple.set(2)
    o_simple.set(1)
    await wait(10)
    s.was.called.once.with(1, 3)
  })
})
