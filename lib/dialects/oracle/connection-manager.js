'use strict';

var ConnectionManager,
    Pool,
    Promise = require('../../promise'),
    sequelizeErrors = require('../../errors');

ConnectionManager = function(dialect, sequelize) {
  var config = sequelize.config;
  console.log(config);
  this.sequelize = sequelize;
  this.config = config;
  this.dialect = dialect;
  this.sequelize.config.port = this.sequelize.config.port || 1521;

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

  if (this.config.pool) {
    if (this.config.pool.stats) {
      connectionConfig._enableStats = true;
    }
  }
  if(config.database && config.database.indexOf('DESCRIPTION=')>=0){
    connectionConfig.connectString=config.database;
  }else{
    connectionConfig.connectString='//'+config.host+':'+config.port+'/'+config.database;
    if (config.pool.drcp) {
      connectionConfig.connectString=connectionConfig.connectString+":POOLED";
    }
  }

  try {
    this.lib = require(sequelize.config.dialectModulePath || 'oracledb');
	this.lib.fetchAsString = [ this.lib.CLOB ];
    this.lib.Promise = Promise; //Using sequelize promise for oracledb promise
    this.lib.connectionClass = config.pool.drcpname;
    this.lib.createPool(connectionConfig).then(function(pool) { Pool = pool });
  } catch (err) {
    throw new Error('Please install oracledb package manually');
  }
  this.onProcessExit = this.onProcessExit.bind(this); // Save a reference to the bound version so we can remove it with removeListener
  process.on('exit', this.onProcessExit);
};

ConnectionManager.prototype.onProcessExit = function() {
	if (Pool) {
  		return Pool.close();
	}
	else {
		
	}
};

ConnectionManager.prototype.close = function () {
  this.onProcessExit();
  process.removeListener('exit', this.onProcessExit); // Remove the listener, so all references to this instance can be garbage collected.
  this.getConnection = function () {
    return Promise.reject(new Error('ConnectionManager.getConnection was called after the connection manager was closed!'));
  };
};

ConnectionManager.prototype.initPools = function () {
  return; //Pool management done by oracledb node module
};

ConnectionManager.prototype.getConnection = function(options) {
  var self = this;
  options = options || {};
  if (this.config.pool) {
    if (this.config.pool.stats) {
      console.log(Pool._logStats());
    }
  }
  return Pool.getConnection();
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
