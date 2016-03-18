"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Logging', function () {
  var chainBuilder = require('..');

  describe('passes a logger with "chainStart", "chainEnd", "callStart" and "callEnd" events', function () {
    var eventTypes, payloads;
    // WARNING: changing anything in this method block (or above) will require the stacktrace tests to be updated
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
      var $endBlock = function (chain, cb) { chain.run('c2', cb); };
      $beginBlock.$beginSubchain = 'block';
      $endBlock.$endSubchain = 'block';

      var testOne = function (arg, cb) { cb(null, arg + '-one'); };
      testOne.$args = [{ type: 'string', default: 'def' }];

      var myChain = chainBuilder({
        enableStack: true,
        methods: {
          testOne: testOne,
          testTwo: function (cb) {
            setTimeout(function () {
              cb(null, 'two');
            }, 10);
          },
          testThree: function (cb) {
            this.newChain().testOne('three').run('c3', cb);
          },
          $beginBlock: $beginBlock,
          $endBlock: $endBlock
        },
        mixins: [ logger ]
      });

      myChain()
        .testOne(function () { return 'a'; })
        .$beginBlock()
          .testOne('b')
          .testTwo()
        .$endBlock()
        .testThree()
        .run('c1', done);
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

    it('provides args', function () {
      payloads[1].args[0] = payloads[1].args[0].toString();
      assert.deepEqual(_.map(payloads, 'args'), [
        undefined,
          ["function () { return 'a'; }"], undefined,
          [], undefined,
          [],
            undefined,
              ['b'], undefined,
              [], undefined,
            undefined,
          undefined,
          [],
            undefined,
              ['three'], undefined,
            undefined,
          undefined,
        undefined
      ]);

      payloads[5].evaluatedArgs[0] = typeof payloads[5].evaluatedArgs[0];
      assert.deepEqual(_.map(payloads, 'evaluatedArgs'), [
        undefined,
          ['a'], undefined,
          [], undefined,
          ['object'], // passed a chain
            undefined,
              ['b'], undefined,
              [], undefined,
            undefined,
          undefined,
          [],
            undefined,
              ['three'], undefined,
            undefined,
          undefined,
        undefined
      ]);
    });

    it('provides initialValue', function () {
      assert.deepEqual(_.map(payloads, 'initialValue'), [
        'c1',
          undefined, undefined,
          undefined, undefined,
          undefined,
            'c2',
              undefined, undefined,
              undefined, undefined,
            undefined,
          undefined,
          undefined,
            'c3',
              undefined, undefined,
            undefined,
          undefined,
        undefined
      ]);
    });

    it('provides the method to be called', function () {
      assert.deepEqual(_.map(payloads, 'method.$beginSubchain'), [
        undefined,
          undefined, undefined,
          'block' , undefined,
          undefined,
            undefined,
              undefined, undefined,
              undefined, undefined,
            undefined,
          undefined,
          undefined,
            undefined,
              undefined, undefined,
            undefined,
          undefined,
        undefined
      ]);
    });

    it('provides "callStack" on callStart and callEnd with the location of the instance\'s method call', function () {
      var stack = _.chain(payloads)
        .map('callStack[0]')
        .map(function (e) { return (e && e.replace(/^.+\(.+\/chainbuilder\/([^)]+)\)$/, '$1')); })
        .value();

      // Note - will break if the beforeEach block changes position.
      assert.deepEqual(stack, [
        undefined,
          'test/logging.js:52:10', 'test/logging.js:52:10',      // testOne
          'test/logging.js:53:10', 'test/logging.js:53:10',      // $beginBlock
          'test/logging.js:56:10',                               // $endBlock
            undefined,
              'test/logging.js:54:12', 'test/logging.js:54:12',  // testOne
              'test/logging.js:55:12', 'test/logging.js:55:12',  // testTwo
            undefined,
          'test/logging.js:56:10',
          'test/logging.js:57:10',                               // testThree
            undefined,
              'test/logging.js:43:29', 'test/logging.js:43:29',  // testOne
            undefined,
          'test/logging.js:57:10',
        undefined
      ]);
    });

    it('provides "execStack" on callEnd with the location of the result-generating-method\'s cb', function () {
      var stack = _.chain(payloads)
        .map('execStack[0]')
        .map(function (e) { return (e && e.replace(/^.+\(.+\/chainbuilder\/([^)]+)\)$/, '$1')); })
        .value();

      // Note - will break if the beforeEach block changes position.
      assert.deepEqual(stack, [
        undefined,
          undefined, 'test/logging.js:30:42',      // testOne
          undefined, 'test/logging.js:25:41',      // $beginBlock
          undefined,
            undefined,
              undefined, 'test/logging.js:30:42',  // testOne
              undefined, 'test/logging.js:39:15',  // testTwo
            undefined,
          'test/logging.js:39:15',                 // $endBlock
          undefined,
            undefined,
              undefined, 'test/logging.js:30:42',  // testOne
            undefined,
          'test/logging.js:30:42',                 // testThree
        undefined
      ]);
    });
  });
});
