'use strict';
/**
 * 2020 Sylchauf
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

exports.Database = function (settings) {
  this.settings = settings;

  if (!this.settings.url) throw new Error('You must specify a mongodb url');
  if (!this.settings.dbName) throw new Error('You must specify a mongodb database');

  if (!this.settings.collection) this.settings.collection = 'ueberdb';
};

exports.Database.prototype.clearPing = function () {
  if (this.interval) {
    clearInterval(this.interval);
  }
};

exports.Database.prototype.schedulePing = function () {
  this.clearPing();
  this.interval = setInterval(() => {
    this.database.command({
      ping: 1,
    });
  }, 10000);
};

exports.Database.prototype.init = function (callback) {
  const MongoClient = require('mongodb').MongoClient;

  MongoClient.connect(this.settings.url, (err, client) => {
    if (!err) {
      this.client = client;
      this.database = client.db(this.settings.dbName);
      this.collection = this.database.collection(this.settings.collection);
    }

    callback(err);
  });

  this.schedulePing();
};

exports.Database.prototype.get = function (key, callback) {
  this.collection.findOne({_id: key}, (err, document) => {
    if (err) callback(err);
    else callback(null, document ? document.value : null);
  });

  this.schedulePing();
};

exports.Database.prototype.findKeys = function (key, notKey, callback) {
  const selector = {
    $and: [
      {_id: {$regex: `${key.replace(/\*/g, '')}`}},
    ],
  };

  if (notKey) {
    selector.$and.push({_id: {$not: {$regex: `${notKey.replace(/\*/g, '')}`}}});
  }

  this.collection.find(selector, async (err, res) => {
    if (err) {
      callback(err);
    } else {
      const data = await res.toArray();

      callback(null, data.map((i) => i._id));
    }
  });

  this.schedulePing();
};

exports.Database.prototype.set = function (key, value, callback) {
  if (key.length > 100) {
    callback('Your Key can only be 100 chars');
  } else {
    this.collection.update({_id: key}, {$set: {value}}, {upsert: true}, callback);
  }

  this.schedulePing();
};

exports.Database.prototype.remove = function (key, callback) {
  this.collection.remove({_id: key}, callback);

  this.schedulePing();
};

exports.Database.prototype.doBulk = function (bulk, callback) {
  const bulkMongo = this.collection.initializeOrderedBulkOp();

  for (const i in bulk) {
    if (bulk[i].type === 'set') {
      bulkMongo.find({_id: bulk[i].key}).upsert().updateOne({$set: {value: bulk[i].value}});
    } else if (bulk[i].type === 'remove') {
      bulkMongo.find({_id: bulk[i].key}).deleteOne();
    }
  }

  bulkMongo.execute().then((res) => {
    callback(null, res);
  }).catch((error) => {
    callback(error);
  });

  this.schedulePing();
};

exports.Database.prototype.close = function (callback) {
  this.clearPing();
  this.client.close(callback);
};
