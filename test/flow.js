"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Flow', function () {

  var chainBuilder = require('..');

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
