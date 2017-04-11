'use strict';

var ConnectionManager,
    Promise = require('../../promise'),
    sequelizeErrors = require('../../errors');

ConnectionManager = function(dialect, sequelize) {
  var config = sequelize.config;
  this.sequelize = sequelize;
  this.config = config;
  this.dialect = dialect;
  this.sequelize.config.port = this.sequelize.config.port || 1521;
  try {
	  this.lib = require(sequelize.config.dialectModulePath || 'oracledb');
	  this.lib.fetchAsString = [ this.lib.CLOB ];
	  this.lib.Promise = Promise; //Using sequelize promise for oracledb promise
	  this.lib.connectionClass = config.pool.drcpname;
  } catch (err) {
	  throw new Error('Please install oracledb package manually');
  }
  this.onProcessExit = this.onProcessExit.bind(this); // Save a reference to the bound version so we can remove it with removeListener
  process.on('exit', this.onProcessExit);
};

ConnectionManager.prototype.initPools = function() {
	var self = this;
	var config = this.config;
	if (!config.pool) {
		config.pool = {
			idle: 60,
			max: 5,
			min: 1,
			cache: 10
		};
	}
	if (!config.pool.cache) {
		config.pool.cache = 10;
	}
	if (!config.pool.drcpname) {
		config.pool.drcpname = "Node-Sequelize";
	}

	var connectionConfig = {
		user: config.username,
		password: config.password,
		stmtCacheSize: config.pool.cache,
		poolMax: config.pool.max,
		poolMin: config.pool.min,
		poolIncrement: 1,
		poolTimeout: config.pool.idle,
		queueRequests: true
	};

	if (config.pool.stats) {
		connectionConfig._enableStats = true;
	}
	if(config.database && config.database.indexOf('DESCRIPTION=')>=0){
		connectionConfig.connectString=config.database;
	}
	else{
		connectionConfig.connectString='//'+config.host+':'+config.port+'/'+config.database;
		if (config.pool.drcp) {
			connectionConfig.connectString=connectionConfig.connectString+":POOLED";
		}
	}
	self.lib.createPool(connectionConfig);
}

ConnectionManager.prototype.onProcessExit = function() {
  var self = this;
  var pool = self.lib.getPool();
  return pool.close();
};

ConnectionManager.prototype.close = function () {
  this.onProcessExit();
  process.removeListener('exit', this.onProcessExit); // Remove the listener, so all references to this instance can be garbage collected.
  this.getConnection = function () {
    return Promise.reject(new Error('ConnectionManager.getConnection was called after the connection manager was closed!'));
  };
};

ConnectionManager.prototype.getConnection = function(options) {
	var self = this;
	var pool = self.lib.getPool();
	if (self.config.pool) {
		if (self.config.pool.stats) {
			console.log(pool._logStats());
		}
	}
	return pool.getConnection();
};

ConnectionManager.prototype.releaseConnection = function(connection) {
  return connection.close(); //Return connection to pool
};

ConnectionManager.prototype.validate = function(connection) {
  // return connection; // && connection.loggedIn;
  //console.log(connection);
  return connection._invalid === undefined;
};

module.exports = ConnectionManager;
