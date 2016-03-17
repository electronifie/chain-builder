"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Methods', function () {

  var chainBuilder = require('..');

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
