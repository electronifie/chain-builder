var _ = require('lodash');
module.exports = function (mapper, done) {
  var result = _.map(this.previousResult(), mapper);
  done(null, result);
};
