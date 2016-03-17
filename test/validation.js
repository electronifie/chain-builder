"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Validation', function () {

  var chainBuilder = require('..');

  describe('$args', function () {
    it('populates non-provided args with defaults', function (done) {
      var myMethod = function (argA, argB, argC, argD, cb) {
        assert.equal(typeof argA, 'string');
        assert.equal(typeof argB, 'object');
        assert.equal(typeof argC, 'number');
        assert.equal(typeof cb, 'function');

        cb(null, [argA, argB, argC, argD]);
      };

      myMethod.$args = [{ default: 'a' }, { default: {} }, { default: 1 }, { defaultToPreviousResult: true }];

      var cb = chainBuilder({ methods: { myMethod: myMethod } });

      cb()
        .inject('pr-1')
        .myMethod()
        .transformResult(function (result) { assert.deepEqual(result, ['a', {}, 1, 'pr-1']); })

        .inject('pr-2')
        .myMethod('b')
        .transformResult(function (result) { assert.deepEqual(result, ['b', {}, 1, 'pr-2']); })

        .inject('pr-3')
        .myMethod('c', { foo: 'bar' })
        .transformResult(function (result) { assert.deepEqual(result, ['c', { foo: 'bar' }, 1, 'pr-3']); })

        .inject('pr-4')
        .myMethod('d', { bar: 'bing' }, 2)
        .transformResult(function (result) { assert.deepEqual(result, ['d', { bar: 'bing' }, 2, 'pr-4']); })


        .inject('pr-5')
        .myMethod('e', { bar: 'bap' }, 3, 'bop')
        .transformResult(function (result) { assert.deepEqual(result, ['e', { bar: 'bap' }, 3, 'bop']); })

        .run(done);

    });

    it('asserts required args', function (done) {
        var myMethod = function (argA, argB, argC, cb) { cb(null, [argA, argB, argC]); };
        myMethod.$args = [{ required: true }, { required: true }, { default: 'c' }];
        var cb = chainBuilder({ methods: { myMethod: myMethod } });

        cb()
          .myMethod()
          .transform(function (err, result, cb) {
            assert.equal(err && err.message, 'Validation Error. Argument 1 is required but was not provided.');
            cb();
          })
          .run(done);
    });

    it('asserts no more than the expected number of args are provided', function (done) {
      var myMethod = function (argA, argB, argC, cb) { cb(null, [argA, argB, argC]); };
      myMethod.$args = [{ required: true }, { required: true }, { default: '3' }];
      var cb = chainBuilder({ methods: { myMethod: myMethod } });

      cb()
        .myMethod('one', 'two', 'three', 'four')
        .transform(function (err, result, cb) {
          assert.equal(err && err.message, 'Validation Error. Expected 3 arguments, but got 4');
          cb();
        })
        .run(done);
    });

    describe('validates argument type', function () {
      var cb;
      beforeEach(function () {
        var myMethod = function (argA, argB, argC, cb) { cb(null, [argA, argB, argC]); };
        myMethod.$args = [{ type: 'string' }, { type: 'object' }, { type: 'number' }];
        cb = chainBuilder({ methods: { myMethod: myMethod } });
      });

      it('passes validation', function (done) {
        cb()
          .myMethod('a', {}, 0)
          .transform(function (err, result, cb) {
            assert.notOk(err);
            assert.deepEqual(result, ['a', {}, 0]);
            cb();
          })
          .run(done);
      });

      it('reports invalid string', function (done) {
        cb()
          .myMethod(0, {}, 0)
          .transform(function (err, result, cb) {
            assert.equal(err && err.message, 'Validation Error. Expected "number" to be "string" for: 0');
            cb();
          })
          .run(done);
      });

      it('reports invalid object', function (done) {
        cb()
          .myMethod('a', 'foo', 0)
          .transform(function (err, result, cb) {
            assert.equal(err && err.message, 'Validation Error. Expected "string" to be "object" for: foo');
            cb();
          })
          .run(done);
      });

      it('reports invalid number', function (done) {
        cb()
          .myMethod('a', { }, 'foo')
          .transform(function (err, result, cb) {
            assert.equal(err && err.message, 'Validation Error. Expected "string" to be "number" for: foo');
            cb();
          })
          .run(done);
      });
    });

    describe('validates class instances', function () {
      it('fails if the wrong type is provided', function (done) {
        var FooClass = function FooClass (name) { this.name = name; };
        var BarClass = function BarClass (name) { this.name = name; };

        var myMethod = function (argA, cb) { cb(null, this.previousResult()); };
        myMethod.$args = [{ instanceOf: FooClass }];
        var cb = chainBuilder({ methods: { myMethod: myMethod } });

        cb()
          .myMethod(new BarClass('bar'))
          .transform(function (err, result, cb) {
            assert.equal(err && err.message, 'Validation Error. Expected argument 1 to be an instance of <FooClass>');
            cb();
          })
          .run(done);
      });

      it('passes if the right type is provided', function (done) {
        var FooClass = function FooClass (name) { this.name = name; };

        var myMethod = function (argA, cb) { cb(null, this.previousResult()); };
        myMethod.$args = [{ instanceOf: FooClass }];
        var cb = chainBuilder({ methods: { myMethod: myMethod } });

        cb()
          .myMethod(new FooClass('bar'))
          .run(done);
      });
    });

    it('generates args when a non-expected function is provided', function (done) {
      var myMethod = function (argA, argB, argC, argD, cb) { cb(null, [argA, argB, argC, typeof argD]); };
      myMethod.$args = [{ type: 'string' }, { type: 'object' }, { type: 'number' }, { type: 'function' }];
      var cb = chainBuilder({ methods: { myMethod: myMethod } });

      cb()
        .inject(5)
        .myMethod(
          function (r) { return 'str-' + r; },
          function (r) { return { val: this.previousResult() }; },
          function (r) { return r; },
          function (r) { throw new Error('This should not be run, as a function is expected') }
        )
        .transformResult(function (r) { assert.deepEqual(r, [ 'str-5', { val: 5 }, 5, 'function' ]) })
        .run(done);
    });

    it('works together', function (done) {
      var myMethod = function (argA, argB, argC, cb) {
        cb(null, [argA, argB, argC]);
      };
      myMethod.$args = [{
        type: 'string',
        default: 'foobar'
      }, {
        type: 'object',
        defaultToPreviousResult: true
      }, {
        type: 'number',
        default: 42
      }];
      var cb = chainBuilder({ methods: { myMethod: myMethod } });

      cb()
        .myMethod(1)
        .transform(function (err, result, cb) {
          assert.equal(err && err.message, 'Validation Error. Expected "number" to be "string" for: 1');
          cb();
        })

        .inject({ foo: 'bar'})
        .myMethod()
        .transformResult(function (result) {
          assert.deepEqual(result, ['foobar', { foo: 'bar' }, 42])
        })

        .run(done);
    });
  });

  describe('$previousResult', function () {
    describe('$previousResult.type', function () {
      it('fails if previousResult is the wrong type', function (done) {
        var myMethod = function (cb) { cb(null, this.previousResult()); };
        myMethod.$previousResult = { type: 'string' };
        var cb = chainBuilder({ methods: { myMethod: myMethod } });

        cb()
          .inject(123)
          .myMethod()
          .transform(function (err, result, cb) {
            assert.equal(err && err.message, 'Validation Error. Expected previousResult to be "string" but was "number": 123');
            cb();
          })
          .run(done);
      });

      it('passes if previousResult is the right type', function (done) {
        var myMethod = function (cb) { cb(null, this.previousResult()); };
        myMethod.$previousResult = { type: 'number' };
        var cb = chainBuilder({ methods: { myMethod: myMethod } });

        cb()
          .inject(123)
          .myMethod()
          .run(done);
      });
    });

    describe('$previousResult.instanceOf', function () {
      it('fails if previousResult is the wrong type', function (done) {
        var FooClass = function FooClass (name) { this.name = name; };

        var myMethod = function (cb) { cb(null, this.previousResult()); };
        myMethod.$previousResult = { instanceOf: FooClass };
        var cb = chainBuilder({ methods: { myMethod: myMethod } });

        cb()
          .inject({ name: 'foo' })
          .myMethod()
          .transform(function (err, result, cb) {
            assert.equal(err && err.message, 'Validation Error. Expected previousResult to be an instance of <FooClass>');
            cb();
          })
          .run(done);
      });

      it('passes if previousResult is the right type', function (done) {
        var FooClass = function FooClass (name) { this.name = name; };

        var myMethod = function (cb) { cb(null, this.previousResult()); };
        myMethod.$previousResult = { instanceOf: FooClass };
        var cb = chainBuilder({ methods: { myMethod: myMethod } });

        cb()
          .inject(new FooClass('foo'))
          .myMethod()
          .run(done);
      });
    });
  });
});
