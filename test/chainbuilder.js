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

      myChain()
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

      myChain()
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

      myChain()
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

      requestMapper()
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
  });

  it('allows functions to access the result of the last call');
  it('allows different error handling methods defined throughout the chain');
  it('allows recovery from an error');
  it('allows you to transform a result');
  it('allows different recovery methods defined throughout the chain');
});
