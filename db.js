// const mysql = require('mysql2/promise');

// const pool = mysql.createPool({
//   host: 'localhost',
//   user: 'root',
//   password: '',
//   database: 'gold',
//   waitForConnections: true,
//   connectionLimit: 10,
//   queueLimit: 0,
// });

// const query = async (sql, values) => {
//   const [rows, fields] = await pool.execute(sql, values);
//   return rows;
// };

// module.exports = { query };