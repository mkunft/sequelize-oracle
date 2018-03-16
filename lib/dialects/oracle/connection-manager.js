'use strict';

var ConnectionManager,
	_ = require('lodash'),
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
	  /*
	  if (config.pool) {
	  	this.lib.connectionClass = config.pool.drcpname;
	  }		
	  */
  } catch (err) {
	  throw new Error('Please install oracledb package manually');
  }
  this.onProcessExit = this.onProcessExit.bind(this); // Save a reference to the bound version so we can remove it with removeListener
  process.on('exit', this.onProcessExit);
};

ConnectionManager.prototype.initPools = async function() {
	var self = this;
	var config = this.config;
	if (config.pool) {
		var inputPool = config.pool;
		var defaultPool = {
			idle: 60,
			max: 5,
			min: 1,
			cache: 10
		};
		config.pool = _.merge(inputPool, defaultPool);
		if (!config.pool.cache) {
			config.pool.cache = 10;
		}
        /*
		if (!config.pool.drcpname) {
			config.pool.drcpname = "Node-Sequelize";
		}
        */

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
            /*
			if (config.pool.drcp) {
				connectionConfig.connectString=connectionConfig.connectString+":POOLED";
			}
            */
		}
		await self.lib.createPool(connectionConfig);
	}
};

ConnectionManager.prototype.onProcessExit = async function() {
  var self = this;
  if (self.config.pool) {
	  try {
		var pool = await self.lib.getPool();
		return pool.terminate();
	  }
	  catch (err) {
		return;
	  }
  }
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
	var config = this.config;
	return new Promise(async function(resolve, reject) {
		try {
			var pool = await self.lib.getPool();
			if (self.config.pool.stats) {
				self.sequelize.log(pool._logStats());
			}
			await pool.getConnection(function(err, conn) {
				if (err) {
					reject(err);
				}
				resolve(conn);
			});
		}
		catch (err) {
			//reject(err);
			var connectionConfig = {
				user: config.username,
				password: config.password,
			};
			if(config.database && config.database.indexOf('DESCRIPTION=')>=0){
				connectionConfig.connectString=config.database;
			}
			else{
				connectionConfig.connectString='//'+config.host+':'+config.port+'/'+config.database;
			}
			await self.lib.getConnection(connectionConfig, function(err, conn) {
				if (err) {
					reject(err);
				}
				resolve(conn);
			});	
		}
	});
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
