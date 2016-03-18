"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Context Methods', function () {

  var chainBuilder = require('..');

  describe('#cleanStacks', function () {
    it('gives you stack traces for the wrapped and current call site', function (done) {
      var extractFile = function (stack) { return (stack||'').replace(/.+(test\/contextMethods.js.+)\)$/, '$1'); }
      var myChain = chainBuilder({
        enableStack: true,
        methods: {
          getStack: function (cb) {
            cb(null, this.cleanStacks());
          }
        }
      });

      myChain()
        .getStack()
        .tap(function (err, result) {
          // This line left blank :-)
          var stacks = this.cleanStacks();

          var getStackCallStackHead = extractFile(result.callStack[0]);
          var getStackExecStackHead = extractFile(result.execStack[0]);
          var tapCallStackHead = extractFile(stacks.callStack[0]);
          var tapExecStackHead = extractFile(stacks.execStack[0]);

          assert.equal(getStackCallStackHead, 'test/contextMethods.js:25:10');
          assert.equal(getStackExecStackHead, 'test/contextMethods.js:19:27');
          assert.equal(tapCallStackHead,      'test/contextMethods.js:26:10');
          assert.equal(tapExecStackHead,      'test/contextMethods.js:28:29');
        })
        .run(done);
    });
  });

});
