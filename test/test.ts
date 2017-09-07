
require('source-map-support').install()

///////////////////////////////////////////////////////////

import 'mocha'
import {expect} from 'chai'

import {o} from '../observable'

import {spyon} from './common'

beforeEach(() => {
  o_deep = o({a: 1, b: {c: 1}})
  o_simple = o(0)
  o_deep_a = o_deep.p('a')
  o_deep_c = o_deep.p('b').p('c')
  deep_spy = spyon(o_deep)
  deep_c_spy = spyon(o_deep_c)
  deep_a_spy = spyon(o_deep_a)
  simple_spy = spyon(o_simple)
})

afterEach(function () {
  spyon.clean()
})

var o_deep = o({a: 1, b: {c: 1}})
var o_simple = o(0)
var o_deep_a = o_deep.p('a')
var o_deep_c = o_deep.p('b').p('c')
var simple_spy = spyon(o_simple)
var deep_spy = spyon(o_deep)
var deep_c_spy = spyon(o_deep_c)
var deep_a_spy = spyon(o_deep_a)


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
})
