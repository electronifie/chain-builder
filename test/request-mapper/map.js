module.exports = function (mapper, done) {
  var result = this.previousResult().map(mapper);
  done(null, result);
};
