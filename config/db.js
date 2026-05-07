const sql = require("mssql");

const config = {
  connectionString: process.env.SQL_CONNECTION_STRING,
  options: {
    encrypt: true,
    trustServerCertificate: false,
  },
};

const pool = new sql.ConnectionPool(config);
const poolConnect = pool.connect();

module.exports = {
  sql,
  pool,
  poolConnect,
};