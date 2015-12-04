var assert = require('chai').assert;
var chainBuilder = require('..');

describe('ChainBuilder', function () {
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

  it('executes immediately');
  it('catches errors');
  it('lets you .tap() into a function while executing')
  it('can load functions from a directory in collaboration with requireDir');
  it('allows functions to access the result of the last call');
  it('allows different error handling methods defined throughout the chain');
  it('allows recovery from an error');
  it('allows different recovery methods defined throughout the chain');
});
