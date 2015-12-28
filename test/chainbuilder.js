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
      var initialValue;
      var testOneStub = sinon.spy(function (done) {
        initialValue = this.previousResult();
        done();
      });
      var testTwoStub = sinon.stub().callsArgWith(0, null, 'two');

      var myChain = chainBuilder({
        methods: {
          testOne: testOneStub,
          testTwo: testTwoStub
        }
      });

      var myChainImpl = myChain()
        .testOne()
        .testTwo();

      assert.ok(testOneStub.notCalled);
      assert.ok(testTwoStub.notCalled);

      myChainImpl.run('zero', function (err, result) {
        assert.ok(testOneStub.calledOnce);
        assert.ok(testTwoStub.calledOnce);
        assert.equal(initialValue, 'zero');
        assert.equal(result, 'two');
        done();
      });
    });

    it('allows functions to access the result of the last call', function (done) {
      var testOneStub = sinon.stub().callsArgWith(0, null, 'one');
      var testTwoStub = function (done) {
        result = this.previousResult() + 'two';
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

    it('give functions to access to other functions via this.getMethod(functionName).', function (done) {
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
    it('allows you to transform a result', function () {
      var testOneStub = sinon.stub().callsArgWith(0, null, 'boring');

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
        .end(function (err, result) {
          try {
            assert.equal(err, null);
            assert.equal(result, 'onetwo');

            assert.deepEqual(tapOne.firstCall.args, [ null, 'one' ]);
            assert.deepEqual(tapTwo.firstCall.args, [ null, 'onetwo' ]);

            done();
          } catch (e) { done(e); }
        });
    });
  });

});
