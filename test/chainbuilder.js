var assert = require('chai').assert;
var sinon = require('sinon');

describe('ChainBuilder', function () {

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

    myChain()
      .testTwo('FOO')
      .testThree()
      .testOne()
      .testTwo('BAR')
      .testOne()
      .end(function (err, result) {
        assert.deepEqual(calls, ['test-two:FOO', 'test-three', 'test-one', 'test-two:BAR', 'test-one'])
        assert.equal(result, 'one');
        done();
      });
  });

  it('executes immediately', function (done) {
    var testOneStub = sinon.stub();
    var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

    var myChain = chainBuilder({
      methods: {
        testOne: testOneStub,
        testTwo: testTwoStub
      }
    });

    var myChainImpl = myChain()
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

  it('lets you .tap() into a chain while executing', function (done) {
    var testOneStub = sinon.stub().callsArgWith(0, null, 'one');
    var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

    var myChain = chainBuilder({
      methods: {
        testOne: testOneStub,
        testTwo: testTwoStub
      }
    });

    myChain()
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

  it('catches errors');

  it('can load functions from a directory in collaboration with requireDir');
  it('allows functions to access the result of the last call');
  it('allows different error handling methods defined throughout the chain');
  it('allows recovery from an error');
  it('allows you to transform a result');
  it('allows different recovery methods defined throughout the chain');
});
