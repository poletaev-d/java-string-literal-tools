'use strict';

/** Class representing an interval of 2 numbers (including endpoints)*/
class Interval {
  /**
   * @param {number} start 
   * @param {number} end 
   */
  constructor(start, end) {
    if (start > end) {
        throw start + " > " + end;
    }
    this.start = start;
    this.end = end;
  }

  /**
   * @param {Interval} other
   * @returns {boolean} true if this intersects {@link other}, otherwise false
   */
  intersects(other) {
    return this.start <= other.start && this.end >= other.end
      || this.start >= other.start && this.start <= other.end
      || this.end >= other.start && this.end <= other.end;
  }
}

module.exports.Interval = Interval;