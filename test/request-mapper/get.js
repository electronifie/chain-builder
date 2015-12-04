var _ = require('lodash');
var http = require('http');
module.exports = function (url, done) {
  http.get(url, function (res) {
    var json = JSON.parse(res.body);
    done(null, json);
  }).on('error', function (e) {
    done(e);
  });
};
