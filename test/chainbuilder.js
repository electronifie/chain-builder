"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

before(function () { mockery.enable({ warnOnUnregistered: false }); });
after(function () {
  mockery.deregisterAll();
  mockery.disable();
});

describe('ChainBuilder', function () {

  var chainBuilder = require('..');

  describe('flow', function () {
    it('takes a dictionary of functions, and makes them chainable', function (done) {
      var calls = [];

      var myChain = chainBuilder({
        methods: {
          testOne: function (done) {
            calls.push('test-one');
            done(null, 'one');
          },
          testTwo: function (arg1, done) {
            calls.push('test-two:' + arg1);
            done(null, 'two');
          },
          testThree: function (done) {
            calls.push('test-three');
            done(null, 'three');
          }
        }
      });

      myChain({})
        .testTwo('FOO')
        .testThree()
        .testOne()
        .testTwo('BAR')
        .testOne()
        .end(function (err, result) {
          assert.deepEqual(calls, ['test-two:FOO', 'test-three', 'test-one', 'test-two:BAR', 'test-one']);
          assert.equal(result, 'one');
          done();
        });
    });

    it('executes immediately if an initial value is passed', function (done) {
      var testOneStub = sinon.stub();
      var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub,
          testTwo: testTwoStub
        }
      });

      var myChainImpl = myChain({})
        .testOne();

      assert.ok(testOneStub.calledOnce);

      myChainImpl.testTwo();
      // testTwo() should not yet have run, as the callback for testOne was not called
      assert.ok(testTwoStub.notCalled);

      // Execute the callback of the first arg
      testOneStub.firstCall.args[0](null, 'one');
      assert.ok(testTwoStub.calledOnce);

      myChainImpl.end(function (err, result) {
        assert.equal(result, 'two');
        done();
      });
    });

    it('defers execution until #run() is called if nothing is passed', function (done) {
      var plusStub = sinon.spy(function (num, done) { done(null, this.previousResult() + num); });
      var timesStub = sinon.spy(function (num, done) { done(null, this.previousResult() * num); });

      var myChain = chainBuilder({
        methods: {
          plus: plusStub,
          times: timesStub
        }
      });

      var myChainImpl = myChain()
        .times(3)
        .plus(2);

      assert.ok(plusStub.notCalled);
      assert.ok(timesStub.notCalled);

      myChainImpl.run(5, function (err, result) {
        assert.ok(plusStub.calledOnce);
        assert.ok(timesStub.calledOnce);
        assert.equal(result, 17);

        myChainImpl.run(2, function (err, result) {
          assert.ok(plusStub.calledTwice);
          assert.ok(timesStub.calledTwice);
          assert.equal(result, 8);
          done();
        });
      });
    });

    it('allows #run() to be called with only a callback', function (done) {

      var myChain = chainBuilder({
        methods: { }
      });

      var myChainImpl = myChain().inject(1);

      myChainImpl.run(function (err, result) {
        assert.equal(result, 1);
        done();
      });
    });

    it('allows #run() to be called without any params', function (done) {

      var myChain = chainBuilder({
        methods: { }
      });

      var myChainImpl = myChain()
        .inject(1)
        .tap(function (err, result) { assert.equal(result, 1); })
        .tap(done);

      myChainImpl.run();
    });

    it('allows functions to access the result of the last call', function (done) {
      var testOneStub = sinon.stub().callsArgWith(0, null, 'one');
      var testTwoStub = function (done) {
        var result = this.previousResult() + 'two';
        done(null, result);
      };

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub,
          testTwo: testTwoStub
        }
      });

      myChain({})
        .testOne()
        .testTwo()
        .end(function (err, result) {
          assert.equal(result, 'onetwo');
          done();
        });
    });

    it('gives methods access to other methods on the chain via this.getMethod(functionName)', function (done) {
      var prefixPrepender = function (prefix, word, done) { done(null, prefix + word); };
      var inPrepender = function (word, done) { this.getMethod('prefixPrepender')('in', word, done); };

      var myChain = chainBuilder({
        methods: {
          prefixPrepender: prefixPrepender,
          inPrepender: inPrepender
        }
      });

      myChain({})
        .prefixPrepender('con', 'sequential')
        .tap(function (err, result) {
          assert.equal(result, 'consequential');
        })
        .inPrepender('satiable')
        .tap(function (err, result) {
          if (err) return;
          assert.equal(result, 'insatiable');
        })
        .end(done);
    });

    it('allows user-defined sub-chains via the $beginSubchain and $endSubchain properties', function (done) {
      var getArray = function (done) { return done(null, [1, 2, 3]); };
      var plus = function (num, done) { done(null, this.previousResult() + num); };
      var times = function (num, done) { done(null, this.previousResult() * num); };
      var beginMap = function (done) {
        this.skip(done);
      };
      beginMap.$beginSubchain = 'map';

      var endMap = function (subchain, done) {
        var source = this.previousResult();

        var iterate = function (results) {
          var i = results.length;
          if (i == source.length) return done(null, results);
          var nextResult = source[i];
          subchain.run(nextResult, function (err, result) {
            if (err) return done(err);
            results.push(result);
            iterate(results);
          });
        };
        iterate([]);
      };
      endMap.$endSubchain = 'map';

      var myChain = chainBuilder({
        methods: {
          $begin_map: beginMap,
          $end_map: endMap,
          getArray: getArray,
          plus: plus,
          times: times
        }
      });

      myChain({})
        .getArray()
        .$begin_map()
          .plus(1)
          .times(2)
        .$end_map()
        .tap(function (err, result) {
          if (err) return err;
          assert.deepEqual(result, [4, 6, 8])
        })
        .end(done);
    });

    it('allows embedding of sub-chains', function (done) {

      var plus = function (num, done) { done(null, this.previousResult() + num); };
      var times = function (num, done) { done(null, this.previousResult() * num); };
      var append = function (val, done) { done(null, this.previousResult().concat(val)); };
      var beginMap = function (done) { this.skip(done); };
      beginMap.$beginSubchain = 'map';

      var endMap = function (subchain, done) {
        var source = this.previousResult();

        var iterate = function (results) {
          var i = results.length;
          if (i == source.length) return done(null, results);
          var nextResult = source[i];
          subchain.run(nextResult, function (err, result) {
            if (err) return done(err);
            results.push(result);
            iterate(results);
          });
        };
        iterate([]);
      };
      endMap.$endSubchain = 'map';

      var myChain = chainBuilder({
        methods: {
          $begin_map: beginMap,
          $end_map: endMap,
          append: append,
          plus: plus,
          times: times
        }
      });

      var appendFiveAddOneTimesTwo = myChain()
        .$begin_map()
          .append(5)
          .$begin_map()
            .plus(1)
            .times(2)
          .$end_map()
        .$end_map();

      appendFiveAddOneTimesTwo.run([[1,2], [3,4]], function (err, result) {
        if (err) return done(err);
        assert.deepEqual(result, [ [4, 6, 12], [8, 10, 12] ]);
        done();
      });

    });

    it('grants access to the parent context of a sub-chain', function (done) {
      var saveToObject = function (key, value, done) {
        this[key] = value;
        this.skip(done);
      };

      var $beginWithSubchain = function (done) { this.skip(done); };
      $beginWithSubchain.$beginSubchain = 'withSubchain';

      var $endWithSubchain = function (subchain, done) {
        var source = this.previousResult();
        subchain.run(source, done);
      };
      $endWithSubchain.$endSubchain = 'withSubchain';

      var myChain = chainBuilder({
        methods: {
          $beginWithSubchain: $beginWithSubchain,
          $endWithSubchain: $endWithSubchain,
          saveToObject: saveToObject
        }
      });

      myChain() // ------------------------------------------------------------- grandparent
        .saveToObject('savedValue', 'value-1')
        .tap(function (err) {
          if (err) return;
          assert.equal(this.savedValue, 'value-1');
        })

        .$beginWithSubchain() // ----------------------------------------------- parent
          .saveToObject('savedValue', 'value-2')
          .tap(function (err) {
            if (err) return;
            assert.equal(this.savedValue, 'value-2');
            assert.equal(this.parent.savedValue, 'value-1');
          })

          .$beginWithSubchain() // --------------------------------------------- child
            .tap(function (err) {
              if (err) return;
              assert.equal(this.savedValue, undefined);
              assert.equal(this.parent.savedValue, 'value-2');
              assert.equal(this.parent.parent.savedValue, 'value-1');
            })
          .$endWithSubchain()

        .$endWithSubchain()

        .$beginWithSubchain() // ----------------------------------------------- parent's sibling
          .tap(function (err) {
            if (err) return;
            assert.equal(this.savedValue, undefined);
          })
        .$endWithSubchain()

        .tap(function (err) {
          if (err) return;
          assert.equal(this.savedValue, 'value-1');
        })
        .run(done);

    });

    it('supports aggregate functions with #newChain', function (done) {
      var plus = function (num, done) { done(null, this.previousResult() + num); };
      var times = function (num, done) { done(null, this.previousResult() * num); };
      var addOneAndTimesTwo = function (done) {
        var chain = this.newChain(this.previousResult());
        assert.equal(typeof chain.plus, 'function');

        chain
          .plus(1)
          .times(2)
          .end(done);
      };

      var myChain = chainBuilder({
        methods: {
          plus: plus,
          times: times,
          addOneAndTimesTwo: addOneAndTimesTwo
        }
      });

      myChain(3)
        .addOneAndTimesTwo()
        .tap(function (err, result) {
          if (err) return err;
          assert.deepEqual(result, 8)
        })
        .end(done);
    });
  });

  describe('error handling', function () {
    it('catches passed errors', function (done) {
      var testOneStub = sinon.stub().callsArgWith(0, 'AN ERROR');
      var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub,
          testTwo: testTwoStub
        }
      });

      myChain({})
        .testOne()
        .testTwo()
        .end(function (err, result) {
          assert.ok(testOneStub.calledOnce);
          assert.ok(testTwoStub.notCalled);
          assert.equal(err, 'AN ERROR');
          assert.equal(result, undefined);
          done();
        });

    });

    it('catches thrown errors', function (done) {
      var testOneStub = sinon.stub().throws(new Error('AN ERROR'));
      var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub,
          testTwo: testTwoStub
        }
      });

      myChain({})
        .testOne()
        .testTwo()
        .end(function (err, result) {
          try {
            assert.ok(testOneStub.calledOnce);
            assert.ok(testTwoStub.notCalled);
            assert.equal(err.message, 'AN ERROR');
            assert.equal(result, undefined);
            done();
          } catch (e) {
            done(e);
          }
        });

    });

    it('catches errors thrown within async functions', function (done) {
      var testOneStub = function (done) {
        setTimeout(function () { throw new Error('AN ERROR'); }, 1);
      };
      var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub,
          testTwo: testTwoStub
        }
      });

      myChain({})
        .testOne()
        .testTwo()
        .end(function (err, result) {
          try {
            assert.ok(testTwoStub.notCalled);
            assert.equal(err.message, 'AN ERROR');
            assert.equal(result, undefined);
            done();
          } catch (e) {
            done(e);
          }
        });

    });

    it('cascades an error through tap methods', function (done) {
      var i = 0;
      var throwAnErrorStub = sinon.stub().callsArgWith(0, 'ERROR' + i++);
      var normalOpStub = sinon.stub().callsArgWith(0, null, 'boring');

      var myChain = chainBuilder({
        methods: {
          throwAnError: throwAnErrorStub,
          normalOp: normalOpStub
        }
      });

      var tapOne = sinon.stub();
      var tapTwo = sinon.stub();
      var tapThree = sinon.stub();
      var tapFour = sinon.stub();

      myChain({})
        .normalOp()
        .tap(tapOne)
        .throwAnError()
        .tap(tapTwo)
        .normalOp()
        .tap(tapThree)
        .throwAnError()
        .tap(tapFour)
        .end(function (err, result) {
          try {
            assert.ok(throwAnErrorStub.calledOnce);
            assert.ok(normalOpStub.calledOnce);
            assert.equal(err, 'ERROR0');

            assert.ok(tapOne.calledOnce);
            assert.ok(tapTwo.calledOnce);
            assert.ok(tapThree.calledOnce);
            assert.ok(tapFour.calledOnce);

            assert.deepEqual(tapOne.firstCall.args, [ null, 'boring' ]);
            assert.deepEqual(tapTwo.firstCall.args, [ 'ERROR0', undefined ]);
            assert.deepEqual(tapThree.firstCall.args, [ 'ERROR0', undefined ]);
            assert.deepEqual(tapFour.firstCall.args, [ 'ERROR0', undefined ]);

            done();
          } catch (e) { done(e); }
        });
    });
  });

  describe('real world examples', function () {
    it('can load functions from a directory in collaboration with requireDir', function (done) {
      mockery.registerMock('http', {
        get: function (url, cb) {
          setTimeout(function () {
            assert.equal(url, 'http://myapi.com/users.json');
            cb({ body: '[{"id": "u1", "name": "bob"}, {"id": "u2", "name": "sarah"}]' });
          }, 10);
          return this;
        },
        on: function () { /* no-op */ }
      });

      var requireDir = require('require-dir');
      var requestMapper = chainBuilder({
        methods: requireDir('./request-mapper')
      });

      requestMapper({})
        .get('http://myapi.com/users.json')
        .map(function (user) { return user.name; })
        .end(function (err, result) {
          try {
            assert.equal(err, undefined);
            assert.deepEqual(result, [ 'bob', 'sarah' ]);
            done();
          } catch (e) {
            done(e);
          }
        })
    });
  });

  describe('mixins', function () {
    it('can mix in packages of functions', function (done) {
      var mixinPackageOne = {
        one: sinon.stub().callsArgWith(0, null, 'one'),
        two: sinon.stub().callsArgWith(0, null, 'two')
      };
      var mixinPackageTwo = {
        three: sinon.stub().callsArgWith(0, null, 'three')
      };

      var myChain = chainBuilder({
        methods: {
          four: sinon.stub().callsArgWith(0, null, 'four')
        },
        mixins: [mixinPackageOne, mixinPackageTwo]
      });

      myChain({})
        .one()
        .tap(function (err, result) {
          if (err) return;
          assert.equal(result, 'one')
        })
        .two()
        .tap(function (err, result) {
          if (err) return;
          assert.equal(result, 'two')
        })
        .three()
        .tap(function (err, result) {
          if (err) return;
          assert.equal(result, 'three')
        })
        .four()
        .tap(function (err, result) {
          if (err) return;
          assert.equal(result, 'four')
        })
        .end(done);
    });

    it('throws an error if a method was provided by another mixin', function () {
      var mixinPackageOne = {
        one: sinon.stub().callsArgWith(0, null, 'one'),
        two: sinon.stub().callsArgWith(0, null, 'two')
      };
      var mixinPackageTwo = {
        two: sinon.stub().callsArgWith(0, null, 'two'),
        three: sinon.stub().callsArgWith(0, null, 'three')
      };

      assert.throws(function () {
        var myChain = chainBuilder({
          mixins: [mixinPackageOne, mixinPackageTwo]
        });
      }, 'Method "two" was provided by "mixin #0" and "mixin #1".');
    });

    it('allows mixins to define context methods via the $contextMethod property', function (done) {
      var useContextMethod = function (done) {
        assert.equal(typeof this.myContextMethod, 'function');
        done(null, this.myContextMethod());
      };
      var myContextMethod = function () {
        return 'from-context-method';
      };
      myContextMethod.$contextMethod = true;

      var myChain = chainBuilder({
        methods: {
          useContextMethod: useContextMethod
        },
        mixins: [{
          myContextMethod: myContextMethod
        }]
      });

      // the context method shouldn't be present on the outer chain.
      assert.equal(typeof myChain.myContextMethod, 'undefined');

      myChain({})
        .useContextMethod()
        .tap(function (err, result) {
          if (err) return err;
          assert.equal(result, 'from-context-method');
        })
        .end(done);
    });
  });

  describe('validation', function () {
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

  describe('logging', function () {
    describe('provides a logger with "chainStart", "chainEnd", "callStart" and "callEnd" events', function () {
      var eventTypes, payloads;

      beforeEach(function (done) {
        eventTypes = [];
        payloads = [];

        var logger = {};
        logger.log = function (eventType, details) {
          eventTypes.push(eventType);
          payloads.push(details);
        };
        logger.log.$logHandler = true;

        var $beginBlock = function (cb) { cb(null, 'beginning block'); };
        var $endBlock = function (chain, cb) { chain.run(cb); };
        $beginBlock.$beginSubchain = 'block';
        $endBlock.$endSubchain = 'block';

        var myChain = chainBuilder({
          methods: {
            testOne: function (arg, cb) { cb(null, arg + '-one'); },
            testTwo: function (cb) { setTimeout(cb.bind(cb, null, 'two'), 10); },
            testThree: function (cb) { this.newChain().testOne('three').run(cb); },
            $beginBlock: $beginBlock,
            $endBlock: $endBlock
          },
          mixins: [ logger ]
        });

        myChain()
          .testOne('a')
          .$beginBlock()
            .testOne('b')
            .testTwo()
          .$endBlock()
          .testThree()
          .run(done);
      });

      it('provides the appropriate event types', function () {
        assert.deepEqual(eventTypes, [
          'chainStart',
            'callStart', 'callEnd',      // testOne
            'callStart', 'callEnd',      // $beginBlock
            'callStart',                 // $endBlock
              'chainStart',
                'callStart', 'callEnd',  // testOne
                'callStart', 'callEnd',  // testTwo
              'chainEnd',
            'callEnd',
            'callStart',               // testThree
              'chainStart',
                'callStart', 'callEnd',  // testOne
              'chainEnd',
            'callEnd',
          'chainEnd'
        ]);
      });

      it('provides event names', function () {
        assert.deepEqual(_.map(payloads, 'methodName'), [
          undefined,                       // chainStart (chain methods don't supply methodName)
            'testOne', 'testOne',
            '$beginBlock', '$beginBlock',
            '$endBlock',
              undefined,                   // chainStart
                'testOne', 'testOne',
                'testTwo', 'testTwo',
              undefined,                   // chainEnd
            '$endBlock',
            'testThree',
              undefined,                   // chainStart
                'testOne', 'testOne',
              undefined,                   // chainEnd
            'testThree',
          undefined                        // chainEnd
        ]);
      });

      it('provides timing information', function () {
        assert.deepEqual(_.map(payloads, function (p) { return typeof p.runTime; }), [
          'undefined',
            'undefined', 'number',
            'undefined', 'number',
            'undefined',
              'undefined',
                'undefined', 'number',
                'undefined', 'number',
              'number',
            'number',
            'undefined',
              'undefined',
                'undefined', 'number',
              'number',
            'number',
          'number'
        ]);

        assert.ok(payloads[ 10 ].runTime >= 10);  // testTwo has a 10ms delay
        assert.ok(payloads[ 10 ].runTime < 100);  // sanity check

        assert.ok(payloads[ 11 ].runTime >= 10);  // testTwo delay affects subchain runtime
        assert.ok(payloads[ 11 ].runTime < 100);

        assert.ok(payloads[ 12 ].runTime >= 10);  // testTwo delay affects $endBlock runtime
        assert.ok(payloads[ 12 ].runTime < 100);

        assert.ok(payloads[ 19 ].runTime >= 10);  // testTwo delay affects overall chain runtime
        assert.ok(payloads[ 19 ].runTime < 100);
      });

      it('provides associative IDs', function () {
        var instanceIds = _.map(payloads, 'instanceId');
        var uniqueIds = _.uniq(instanceIds);
        assert.equal(uniqueIds.length, 10, 'Expected 10 distinct IDs, instead got: ' + uniqueIds.join(', '));

        var index = 0;
        _(instanceIds).groupBy(function (id) {
          return [
          'A',
            'B', 'B',
            'C', 'C',
            'D',
              'E',
                'F', 'F',
                'G', 'G',
              'E',
            'D',
            'H',
              'I',
                'J', 'J',
              'I',
            'H',
          'A'
          ][index++];
        }).each(function (ids) {
          assert(typeof ids[0], 'string');
          assert(typeof ids[1], 'string');

          // Verify each ID matches its counterpart
          assert.equal(ids[1], ids[0]);
        });

        var chainInstanceIds = _.map(payloads, 'chainInstanceId');

        [
        //  0,              chainStart
              1, 2,
              3, 4,
              5,
        //      6,          chainStart
        //        7, 8,     differentParentChain
        //        9, 10,    differentParentChain
        //      11,         chainEnd
              12,
              13,
        //      14,         chainStart
        //        15, 16,   differentParentChain
        //      17,         chainEnd
              18,
        //  19              chainEnd
        ].forEach(function (index) {
          assert.equal(chainInstanceIds[index], instanceIds[0]);
        });

        [
        //  0,
        //    1, 2,
        //    3, 4,
        //    5,
        //      6,
                  7, 8,
                  9, 10,
        //      11,
        //    12,
        //    13,
        //      14,
        //        15, 16,
        //      17,
        //    18,
        //  19
        ].forEach(function (index) {
          assert.equal(chainInstanceIds[index], instanceIds[6]);
        });

        [
        //  0,
        //    1, 2,
        //    3, 4,
        //    5,
        //      6,
        //        7, 8,
        //        9, 10,
        //      11,
        //    12,
        //    13,
        //      14,
                  15, 16,
        //      17,
        //    18,
        //  19
        ].forEach(function (index) {
          assert.equal(chainInstanceIds[index], instanceIds[14]);
        });

        var parentChainInstanceIds = _.map(payloads, 'parentChainInstanceId');

        [
        //  0,
        //    1, 2,
        //    3, 4,
        //    5,
                6,
        //        7, 8,
        //        9, 10,
                11,
        //    12,
        //    13,
                14,
        //        15, 16,
                17,
        //    18,
        //  19
        ].forEach(function (index) {
          assert.equal(parentChainInstanceIds[index], instanceIds[0]);
        });

        [
            0,
        //    1, 2,
        //    3, 4,
        //    5,
        //      6,
        //        7, 8,
        //        9, 10,
        //      11,
        //    12,
        //    13,
        //      14,
        //        15, 16,
        //      17,
        //    18,
            19
        ].forEach(function (index) {
          assert.equal(parentChainInstanceIds[index], null);
        });
      });

      it('provides depth', function () {
        assert.deepEqual(_.map(payloads, 'depth'), [
          0,
            0, 0,
            0, 0,
            0,
              1,
                1, 1,
                1, 1,
              1,
            0,
            0,
              1,
                1, 1,
              1,
            0,
          0
        ]);
      });

      it('provides results', function () {
        assert.deepEqual(_.map(payloads, 'result'), [
          undefined,
            undefined, 'a-one',
            undefined, 'beginning block',
            undefined,
              undefined,
                undefined, 'b-one',
                undefined, 'two',
              'two',
            'two',
            undefined,
              undefined,
                undefined, 'three-one',
              'three-one',
            'three-one',
          'three-one'
        ]);
      });

    });
  });

  describe('#tap', function () {
    it('lets you peek at the current result within a chain', function (done) {
      var testOneStub = sinon.stub().callsArgWith(0, null, 'one');
      var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub,
          testTwo: testTwoStub
        }
      });

      myChain({})
        .testTwo()
        .tap(function (err, result) {
          assert.equal(result, 'two');
        })
        .testOne()
        .end(function (err, result) {
          assert.equal(result, 'one');
          done();
        });
    });
  });

  describe('#recover', function () {
    it('allows recovery from an error', function (done) {
      var i = 0;
      var throwAnErrorStub = sinon.stub().callsArgWith(0, 'ERROR' + i++);
      var normalOpStub = sinon.stub().callsArgWith(0, null, 'boring');

      var myChain = chainBuilder({
        methods: {
          throwAnError: throwAnErrorStub,
          normalOp: normalOpStub
        }
      });

      var tapOne = sinon.stub();
      var tapTwo = sinon.stub();
      var tapThree = sinon.stub();
      var tapFour = sinon.stub();

      myChain({})
        .throwAnError()
        .tap(tapOne)
        .normalOp() // skipped
        .tap(tapTwo)
        .recover(function (err, cb) {
          assert.equal(err, 'ERROR0');
          cb(null, 'FIXED IT');
        })
        .tap(tapThree)
        .normalOp()
        .tap(tapFour)
        .end(function (err, result) {
          try {
            assert.equal(err, null);
            assert.equal(result, 'boring');
            assert.ok(normalOpStub.calledOnce);

            assert.deepEqual(tapOne.firstCall.args, [ 'ERROR0', undefined ]);
            assert.deepEqual(tapTwo.firstCall.args, [ 'ERROR0', undefined ]);
            assert.deepEqual(tapThree.firstCall.args, [ null, 'FIXED IT' ]);
            assert.deepEqual(tapFour.firstCall.args, [ null, 'boring' ]);

            done();
          } catch (e) { done(e); }
        });
    });
  });

  describe('#transform', function () {
    it('allows you to transform a result', function (done) {
      var testOneStub = sinon.stub().callsArgWith(0, null, 'one');

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub
        }
      });

      var tapOne = sinon.stub();
      var tapTwo = sinon.stub();

      myChain({})
        .testOne()
        .tap(tapOne)
        .transform(function (err, result, cb) {
          assert.equal(err, null);
          assert.equal(result, 'one');
          cb(null, result + 'two');
        })
        .tap(tapTwo)
        .tap(function (err, result) {
          if (err) return;
          assert.equal(err, null);
          assert.equal(result, 'onetwo');

          assert.deepEqual(tapOne.firstCall.args, [ null, 'one' ]);
          assert.deepEqual(tapTwo.firstCall.args, [ null, 'onetwo' ]);
        })
        .end(done);
    });
  });

  describe('#transformResult', function () {
    it('allows you to synchronously transform a result', function (done) {
      var myChain = chainBuilder({
        methods: {
          testOne: sinon.stub().callsArgWith(0, null, 'one')
        }
      });

      var tapOne = sinon.stub();

      myChain({})
        .testOne()
        .tap(tapOne)
        .transformResult(function (result) {
          return result + 'two';
        })
        .tap(function (err, result) {
          if (err) return;
          assert.equal(err, null);
          assert.equal(result, 'onetwo');
        })
        .end(done);
    });
  });

  describe('#inject', function () {
    it('injects values into the chain', function (done) {

      var previousResult = [];
      var myChain = chainBuilder({
        methods: {
          recordPreviousResult: function(done) {
            previousResult.push(this.previousResult());
            done();
          }
        }
      });

      myChain('init')
        .recordPreviousResult()
        .inject('foobar')
        .recordPreviousResult()
        .tap(function (err) {
          if (err) return;
          assert.deepEqual(previousResult, ['init', 'foobar']);
        })
        .end(done);
    });
  });

});
