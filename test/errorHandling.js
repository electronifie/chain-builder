"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Error Handling', function () {

  var chainBuilder = require('..');

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
