"use strict";

var _ = require('lodash');
var assert = require('chai').assert;
var mockery = require('mockery');
var sinon = require('sinon');

describe('Directory Loading', function () {

  var chainBuilder = require('..');

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
