"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Mixins', function () {

  var chainBuilder = require('..');

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
